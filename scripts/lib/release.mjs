import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import {
  azureResourceNames,
  run,
  runtimeSecrets,
  stateDirectory,
} from './orchestrator.mjs'

export const currentReleaseManifestPath = resolve(stateDirectory, 'release.json')
export const previousReleaseManifestPath = resolve(stateDirectory, 'release.previous.json')

const immutableImagePattern = /^.+@sha256:[0-9a-f]{64}$/u
const workloads = ['api', 'web', 'cleanup']

function queryAzure(args, description) {
  const value = run('az', [...args, '--output', 'tsv'], { capture: true })
  if (!value) {
    throw new Error(`Azure did not return ${description}`)
  }
  return value
}

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

function imageDigest(registry, repository, tag) {
  const digest = queryAzure(
    [
      'acr',
      'repository',
      'show',
      '--name',
      registry,
      '--image',
      `${repository}:${tag}`,
      '--query',
      'digest',
    ],
    `${repository} digest`,
  )
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`ACR returned an invalid digest for ${repository}:${tag}`)
  }
  return digest
}

export async function buildAndPushRelease({ allowDirty = false } = {}) {
  const dirty = run('git', ['status', '--porcelain'], { capture: true })
  if (dirty && !allowDirty) {
    throw new Error(
      'Production releases require a clean Git tree. Commit the release or pass --allow-dirty for an explicitly marked dirty build.',
    )
  }

  const revision = run('git', ['rev-parse', '--short=12', 'HEAD'], { capture: true })
  const releaseId = dirty ? `${revision}-dirty` : revision
  const context = azureResourceNames()
  const secrets = runtimeSecrets()
  const loginServer = queryAzure(
    [
      'acr',
      'show',
      '--resource-group',
      context.resourceGroup,
      '--name',
      context.containerRegistry,
      '--query',
      'loginServer',
    ],
    'the registry login server',
  )
  const connectionString = queryAzure(
    [
      'monitor',
      'app-insights',
      'component',
      'show',
      '--resource-group',
      context.resourceGroup,
      '--app',
      context.applicationInsights,
      '--query',
      'connectionString',
    ],
    'the Application Insights connection string',
  )
  const speechEndpoint = queryAzure(
    [
      'cognitiveservices',
      'account',
      'show',
      '--resource-group',
      context.resourceGroup,
      '--name',
      context.speech,
      '--query',
      'properties.endpoint',
    ],
    'the Speech endpoint',
  )
  const taggedImages = {
    web: `${loginServer}/vocabulary-web:${releaseId}`,
    api: `${loginServer}/vocabulary-api:${releaseId}`,
  }

  run('npm', ['run', 'lint'])
  run('npm', ['run', 'typecheck'])
  run('npm', ['test', '--', '--reporter=dot'])
  run('npm', ['audit', '--omit=dev', '--audit-level=high'])
  run('npm', ['run', 'build'], {
    env: {
      ...process.env,
      VITE_APPLICATIONINSIGHTS_CONNECTION_STRING: connectionString,
      VITE_RELEASE: releaseId,
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
    '--build-arg',
    `RELEASE_ID=${releaseId}`,
    '--tag',
    taggedImages.api,
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
    `VITE_RELEASE=${releaseId}`,
    '--build-arg',
    `RELEASE_ID=${releaseId}`,
    '--tag',
    taggedImages.web,
    '.',
  ])

  await testImage(taggedImages.api, 38081, {
    INTERNAL_API_CREDENTIAL: secrets.gatewayApiCredential,
    SPEECH_ENDPOINT: speechEndpoint,
  })
  await testImage(taggedImages.web, 38080, {
    ACCESS_CODE_HASH: secrets.accessCodeHash,
    COOKIE_SIGNING_KEY: secrets.cookieSigningKey,
    RATE_LIMIT_PEPPER: secrets.rateLimitPepper,
    INTERNAL_API_CREDENTIAL: secrets.gatewayApiCredential,
    INTERNAL_API_URL: 'http://host.docker.internal:38081',
  })

  run('az', ['acr', 'login', '--name', context.containerRegistry])
  run('docker', ['push', taggedImages.api])
  run('docker', ['push', taggedImages.web])

  const images = {
    api: `${loginServer}/vocabulary-api@${imageDigest(
      context.containerRegistry,
      'vocabulary-api',
      releaseId,
    )}`,
    web: `${loginServer}/vocabulary-web@${imageDigest(
      context.containerRegistry,
      'vocabulary-web',
      releaseId,
    )}`,
  }

  return {
    context,
    images: { ...images, cleanup: images.web },
    releaseId,
    taggedImages,
  }
}

export function publishBootstrapTags(release) {
  const loginServer = release.images.web.split('/')[0]
  const bootstrapImages = {
    web: `${loginServer}/vocabulary-web:bootstrap`,
    api: `${loginServer}/vocabulary-api:bootstrap`,
  }
  run('docker', ['tag', release.taggedImages.api, bootstrapImages.api])
  run('docker', ['tag', release.taggedImages.web, bootstrapImages.web])
  run('docker', ['push', bootstrapImages.api])
  run('docker', ['push', bootstrapImages.web])
}

function workloadImage(context, kind, name, containerName) {
  const command =
    kind === 'job'
      ? ['containerapp', 'job', 'show']
      : ['containerapp', 'show']
  return queryAzure(
    [
      ...command,
      '--resource-group',
      context.resourceGroup,
      '--name',
      name,
      '--query',
      `properties.template.containers[?name=='${containerName}'].image | [0]`,
    ],
    `${name} image`,
  )
}

export function currentWorkloadImages(context = azureResourceNames()) {
  return {
    api: workloadImage(context, 'app', context.apiApp, 'speech-api'),
    web: workloadImage(context, 'app', context.webApp, 'gateway'),
    cleanup: workloadImage(context, 'job', context.cleanupJob, 'cleanup'),
  }
}

export function workloadsProvisioned(context = azureResourceNames()) {
  const appNames = run(
    'az',
    [
      'containerapp',
      'list',
      '--resource-group',
      context.resourceGroup,
      '--query',
      "[?name=='vocabulary-web' || name=='vocabulary-api'].name",
      '--output',
      'tsv',
    ],
    { capture: true },
  )
    .split('\n')
    .filter(Boolean)
  const jobNames = run(
    'az',
    [
      'containerapp',
      'job',
      'list',
      '--resource-group',
      context.resourceGroup,
      '--query',
      "[?name=='vocabulary-cleanup'].name",
      '--output',
      'tsv',
    ],
    { capture: true },
  )
    .split('\n')
    .filter(Boolean)
  return (
    appNames.includes(context.webApp) &&
    appNames.includes(context.apiApp) &&
    jobNames.includes(context.cleanupJob)
  )
}

function assertImmutableImages(images) {
  const keys = Object.keys(images).sort()
  if (keys.join(',') !== [...workloads].sort().join(',')) {
    throw new Error('The image set must contain exactly api, web, and cleanup')
  }
  for (const workload of workloads) {
    const image = images[workload]
    if (!immutableImagePattern.test(image)) {
      throw new Error(`${workload} must use a fully qualified immutable image digest`)
    }
  }
}

export function showImagePlan(current, next, heading = 'Release image changes') {
  process.stdout.write(`${heading}:\n`)
  for (const workload of workloads) {
    process.stdout.write(`  ${workload}: ${current[workload]}\n`)
    process.stdout.write(`       -> ${next[workload]}\n`)
  }
}

function updateWorkload(context, workload, image) {
  const definitions = {
    api: {
      command: ['containerapp', 'update'],
      name: context.apiApp,
      container: 'speech-api',
    },
    web: {
      command: ['containerapp', 'update'],
      name: context.webApp,
      container: 'gateway',
    },
    cleanup: {
      command: ['containerapp', 'job', 'update'],
      name: context.cleanupJob,
      container: 'cleanup',
    },
  }
  const definition = definitions[workload]
  run('az', [
    ...definition.command,
    '--resource-group',
    context.resourceGroup,
    '--name',
    definition.name,
    '--container-name',
    definition.container,
    '--image',
    image,
    '--only-show-errors',
    '--output',
    'none',
  ])
}

function imagesEqual(left, right) {
  return workloads.every((workload) => left[workload] === right[workload])
}

export function deployWorkloadImages(context, next, previous = currentWorkloadImages(context)) {
  assertImmutableImages(next)
  if (!imagesEqual(currentWorkloadImages(context), previous)) {
    throw new Error(
      'Live workload images changed after the release plan was created; review a new plan.',
    )
  }
  const updated = []
  try {
    for (const workload of workloads) {
      if (previous[workload] === next[workload]) {
        continue
      }
      updateWorkload(context, workload, next[workload])
      updated.push(workload)
    }
    const deployed = currentWorkloadImages(context)
    if (!imagesEqual(deployed, next)) {
      throw new Error('Azure did not converge to the approved image set')
    }
  } catch (error) {
    const rollbackErrors = []
    for (const workload of updated.reverse()) {
      try {
        updateWorkload(context, workload, previous[workload])
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    try {
      if (!imagesEqual(currentWorkloadImages(context), previous)) {
        rollbackErrors.push(new Error('Azure did not converge to the pre-release image set'))
      }
    } catch (rollbackVerificationError) {
      rollbackErrors.push(rollbackVerificationError)
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Image deployment failed and automatic rollback was incomplete',
      )
    }
    throw new Error('Image deployment failed; changed workloads were restored', {
      cause: error,
    })
  }
}

function manifestRecord(releaseId, images) {
  return {
    version: 1,
    releaseId,
    recordedAt: new Date().toISOString(),
    images,
  }
}

function writeManifest(path, value) {
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporaryPath, path)
  chmodSync(path, 0o600)
}

export function readReleaseManifest(path) {
  if (!existsSync(path)) {
    throw new Error(`Release manifest ${path} does not exist`)
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (
    manifest?.version !== 1 ||
    typeof manifest.releaseId !== 'string' ||
    typeof manifest.images !== 'object'
  ) {
    throw new Error(`Release manifest ${path} is invalid`)
  }
  assertImmutableImages(manifest.images)
  return manifest
}

export function recordRelease(releaseId, images, previousImages) {
  assertImmutableImages(images)
  const priorCurrent = existsSync(currentReleaseManifestPath)
    ? readReleaseManifest(currentReleaseManifestPath)
    : null
  const previousImagesAreImmutable = workloads.every((workload) =>
    immutableImagePattern.test(previousImages[workload]),
  )
  if (previousImagesAreImmutable) {
    const previousRecord =
      priorCurrent && imagesEqual(priorCurrent.images, previousImages)
        ? priorCurrent
        : manifestRecord('previous-live-release', previousImages)
    writeManifest(previousReleaseManifestPath, previousRecord)
  } else if (existsSync(previousReleaseManifestPath)) {
    unlinkSync(previousReleaseManifestPath)
  }
  writeManifest(currentReleaseManifestPath, manifestRecord(releaseId, images))
}
