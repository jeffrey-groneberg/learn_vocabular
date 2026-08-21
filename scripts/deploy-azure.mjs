import {
  confirm,
  prepareLocalState,
  requireCommand,
  run,
  terraformBoolean,
  verifyAzureContext,
} from './lib/orchestrator.mjs'
import {
  buildAndPushRelease,
  currentWorkloadImages,
  deployWorkloadImages,
  recordRelease,
  showImagePlan,
  workloadsProvisioned,
} from './lib/release.mjs'

async function main() {
  for (const command of ['az', 'docker', 'git', 'npm', 'security']) {
    requireCommand(command, command === 'security' ? ['help'] : ['--version'])
  }
  prepareLocalState()
  verifyAzureContext()

  if (!terraformBoolean('deploy_workloads')) {
    throw new Error(
      'The local infrastructure config does not mark workloads as provisioned; run npm run azure:provision-workloads.',
    )
  }
  if (!workloadsProvisioned()) {
    throw new Error(
      'Azure workloads are not provisioned; run npm run azure:provision-workloads once.',
    )
  }

  const previousImages = currentWorkloadImages()
  const release = await buildAndPushRelease({
    allowDirty: process.argv.includes('--allow-dirty'),
  })
  showImagePlan(previousImages, release.images)
  if (!(await confirm('Review the immutable Container Apps release above.', 'deploy'))) {
    throw new Error('Release was not approved')
  }

  deployWorkloadImages(release.context, release.images, previousImages)
  recordRelease(release.releaseId, release.images, previousImages)
  run('node', ['scripts/smoke-azure.mjs'])
  process.stdout.write(
    `Release ${release.releaseId} deployed directly to Container Apps. Terraform was not invoked.\n`,
  )
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Deployment failed'}\n`)
  process.exitCode = 1
})
