import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  repoRoot,
  requireCommand,
  run,
  runtimeSecrets,
} from './lib/orchestrator.mjs'

const children = []
let receivedSignal
let resolveStopSignal
const stoppedBySignal = new Promise((resolveSignal) => {
  resolveStopSignal = resolveSignal
})

function handleSignal(signal) {
  receivedSignal = signal
  resolveStopSignal({ signal })
}

process.once('SIGINT', () => handleSignal('SIGINT'))
process.once('SIGTERM', () => handleSignal('SIGTERM'))

function configuredPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535`)
  }
  return value
}

function requiredPair(firstName, secondName) {
  const first = process.env[firstName]
  const second = process.env[secondName]
  if (!first || !second) {
    throw new Error(
      `Set SPEECH_ENDPOINT, or set both ${firstName} and ${secondName} in .env.azure.local`,
    )
  }
  return [first, second]
}

function localRuntimeSecrets() {
  const configured = {
    accessCodeHash: process.env.ACCESS_CODE_HASH,
    cookieSigningKey: process.env.COOKIE_SIGNING_KEY,
    rateLimitPepper: process.env.RATE_LIMIT_PEPPER,
    gatewayApiCredential:
      process.env.INTERNAL_API_CREDENTIAL ??
      process.env.GATEWAY_API_CREDENTIAL,
  }
  const configuredValues = Object.values(configured)
  if (configuredValues.every(Boolean)) {
    return configured
  }
  if (configuredValues.some(Boolean)) {
    throw new Error(
      'Set all four runtime secrets in the environment, or remove them so the launcher can read all four from macOS Keychain.',
    )
  }
  return runtimeSecrets()
}

function speechEndpoint() {
  if (process.env.SPEECH_ENDPOINT) {
    return process.env.SPEECH_ENDPOINT
  }
  const [resourceGroup, account] = requiredPair(
    'AZURE_SPEECH_RESOURCE_GROUP',
    'AZURE_SPEECH_ACCOUNT',
  )
  return run(
    'az',
    [
      'cognitiveservices',
      'account',
      'show',
      '--resource-group',
      resourceGroup,
      '--name',
      account,
      '--query',
      'properties.endpoint',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
}

function startService(name, command, args, environment) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: environment,
    stdio: 'inherit',
  })
  const exited = new Promise((resolveExit) => {
    child.once('error', (error) => {
      resolveExit({ name, error })
    })
    child.once('exit', (code, signal) => {
      resolveExit({ name, code, signal })
    })
  })
  children.push({ name, child, exited })
  return child
}

async function waitForHealth(name, child, url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (receivedSignal) {
      throw new Error(`Startup cancelled by ${receivedSignal}`)
    }
    if (child.exitCode !== null) {
      throw new Error(`${name} stopped before becoming ready`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        return
      }
    } catch {
      // The service is still starting.
    }
    await delay(250)
  }
  throw new Error(`${name} did not become ready at ${url}`)
}

async function stopChildren() {
  for (const { child } of children) {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
    }
  }
  await Promise.race([
    Promise.all(children.map(({ exited }) => exited)),
    delay(5_000),
  ])
  for (const { child } of children) {
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }
}

async function main() {
  requireCommand('az')
  const account = JSON.parse(
    run('az', ['account', 'show', '--output', 'json'], { capture: true }),
  )
  if (
    process.env.AZURE_SUBSCRIPTION_ID &&
    account.id.toLowerCase() !==
      process.env.AZURE_SUBSCRIPTION_ID.toLowerCase()
  ) {
    throw new Error(
      `Azure CLI is using subscription ${account.id}, not configured subscription ${process.env.AZURE_SUBSCRIPTION_ID}`,
    )
  }

  const endpoint = speechEndpoint()
  if (!endpoint) {
    throw new Error('The configured Speech resource has no endpoint')
  }
  const secrets = localRuntimeSecrets()
  const apiPort = configuredPort('LOCAL_API_PORT', 3001)
  const gatewayPort = configuredPort('LOCAL_GATEWAY_PORT', 3000)
  const webPort = configuredPort('LOCAL_WEB_PORT', 5173)
  const webHost = process.env.LOCAL_WEB_HOST ?? '127.0.0.1'
  const executable = (name) =>
    resolve(repoRoot, 'node_modules', '.bin', name)

  process.stdout.write(
    `Azure context: ${account.name} (${account.id}), tenant ${account.tenantId}\n`,
  )
  process.stdout.write('Building shared packages...\n')
  run('npm', ['run', 'build', '--workspace', '@vocabulary/domain'])
  run('npm', ['run', 'build', '--workspace', '@vocabulary/observability'])

  const baseEnvironment = {
    ...process.env,
    NODE_ENV: 'development',
  }
  const api = startService(
    'Speech API',
    executable('tsx'),
    ['watch', 'apps/api/src/index.ts'],
    {
      ...baseEnvironment,
      PORT: String(apiPort),
      INTERNAL_API_CREDENTIAL: secrets.gatewayApiCredential,
      SPEECH_ENDPOINT: endpoint,
    },
  )
  await waitForHealth(
    'Speech API',
    api,
    `http://127.0.0.1:${apiPort}/health/live`,
  )

  const gateway = startService(
    'Gateway',
    executable('tsx'),
    ['watch', 'apps/web/server/index.ts'],
    {
      ...baseEnvironment,
      PORT: String(gatewayPort),
      ACCESS_CODE_HASH: secrets.accessCodeHash,
      COOKIE_SIGNING_KEY: secrets.cookieSigningKey,
      RATE_LIMIT_PEPPER: secrets.rateLimitPepper,
      INTERNAL_API_CREDENTIAL: secrets.gatewayApiCredential,
      INTERNAL_API_URL: `http://127.0.0.1:${apiPort}`,
      SESSION_COOKIE_NAME:
        process.env.SESSION_COOKIE_NAME ?? 'vocabulary-voice-tutor-local',
      SESSION_COOKIE_SECURE:
        process.env.SESSION_COOKIE_SECURE ?? 'false',
    },
  )
  await waitForHealth(
    'Gateway',
    gateway,
    `http://127.0.0.1:${gatewayPort}/health/live`,
  )

  const web = startService(
    'Vite',
    executable('vite'),
    ['apps/web', '--config', 'apps/web/vite.config.ts'],
    {
      ...baseEnvironment,
      GATEWAY_PROXY_URL: `http://127.0.0.1:${gatewayPort}`,
      VITE_DEV_HOST: webHost,
      VITE_DEV_PORT: String(webPort),
    },
  )
  await waitForHealth('Vite', web, `http://127.0.0.1:${webPort}/`)

  process.stdout.write(
    `\nAzure-backed tutor ready at http://${webHost}:${webPort}\nPress Ctrl+C to stop all three services.\n`,
  )

  const result = await Promise.race([
    stoppedBySignal,
    ...children.map(({ exited }) => exited),
  ])
  if ('name' in result) {
    const detail =
      'error' in result
        ? result.error.message
        : result.signal ?? result.code ?? 'unknown'
    throw new Error(
      `${result.name} stopped unexpectedly (${detail})`,
    )
  }
}

try {
  await main()
} catch (error) {
  process.exitCode = 1
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
} finally {
  await stopChildren()
}
