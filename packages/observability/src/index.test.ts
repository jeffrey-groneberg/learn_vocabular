import { describe, expect, it } from 'vitest'
import { allowTelemetryAttributes, safeRoute } from './index.js'

describe('telemetry allowlist', () => {
  it('removes forbidden content and URL details', () => {
    expect(
      allowTelemetryAttributes({
        'app.route': '/practice?word=secret#answer',
        'app.locale': 'de-DE',
        transcript: 'secret',
        clientAddress: '192.0.2.1',
        score: 92,
      }),
    ).toEqual({
      'app.route': '/practice',
      'app.locale': 'de-DE',
    })
    expect(safeRoute('/library#edit')).toBe('/library')
  })
})
