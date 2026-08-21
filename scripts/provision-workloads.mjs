import { resolve } from 'node:path'
import {
  deploymentSecrets,
  prepareLocalState,
  requireCommand,
  run,
  setTerraformBoolean,
  showAndApprovePlan,
  stateDirectory,
  terraform,
  terraformBoolean,
  verifyAzureContext,
} from './lib/orchestrator.mjs'
import {
  buildAndPushRelease,
  currentWorkloadImages,
  deployWorkloadImages,
  publishBootstrapTags,
  recordRelease,
  workloadsProvisioned,
} from './lib/release.mjs'

async function main() {
  for (const command of ['az', 'terraform', 'docker', 'git', 'npm', 'security']) {
    requireCommand(command, command === 'security' ? ['help'] : ['--version'])
  }
  prepareLocalState()
  verifyAzureContext()
  if (terraformBoolean('deploy_workloads')) {
    throw new Error(
      'Workloads are already enabled in the local infrastructure config; use npm run azure:deploy.',
    )
  }
  if (workloadsProvisioned()) {
    throw new Error(
      'Container Apps are already provisioned; use npm run azure:deploy for releases.',
    )
  }

  const release = await buildAndPushRelease({
    allowDirty: process.argv.includes('--allow-dirty'),
  })
  publishBootstrapTags(release)

  const terraformEnvironment = { ...process.env, ...deploymentSecrets() }
  const planPath = resolve(stateDirectory, 'workloads.tfplan')
  terraform(
    ['plan', '-input=false', '-var', 'deploy_workloads=true', '-out', planPath],
    { env: terraformEnvironment },
  )
  if (!(await showAndApprovePlan(planPath, terraformEnvironment))) {
    throw new Error('Initial workload infrastructure plan was not approved')
  }
  terraform(['apply', '-input=false', planPath], { env: terraformEnvironment })
  setTerraformBoolean('deploy_workloads', true)

  const bootstrapImages = currentWorkloadImages(release.context)
  deployWorkloadImages(release.context, release.images, bootstrapImages)
  recordRelease(release.releaseId, release.images, bootstrapImages)
  run('node', ['scripts/smoke-azure.mjs'])
  process.stdout.write(
    'Workload infrastructure is provisioned and pinned to immutable images. Future releases do not invoke Terraform.\n',
  )
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Provisioning failed'}\n`)
  process.exitCode = 1
})
