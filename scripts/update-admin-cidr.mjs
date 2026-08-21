import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  outputValue,
  prepareLocalState,
  requireCommand,
  run,
  showAndApprovePlan,
  stateDirectory,
  terraform,
  terraformOutput,
  verifyAzureContext,
} from './lib/orchestrator.mjs'

function validatePublicIpv4Cidr(value) {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/u)
  if (!match) {
    return false
  }
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false
  }
  const [a, b] = octets
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

async function main() {
  const newCidr = process.argv[2]
  if (!newCidr || !validatePublicIpv4Cidr(newCidr)) {
    throw new Error('Provide exactly one publicly routable IPv4 /32')
  }
  for (const command of ['az', 'terraform']) {
    requireCommand(command)
  }
  prepareLocalState()
  verifyAzureContext()
  const outputs = terraformOutput()
  const resources = outputValue(outputs, 'resource_names')
  const resourceGroup = outputValue(outputs, 'resource_group_name')

  run('az', ['acr', 'network-rule', 'add', '--name', resources.container_registry, '--ip-address', newCidr])
  run('az', ['keyvault', 'network-rule', 'add', '--name', resources.key_vault, '--ip-address', newCidr])
  run('az', [
    'storage',
    'account',
    'network-rule',
    'add',
    '--resource-group',
    resourceGroup,
    '--account-name',
    resources.storage_account,
    '--ip-address',
    newCidr,
  ])
  run('az', [
    'cognitiveservices',
    'account',
    'network-rule',
    'add',
    '--resource-group',
    resourceGroup,
    '--name',
    resources.speech,
    '--ip-address',
    newCidr,
  ])

  const tfvarsPath = resolve('infra', 'terraform.tfvars')
  const tfvars = readFileSync(tfvarsPath, 'utf8')
  if (!/^\s*admin_ipv4_cidr\s*=/mu.test(tfvars)) {
    throw new Error('infra/terraform.tfvars is missing admin_ipv4_cidr')
  }
  writeFileSync(
    tfvarsPath,
    tfvars.replace(
      /^\s*admin_ipv4_cidr\s*=.*$/mu,
      `admin_ipv4_cidr = "${newCidr}"`,
    ),
    { mode: 0o600 },
  )

  const planPath = resolve(stateDirectory, 'admin-cidr.tfplan')
  terraform(['plan', '-input=false', '-out', planPath])
  if (!(await showAndApprovePlan(planPath))) {
    throw new Error(
      'Reconciliation plan was not approved. The temporary ARM additions remain; rerun this command promptly.',
    )
  }
  terraform(['apply', '-input=false', planPath])
  process.stdout.write(`Administrator allowlists now contain only ${newCidr}.\n`)
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CIDR update failed'}\n`)
  process.exitCode = 1
})
