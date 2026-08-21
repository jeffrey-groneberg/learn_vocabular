import { TableClient } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'
import { startNodeTelemetry } from '@vocabulary/observability/node'

interface ExpiringLockout {
  partitionKey: string
  rowKey: string
  expiresAt?: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

async function cleanup(): Promise<void> {
  startNodeTelemetry('vocabulary-maintenance')
  const client = new TableClient(
    requiredEnvironment('STORAGE_TABLE_ENDPOINT'),
    process.env.STORAGE_TABLE_NAME ?? 'ratelimits',
    new DefaultAzureCredential(),
  )
  const now = Date.now()

  for await (const entity of client.listEntities<ExpiringLockout>({
    queryOptions: { filter: "PartitionKey eq 'source'" },
  })) {
    if (
      typeof entity.expiresAt === 'string' &&
      Number.isFinite(Date.parse(entity.expiresAt)) &&
      Date.parse(entity.expiresAt) <= now
    ) {
      await client.deleteEntity(entity.partitionKey, entity.rowKey, { etag: '*' })
    }
  }
}

await cleanup().catch(() => {
  console.error('maintenance-failed')
  process.exitCode = 1
})
