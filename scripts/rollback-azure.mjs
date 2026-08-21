import {
  azureResourceNames,
  confirm,
  prepareLocalState,
  requireCommand,
  run,
  verifyAzureContext,
} from './lib/orchestrator.mjs'
import {
  currentWorkloadImages,
  deployWorkloadImages,
  previousReleaseManifestPath,
  readReleaseManifest,
  recordRelease,
  showImagePlan,
} from './lib/release.mjs'

async function main() {
  requireCommand('az')
  prepareLocalState()
  verifyAzureContext()

  const context = azureResourceNames()
  const currentImages = currentWorkloadImages(context)
  const target = readReleaseManifest(previousReleaseManifestPath)
  showImagePlan(currentImages, target.images, 'Rollback image changes')
  if (!(await confirm('Review the immutable Container Apps rollback above.', 'rollback'))) {
    throw new Error('Rollback was not approved')
  }

  deployWorkloadImages(context, target.images, currentImages)
  recordRelease(target.releaseId, target.images, currentImages)
  run('node', ['scripts/smoke-azure.mjs'])
  process.stdout.write(
    `Rollback to ${target.releaseId} completed directly through Container Apps.\n`,
  )
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Rollback failed'}\n`)
  process.exitCode = 1
})
