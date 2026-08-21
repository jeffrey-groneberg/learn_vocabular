import {
  azureResourceNames,
  hiddenPrompt,
  keychainRead,
  requireCommand,
  run,
  verifyAzureContext,
} from './lib/orchestrator.mjs'
import { randomBytes } from 'node:crypto'

async function expectStatus(url, expected) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (response.status !== expected) {
    throw new Error(`${url} returned ${response.status}; expected ${expected}`)
  }
  return response
}

async function checkTrace(resourceGroup, appName, traceId) {
  const query = [
    'requests',
    `| where timestamp > ago(15m) and operation_Id == "${traceId}"`,
    '| where cloud_RoleName == "vocabulary-gateway"',
    '| where url == "/api/tts"',
    '| project operation_Id',
    '| join kind=inner (dependencies',
    `  | where timestamp > ago(15m) and operation_Id == "${traceId}"`,
    '  | where cloud_RoleName == "vocabulary-api" and name == "speech.tts"',
    '  | project operation_Id) on operation_Id',
    '| take 1',
  ].join(' ')

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const result = run(
      'az',
      [
        'monitor',
        'app-insights',
        'query',
        '--resource-group',
        resourceGroup,
        '--app',
        appName,
        '--analytics-query',
        query,
        '--query',
        'tables[0].rows | length(@)',
        '--output',
        'tsv',
      ],
      { capture: true, timeout: Math.min(20_000, deadline - Date.now()) },
    )
    if (Number(result) > 0) {
      return
    }
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, Math.min(10_000, Math.max(0, deadline - Date.now()))),
    )
  }
  throw new Error('Correlated gateway-to-Speech telemetry did not arrive within two minutes')
}

async function main() {
  for (const command of ['az']) {
    requireCommand(command)
  }
  verifyAzureContext()
  const resources = azureResourceNames()
  const webFqdn = run(
    'az',
    [
      'containerapp',
      'show',
      '--resource-group',
      resources.resourceGroup,
      '--name',
      resources.webApp,
      '--query',
      'properties.configuration.ingress.fqdn',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
  if (!webFqdn) {
    throw new Error('The public Container App FQDN is unavailable')
  }
  const webUrl = `https://${webFqdn}`

  await expectStatus(`${webUrl}/health/live`, 200)
  const apiFqdn = run(
    'az',
    [
      'containerapp',
      'show',
      '--resource-group',
      resources.resourceGroup,
      '--name',
      resources.apiApp,
      '--query',
      'properties.configuration.ingress.fqdn',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
  await expectStatus(`https://${apiFqdn}/health/live`, 404)

  if (!process.argv.includes('--platform-only')) {
    const code = process.argv.includes('--keychain')
      ? keychainRead('vocabulary-voice-tutor.family-access-code')
      : await hiddenPrompt('Family access code for authenticated smoke tests: ')
    if (!code) {
      throw new Error('The family access code is unavailable')
    }
    const login = await fetch(`${webUrl}/api/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: webUrl,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(20_000),
    })
    if (login.status !== 204) {
      throw new Error(`Family session smoke test failed with ${login.status}`)
    }
    const cookie = login.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) {
      throw new Error('Family session did not issue a secure cookie')
    }
    const session = await fetch(`${webUrl}/api/session`, {
      headers: { cookie },
      signal: AbortSignal.timeout(20_000),
    })
    if (!session.ok || (await session.json()).authenticated !== true) {
      throw new Error('Issued family session was not accepted')
    }
    const traceId = randomBytes(16).toString('hex')
    const tts = await fetch(`${webUrl}/api/tts`, {
      method: 'POST',
      headers: {
        cookie,
        origin: webUrl,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
      },
      body: JSON.stringify({ text: 'apple', locale: 'en-US' }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!tts.ok || !tts.headers.get('content-type')?.startsWith('audio/')) {
      throw new Error(`TTS smoke test failed with ${tts.status}`)
    }
    const logout = await fetch(`${webUrl}/api/logout`, {
      method: 'POST',
      headers: { cookie, origin: webUrl, 'sec-fetch-site': 'same-origin' },
      signal: AbortSignal.timeout(20_000),
    })
    if (
      logout.status !== 204 ||
      !logout.headers.getSetCookie()[0]?.startsWith('__Host-vocabulary-voice-tutor=')
    ) {
      throw new Error('Logout smoke test failed')
    }
    await checkTrace(
      resources.resourceGroup,
      resources.applicationInsights,
      traceId,
    )
  }

  process.stdout.write('Azure smoke checks passed.\n')
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Smoke test failed'}\n`)
  process.exitCode = 1
})
