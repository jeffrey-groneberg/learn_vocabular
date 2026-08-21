export const telemetryAttributeKeys = [
  'app.route',
  'app.locale',
  'app.mode',
  'app.duration_ms',
  'app.retry_count',
  'app.outcome',
  'app.release',
  'app.launch_id',
  'app.attempt_id',
] as const

export type TelemetryAttributeKey = (typeof telemetryAttributeKeys)[number]
export type TelemetryValue = string | number | boolean

const allowedKeys = new Set<string>(telemetryAttributeKeys)

export function safeRoute(value: string): string {
  const questionMark = value.indexOf('?')
  const hash = value.indexOf('#')
  const end = [questionMark, hash].filter((index) => index >= 0).reduce(
    (smallest, index) => Math.min(smallest, index),
    value.length,
  )
  return value.slice(0, end)
}

export function allowTelemetryAttributes(
  attributes: Readonly<Record<string, unknown>>,
): Partial<Record<TelemetryAttributeKey, TelemetryValue>> {
  const safe: Partial<Record<TelemetryAttributeKey, TelemetryValue>> = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (
      allowedKeys.has(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    ) {
      safe[key as TelemetryAttributeKey] =
        key === 'app.route' && typeof value === 'string' ? safeRoute(value) : value
    }
  }

  return safe
}
