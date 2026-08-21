import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'

const keyLength = 64
const defaultCost = 16_384
const defaultBlockSize = 8
const defaultParallelization = 1

interface ParsedHash {
  cost: number
  blockSize: number
  parallelization: number
  salt: Buffer
  digest: Buffer
}

function parseAccessCodeHash(encoded: string): ParsedHash | null {
  const parts = encoded.split('$')
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v=1') {
    return null
  }

  const cost = Number(parts[2]?.replace('N=', ''))
  const blockSize = Number(parts[3]?.replace('r=', ''))
  const parallelization = Number(parts[4]?.replace('p=', ''))
  const salt = Buffer.from(parts[5] ?? '', 'base64url')
  const digest = Buffer.from(parts[6] ?? '', 'base64url')

  if (
    !Number.isInteger(cost) ||
    cost < 2 ** 14 ||
    cost > 2 ** 20 ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) ||
    blockSize < 1 ||
    blockSize > 32 ||
    !Number.isInteger(parallelization) ||
    parallelization < 1 ||
    parallelization > 16 ||
    salt.length < 16 ||
    digest.length !== keyLength
  ) {
    return null
  }

  return { cost, blockSize, parallelization, salt, digest }
}

async function derive(
  code: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      code.normalize('NFC'),
      salt,
      keyLength,
      {
        cost,
        blockSize,
        parallelization,
        maxmem: Math.max(64 * 1024 * 1024, 256 * cost * blockSize),
      },
      (error, derivedKey) => {
        if (error) {
          reject(error)
        } else {
          resolve(derivedKey)
        }
      },
    )
  })
}

export async function createAccessCodeHash(code: string): Promise<string> {
  if (code.length === 0) {
    throw new Error('The family access code must not be empty')
  }
  const salt = randomBytes(24)
  const digest = await derive(
    code,
    salt,
    defaultCost,
    defaultBlockSize,
    defaultParallelization,
  )
  return [
    'scrypt',
    'v=1',
    `N=${defaultCost}`,
    `r=${defaultBlockSize}`,
    `p=${defaultParallelization}`,
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$')
}

export async function verifyAccessCode(code: string, encoded: string): Promise<boolean> {
  const parsed = parseAccessCodeHash(encoded)
  if (!parsed) {
    return false
  }
  const candidate = await derive(
    code,
    parsed.salt,
    parsed.cost,
    parsed.blockSize,
    parsed.parallelization,
  )
  return timingSafeEqual(candidate, parsed.digest)
}
