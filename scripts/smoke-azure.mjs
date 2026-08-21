import {
  hiddenPrompt,
  outputValue,
  prepareLocalState,
  requireCommand,
  run,
  terraformOutput,
  verifyAzureContext,
} from './lib/orchestrator.mjs'

async function expectStatus(url, expected) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (response.status !== expected) {
    throw new Error(`${url} returned ${response.status}; expected ${expected}`)
  }
  return response
}

async function checkTrace(resourceGroup, appName) {
  const query = [
    'requests',
    '| where timestamp > ago(15m)',
    '| where name contains "/api/tts"',
    '| project operation_Id',
    '| join kind=inner (dependencies | where timestamp > ago(15m) and name == "speech.tts" | project operation_Id) on operation_Id',
    '| take 1',
  ].join(' ')

  for (let attempt = 0; attempt < 8; attempt += 1) {
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
      { capture: true },
    )
    if (Number(result) > 0) {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 15_000))
  }
  throw new Error('Correlated gateway-to-Speech telemetry did not arrive within two minutes')
}

async function main() {
  for (const command of ['az', 'terraform']) {
    requireCommand(command)
  }
  prepareLocalState()
  verifyAzureContext()
  const outputs = terraformOutput()
  const webUrl = outputValue(outputs, 'web_application_url')
  const resourceGroup = outputValue(outputs, 'resource_group_name')
  const resources = outputValue(outputs, 'resource_names')

  await expectStatus(`${webUrl}/health/live`, 200)
  const apiFqdn = run(
    'az',
    [
      'containerapp',
      'show',
      '--resource-group',
      resourceGroup,
      '--name',
      'vocabulary-api',
      '--query',
      'properties.configuration.ingress.fqdn',
      '--output',
      'tsv',
    ],
    { capture: true },
  )
  await expectStatus(`https://${apiFqdn}/health/live`, 404)

  if (!process.argv.includes('--platform-only')) {
    const code = await hiddenPrompt('Family access code for authenticated smoke tests: ')
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
    const session = await fetch(`${webUrl}/api/session`, { headers: { cookie } })
    if (!session.ok || (await session.json()).authenticated !== true) {
      throw new Error('Issued family session was not accepted')
    }
    const tts = await fetch(`${webUrl}/api/tts`, {
      method: 'POST',
      headers: {
        cookie,
        origin: webUrl,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'apple', locale: 'en-GB' }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!tts.ok || !tts.headers.get('content-type')?.startsWith('audio/')) {
      throw new Error(`TTS smoke test failed with ${tts.status}`)
    }
    await fetch(`${webUrl}/api/logout`, {
      method: 'POST',
      headers: { cookie, origin: webUrl, 'sec-fetch-site': 'same-origin' },
    })
    await checkTrace(resourceGroup, resources.application_insights)
  }

  process.stdout.write('Azure smoke checks passed.\n')
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Smoke test failed'}\n`)
  process.exitCode = 1
})
