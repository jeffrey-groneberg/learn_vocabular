import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const infraDirectory = resolve(repoRoot, 'infra')
export const stateDirectory = resolve(infraDirectory, 'state')
const tfvarsPath = resolve(infraDirectory, 'terraform.tfvars')

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: options.timeout,
  })
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr.trim() : ''
    throw new Error(`${command} failed${detail ? `: ${detail}` : ''}`)
  }
  return options.capture ? result.stdout.trim() : ''
}

export function requireCommand(command, versionArgs = ['--version']) {
  const result = spawnSync(command, versionArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'ignore',
  })
  if (result.status !== 0) {
    throw new Error(`Required command "${command}" is unavailable`)
  }
}

export function prepareLocalState() {
  process.umask(0o077)
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 })
  if (!existsSync(tfvarsPath)) {
    throw new Error(
      'Create infra/terraform.tfvars from infra/terraform.tfvars.example and set the subscription and administrator /32 first.',
    )
  }
  chmodSync(stateDirectory, 0o700)
  chmodSync(tfvarsPath, 0o600)
  for (const entry of readdirSync(stateDirectory, { withFileTypes: true })) {
    chmodSync(resolve(stateDirectory, entry.name), entry.isDirectory() ? 0o700 : 0o600)
  }
}

export function terraform(args, options = {}) {
  return run('terraform', [`-chdir=${infraDirectory}`, ...args], options)
}

export function terraformOutput() {
  return JSON.parse(terraform(['output', '-json'], { capture: true }))
}

export function verifyAzureContext() {
  const account = JSON.parse(run('az', ['account', 'show', '-o', 'json'], { capture: true }))
  const tfvars = readFileSync(tfvarsPath, 'utf8')
  const configuredSubscription = tfvars.match(
    /^\s*subscription_id\s*=\s*"([0-9a-f-]+)"\s*$/imu,
  )?.[1]
  if (!configuredSubscription) {
    throw new Error('infra/terraform.tfvars must contain subscription_id')
  }
  if (account.id.toLowerCase() !== configuredSubscription.toLowerCase()) {
    throw new Error(
      `Azure CLI is using subscription ${account.id}, but Terraform is configured for ${configuredSubscription}.`,
    )
  }
  process.stdout.write(
    `Azure context: ${account.name} (${account.id}), tenant ${account.tenantId}\n`,
  )
  return account
}

export async function confirm(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Plan approval requires an interactive terminal')
  }
  process.stdout.write(`${question} Type "apply" to continue: `)
  let answer = ''
  for await (const chunk of process.stdin) {
    answer += chunk
    if (answer.includes('\n')) {
      break
    }
  }
  return answer.trim() === 'apply'
}

export async function hiddenPrompt(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('A secure interactive terminal is required')
  }
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return new Promise((resolvePrompt, reject) => {
    let value = ''
    const finish = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdout.write('\n')
      resolvePrompt(value)
    }
    const onData = (character) => {
      if (character === '\u0003') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        reject(new Error('Cancelled'))
      } else if (character === '\r' || character === '\n') {
        finish()
      } else if (character === '\u007f') {
        value = value.slice(0, -1)
      } else if (character >= ' ') {
        value += character
      }
    }
    process.stdin.on('data', onData)
  })
}

export function keychainRead(service) {
  const result = spawnSync(
    'security',
    ['find-generic-password', '-a', process.env.USER ?? '', '-s', service, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return result.status === 0 ? result.stdout.trim() : null
}

export function keychainWrite(service, value) {
  run('security', [
    'add-generic-password',
    '-U',
    '-a',
    process.env.USER ?? '',
    '-s',
    service,
    '-w',
    value,
  ])
}

export function deploymentSecrets() {
  const services = {
    TF_VAR_access_code_hash: 'vocabulary-voice-tutor.access-code-hash',
    TF_VAR_cookie_signing_key: 'vocabulary-voice-tutor.cookie-signing-key',
    TF_VAR_rate_limit_pepper: 'vocabulary-voice-tutor.rate-limit-pepper',
    TF_VAR_gateway_api_credential: 'vocabulary-voice-tutor.gateway-api-credential',
  }
  return Object.fromEntries(
    Object.entries(services).map(([name, service]) => {
      const value = keychainRead(service)
      if (!value) {
        throw new Error(`Keychain item "${service}" is missing; run npm run azure:bootstrap`)
      }
      return [name, value]
    }),
  )
}

export function showAndApprovePlan(planPath, environment = process.env) {
  terraform(['show', '-no-color', planPath], { env: environment })
  return confirm('Review the Terraform plan above.')
}

export function outputValue(output, name) {
  const value = output[name]?.value
  if (value === undefined || value === null) {
    throw new Error(`Terraform output "${name}" is unavailable`)
  }
  return value
}
