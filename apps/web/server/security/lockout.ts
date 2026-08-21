import { TableClient, type TableEntity } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'

const failureWindowMs = 15 * 60 * 1_000
const blockedDurationMs = 30 * 60 * 1_000
const maximumFailures = 5

interface LockoutEntity extends TableEntity {
  failures: number
  windowStartedAt: string
  blockedUntil?: string
  expiresAt: string
}

export interface LockoutStatus {
  blocked: boolean
  retryAfterSeconds?: number
}

export interface LockoutStore {
  status(key: string, now: Date): Promise<LockoutStatus>
  failure(key: string, now: Date): Promise<LockoutStatus>
  clear(key: string): Promise<void>
}

function statusFromEntity(entity: LockoutEntity | undefined, now: Date): LockoutStatus {
  if (!entity?.blockedUntil) {
    return { blocked: false }
  }
  const remainingMs = new Date(entity.blockedUntil).getTime() - now.getTime()
  return remainingMs > 0
    ? { blocked: true, retryAfterSeconds: Math.ceil(remainingMs / 1_000) }
    : { blocked: false }
}

export class MemoryLockoutStore implements LockoutStore {
  private readonly records = new Map<string, LockoutEntity>()

  async status(key: string, now: Date): Promise<LockoutStatus> {
    return statusFromEntity(this.records.get(key), now)
  }

  async failure(key: string, now: Date): Promise<LockoutStatus> {
    const current = this.records.get(key)
    const activeStatus = statusFromEntity(current, now)
    if (activeStatus.blocked) {
      return activeStatus
    }

    const windowExpired =
      !current || now.getTime() - new Date(current.windowStartedAt).getTime() >= failureWindowMs
    const failures = windowExpired ? 1 : current.failures + 1
    const blockedUntil =
      failures >= maximumFailures
        ? new Date(now.getTime() + blockedDurationMs).toISOString()
        : undefined
    const entity: LockoutEntity = {
      partitionKey: 'source',
      rowKey: key,
      failures,
      windowStartedAt: windowExpired ? now.toISOString() : current.windowStartedAt,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000).toISOString(),
      ...(blockedUntil ? { blockedUntil } : {}),
    }
    this.records.set(key, entity)
    return statusFromEntity(entity, now)
  }

  async clear(key: string): Promise<void> {
    this.records.delete(key)
  }
}

export class AzureTableLockoutStore implements LockoutStore {
  private readonly client: TableClient

  constructor(endpoint: string, tableName: string) {
    this.client = new TableClient(endpoint, tableName, new DefaultAzureCredential())
  }

  private async get(key: string): Promise<LockoutEntity | undefined> {
    try {
      return await this.client.getEntity<LockoutEntity>('source', key)
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 404
      ) {
        return undefined
      }
      throw error
    }
  }

  async status(key: string, now: Date): Promise<LockoutStatus> {
    return statusFromEntity(await this.get(key), now)
  }

  async failure(key: string, now: Date): Promise<LockoutStatus> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const current = await this.get(key)
      const activeStatus = statusFromEntity(current, now)
      if (activeStatus.blocked) {
        return activeStatus
      }

      const windowExpired =
        !current || now.getTime() - new Date(current.windowStartedAt).getTime() >= failureWindowMs
      const failures = windowExpired ? 1 : current.failures + 1
      const blockedUntil =
        failures >= maximumFailures
          ? new Date(now.getTime() + blockedDurationMs).toISOString()
          : undefined
      const next: LockoutEntity = {
        partitionKey: 'source',
        rowKey: key,
        failures,
        windowStartedAt: windowExpired ? now.toISOString() : current.windowStartedAt,
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000).toISOString(),
        ...(blockedUntil ? { blockedUntil } : {}),
      }

      try {
        if (current) {
          if (typeof current.etag !== 'string') {
            throw new Error('Lockout record is missing an entity tag')
          }
          await this.client.updateEntity(next, 'Replace', { etag: current.etag })
        } else {
          await this.client.createEntity(next)
        }
        return statusFromEntity(next, now)
      } catch (error) {
        const conflict =
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          (error.statusCode === 409 || error.statusCode === 412)
        if (!conflict || attempt === 5) {
          throw error
        }
      }
    }
    throw new Error('Could not update lockout record')
  }

  async clear(key: string): Promise<void> {
    await this.client.deleteEntity('source', key, { etag: '*' }).catch((error) => {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('statusCode' in error) ||
        error.statusCode !== 404
      ) {
        throw error
      }
    })
  }
}
