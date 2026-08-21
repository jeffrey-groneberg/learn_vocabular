import { randomBytes } from 'node:crypto'
import { chmodSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  hiddenPrompt,
  confirm,
  infraDirectory,
  keychainRead,
  keychainWrite,
  prepareLocalState,
  repoRoot,
  requireCommand,
  run,
  showAndApprovePlan,
  stateDirectory,
  terraform,
  verifyAzureContext,
} from './lib/orchestrator.mjs'

async function ensureSecrets(rotate) {
  const services = {
    accessHash: 'vocabulary-voice-tutor.access-code-hash',
    cookie: 'vocabulary-voice-tutor.cookie-signing-key',
    pepper: 'vocabulary-voice-tutor.rate-limit-pepper',
    internal: 'vocabulary-voice-tutor.gateway-api-credential',
  }
  const complete = Object.values(services).every((service) => keychainRead(service))
  if (complete && !rotate) {
    return
  }

  const first = await hiddenPrompt('Choose the non-empty family access code: ')
  const second = await hiddenPrompt('Enter it again: ')
  if (!first || first !== second) {
    throw new Error('The access code was empty or the two entries did not match')
  }
  const { createAccessCodeHash } = await import(
    '../apps/web/server/security/access-code.ts'
  )
  keychainWrite(services.accessHash, await createAccessCodeHash(first))
  keychainWrite(services.cookie, randomBytes(32).toString('base64url'))
  keychainWrite(services.pepper, randomBytes(32).toString('base64url'))
  keychainWrite(services.internal, randomBytes(32).toString('base64url'))
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('This local bootstrap is intentionally supported only on macOS')
  }
  for (const command of ['az', 'terraform', 'security', 'node']) {
    requireCommand(command, command === 'security' ? ['help'] : ['--version'])
  }
  prepareLocalState()
  chmodSync(resolve(infraDirectory, 'terraform.tfvars'), 0o600)
  verifyAzureContext()
  await ensureSecrets(process.argv.includes('--rotate-secrets'))

  run('npm', ['run', 'typecheck'], { cwd: repoRoot })
  run('npm', ['test', '--', '--reporter=dot'], { cwd: repoRoot })
  terraform(['fmt', '-check', '-recursive'])
  terraform(['init', '-input=false'])
  terraform(['validate'])

  const planPath = resolve(stateDirectory, 'bootstrap.tfplan')
  terraform([
    'plan',
    '-input=false',
    '-out',
    planPath,
    '-var',
    'deploy_workloads=false',
    '-var',
    'provision_secrets=false',
  ])
  if (!(await showAndApprovePlan(planPath))) {
    throw new Error('Bootstrap plan was not approved')
  }
  terraform(['apply', '-input=false', planPath])

  if (
    !(await confirm(
      'Shared Azure infrastructure is ready. Confirm that the state directory is on FileVault-protected storage.',
    ))
  ) {
    throw new Error('Local state protection was not confirmed')
  }
  process.stdout.write('Bootstrap complete. Run npm run azure:deploy to publish the first release.\n')
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed'}\n`)
  process.exitCode = 1
})
