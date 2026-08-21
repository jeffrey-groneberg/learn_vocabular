import { afterEach, describe, expect, it } from 'vitest'
import { buildGateway } from '../app.js'
import type { GatewayConfig } from '../config.js'
import { createAccessCodeHash, verifyAccessCode } from './access-code.js'
import { MemoryLockoutStore } from './lockout.js'
import { createSessionToken, verifySessionToken } from './session-token.js'
import { privateSourceKey, trustedSourceBucket } from './source-key.js'

const apps: Awaited<ReturnType<typeof buildGateway>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('family access code', () => {
  it('uses a salted scrypt hash and constant-time digest comparison', async () => {
    const encoded = await createAccessCodeHash('family code')
    expect(encoded).not.toContain('family code')
    await expect(verifyAccessCode('family code', encoded)).resolves.toBe(true)
    await expect(verifyAccessCode('wrong', encoded)).resolves.toBe(false)
  })
})

describe('fixed session token', () => {
  it('expires exactly 30 days after issue and rejects changes', () => {
    const issued = new Date('2026-01-01T00:00:00.000Z')
    const session = createSessionToken('a-secure-cookie-key', issued)
    expect(verifySessionToken(session.token, 'a-secure-cookie-key', new Date('2026-01-30T23:59:59Z'))).toBe(true)
    expect(verifySessionToken(session.token, 'a-secure-cookie-key', session.expiresAt)).toBe(false)
    expect(verifySessionToken(`${session.token}x`, 'a-secure-cookie-key', issued)).toBe(false)
  })
})

describe('trusted source parsing', () => {
  it('uses only the rightmost ACA-appended address and buckets IPv6 to /64', () => {
    expect(trustedSourceBucket('198.51.100.99, 203.0.113.7')).toBe('203.0.113.7')
    expect(trustedSourceBucket('forged, 2001:db8:abcd:42:1234::8')).toBe('2001:0db8:abcd:0042::/64')
    expect(trustedSourceBucket('not-an-address')).toBeNull()
    expect(privateSourceKey('203.0.113.7', 'pepper')).not.toContain('203.0.113.7')
  })
})

describe('gateway lockout', () => {
  it('blocks the fifth failure and forged left-side forwarding values cannot bypass it', async () => {
    const config: GatewayConfig = {
      accessCodeHash: await createAccessCodeHash('correct'),
      cookieSigningKey: 'cookie-signing-key-at-least-32-bytes',
      rateLimitPepper: 'rate-limit-pepper-at-least-32-bytes',
      internalApiCredential: 'gateway-api-key-at-least-32-bytes',
      internalApiUrl: 'http://127.0.0.1:9',
      storageTableName: 'ratelimits',
      production: false,
      port: 0,
    }
    const app = await buildGateway(config, new MemoryLockoutStore())
    apps.push(app)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          'x-forwarded-for': `${attempt}.0.0.1, 203.0.113.20`,
        },
        payload: { code: 'wrong' },
      })
      expect(response.statusCode).toBe(attempt === 5 ? 429 : 401)
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': 'new-forgery, 203.0.113.20',
      },
      payload: { code: 'correct' },
    })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.headers['retry-after']).toBeDefined()
  })
})
