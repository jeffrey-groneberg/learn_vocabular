import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000

interface SessionPayload {
  v: 1
  iat: number
  exp: number
  nonce: string
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function createSessionToken(key: string, now = new Date()): {
  token: string
  expiresAt: Date
} {
  const expiresAt = new Date(now.getTime() + sessionLifetimeMs)
  const payload: SessionPayload = {
    v: 1,
    iat: now.getTime(),
    exp: expiresAt.getTime(),
    nonce: randomBytes(18).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${encoded}.${sign(encoded, key)}`, expiresAt }
}

export function verifySessionToken(token: string, key: string, now = new Date()): boolean {
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) {
    return false
  }

  const expectedSignature = Buffer.from(sign(encoded, key))
  const actualSignature = Buffer.from(suppliedSignature)
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return false
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>
    return (
      payload.v === 1 &&
      Number.isSafeInteger(payload.iat) &&
      Number.isSafeInteger(payload.exp) &&
      typeof payload.nonce === 'string' &&
      payload.nonce.length >= 16 &&
      (payload.iat as number) <= now.getTime() &&
      (payload.exp as number) > now.getTime() &&
      (payload.exp as number) - (payload.iat as number) === sessionLifetimeMs
    )
  } catch {
    return false
  }
}
