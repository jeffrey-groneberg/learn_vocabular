import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  deploymentSecrets,
  outputValue,
  prepareLocalState,
  requireCommand,
  run,
  showAndApprovePlan,
  stateDirectory,
  terraform,
  terraformOutput,
  verifyAzureContext,
} from './lib/orchestrator.mjs'

const manifestPath = resolve(stateDirectory, 'image-digests.tfvars.json')
const previousManifestPath = resolve(stateDirectory, 'image-digests.previous.json')

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Container startup can take a few seconds.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  throw new Error(`Local health check failed for ${url}`)
}

async function testImage(image, port, environment) {
  const containerId = run(
    'docker',
    [
      'run',
      '--detach',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '--publish',
      `${port}:8080`,
      ...Object.keys(environment).flatMap((name) => ['--env', name]),
      image,
    ],
    { capture: true, env: { ...process.env, ...environment } },
  )
  try {
    await waitForHealth(`http://127.0.0.1:${port}/health/live`)
  } finally {
    run('docker', ['rm', '--force', containerId])
  }
}

async function main() {
  for (const command of ['az', 'terraform', 'docker', 'git', 'npm']) {
    requireCommand(command)
  }
  prepareLocalState()
  verifyAzureContext()

  const dirty = run('git', ['status', '--porcelain'], { capture: true })
  const allowDirty = process.argv.includes('--allow-dirty')
  if (dirty && !allowDirty) {
    throw new Error(
      'Production releases require a clean Git tree. Commit the release or pass --allow-dirty for an explicitly marked dirty build.',
    )
  }
  const revision = run('git', ['rev-parse', '--short=12', 'HEAD'], { capture: true })
  const tag = dirty ? `${revision}-dirty` : revision
  const secrets = deploymentSecrets()
  const outputs = terraformOutput()
  const loginServer = outputValue(outputs, 'acr_login_server')
  const resources = outputValue(outputs, 'resource_names')
  const connectionString = outputValue(outputs, 'application_insights_connection_string')
  const webImage = `${loginServer}/vocabulary-web:${tag}`
  const apiImage = `${loginServer}/vocabulary-api:${tag}`

  run('npm', ['run', 'lint'])
  run('npm', ['run', 'typecheck'])
  run('npm', ['test', '--', '--reporter=dot'])
  run('npm', ['audit', '--omit=dev', '--audit-level=high'])
  run('npm', ['run', 'build'], {
    env: {
      ...process.env,
      VITE_APPLICATIONINSIGHTS_CONNECTION_STRING: connectionString,
      VITE_RELEASE: tag,
    },
  })
  run('docker', ['buildx', 'inspect', '--bootstrap'])
  run('docker', [
    'buildx',
    'build',
    '--platform',
    'linux/amd64',
    '--load',
    '--file',
    'apps/api/Dockerfile',
    '--tag',
    apiImage,
    '.',
  ])
  run('docker', [
    'buildx',
    'build',
    '--platform',
    'linux/amd64',
    '--load',
    '--file',
    'apps/web/Dockerfile',
    '--build-arg',
    `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING=${connectionString}`,
    '--build-arg',
    `VITE_RELEASE=${tag}`,
    '--tag',
    webImage,
    '.',
  ])

  const localEnvironment = {
    INTERNAL_API_CREDENTIAL: secrets.TF_VAR_gateway_api_credential,
    SPEECH_ENDPOINT: outputValue(outputs, 'speech_endpoint'),
  }
  await testImage(apiImage, 38081, localEnvironment)
  await testImage(webImage, 38080, {
    ACCESS_CODE_HASH: secrets.TF_VAR_access_code_hash,
    COOKIE_SIGNING_KEY: secrets.TF_VAR_cookie_signing_key,
    RATE_LIMIT_PEPPER: secrets.TF_VAR_rate_limit_pepper,
    INTERNAL_API_CREDENTIAL: secrets.TF_VAR_gateway_api_credential,
    INTERNAL_API_URL: 'http://host.docker.internal:38081',
  })

  run('az', ['acr', 'login', '--name', resources.container_registry])
  run('docker', ['push', apiImage])
  run('docker', ['push', webImage])
  const apiDigest = run(
    'az',
    [
      'acr',
      'repository',
      'show',
      '--name',
      resources.container_registry,
      '--image',
      `vocabulary-api:${tag}`,
      '--query',
      'digest',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
  const webDigest = run(
    'az',
    [
      'acr',
      'repository',
      'show',
      '--name',
      resources.container_registry,
      '--image',
      `vocabulary-web:${tag}`,
      '--query',
      'digest',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
  if (!/^sha256:[0-9a-f]{64}$/u.test(apiDigest) || !/^sha256:[0-9a-f]{64}$/u.test(webDigest)) {
    throw new Error('ACR did not return valid immutable image digests')
  }
  if (existsSync(manifestPath)) {
    copyFileSync(manifestPath, previousManifestPath)
  }
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        deploy_workloads: true,
        provision_secrets: true,
        web_image_digest: `${loginServer}/vocabulary-web@${webDigest}`,
        api_image_digest: `${loginServer}/vocabulary-api@${apiDigest}`,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )

  const terraformEnvironment = { ...process.env, ...secrets }
  const planPath = resolve(stateDirectory, 'release.tfplan')
  terraform(
    ['plan', '-input=false', '-var-file', manifestPath, '-out', planPath],
    { env: terraformEnvironment },
  )
  if (!(await showAndApprovePlan(planPath, terraformEnvironment))) {
    throw new Error('Release plan was not approved')
  }
  terraform(['apply', '-input=false', planPath], { env: terraformEnvironment })

  run('node', ['scripts/smoke-azure.mjs'])
  process.stdout.write(
    `Release ${tag} deployed by immutable digest. The previous manifest is retained for reviewed rollback.\n`,
  )
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Deployment failed'}\n`)
  process.exitCode = 1
})
