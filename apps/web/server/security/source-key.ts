import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

function normalizeIpv4(value: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 4) {
    return null
  }
  const octets = parts.map(Number)
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return octets.join('.')
}

function bucketIpv6(value: string): string {
  const address = value.toLowerCase().split('%')[0]!
  const [left = '', right = ''] = address.split('::')
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const missing = Math.max(0, 8 - leftParts.length - rightParts.length)
  const parts = [...leftParts, ...Array<string>(missing).fill('0'), ...rightParts].map((part) =>
    part.padStart(4, '0'),
  )
  return `${parts.slice(0, 4).join(':')}::/64`
}

export function trustedSourceBucket(xForwardedFor: string | string[] | undefined): string | null {
  const value = Array.isArray(xForwardedFor) ? xForwardedFor.join(',') : xForwardedFor
  if (!value) {
    return null
  }
  const rightmost = value.split(',').at(-1)?.trim()
  if (!rightmost) {
    return null
  }

  const mappedIpv4 = rightmost.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu)?.[1]
  if (mappedIpv4) {
    return normalizeIpv4(mappedIpv4)
  }
  if (isIP(rightmost) === 4) {
    return normalizeIpv4(rightmost)
  }
  if (isIP(rightmost) === 6) {
    return bucketIpv6(rightmost)
  }
  return null
}

export function privateSourceKey(bucket: string, pepper: string): string {
  return createHmac('sha256', pepper).update(bucket).digest('hex')
}
