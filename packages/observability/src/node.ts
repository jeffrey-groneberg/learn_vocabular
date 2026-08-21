import { useAzureMonitor } from '@azure/monitor-opentelemetry'
import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { safeRoute } from './index.js'

export type RuntimeRole =
  | 'vocabulary-gateway'
  | 'vocabulary-api'
  | 'vocabulary-maintenance'

let started = false

export function startNodeTelemetry(role: RuntimeRole): void {
  if (started) {
    return
  }
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  if (!connectionString) {
    return
  }
  started = true

  const http: HttpInstrumentationConfig = {
    enabled: true,
    headersToSpanAttributes: {
      client: { requestHeaders: [], responseHeaders: [] },
      server: { requestHeaders: [], responseHeaders: [] },
    },
    requestHook(span, request) {
      if ('url' in request && typeof request.url === 'string') {
        const route = safeRoute(request.url)
        span.setAttribute('url.full', route)
        span.setAttribute('http.target', route)
      }
    },
  }

  const release = process.env.RELEASE_DIGEST
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString,
      disableOfflineStorage: true,
    },
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: role,
      ...(release ? { [ATTR_SERVICE_VERSION]: release } : {}),
    }),
    samplingRatio: 1,
    tracesPerSecond: 0,
    enableLiveMetrics: false,
    enableTraceBasedSamplingForLogs: true,
    instrumentationOptions: {
      http,
      azureSdk: { enabled: false },
      console: { enabled: false },
    },
  })
}
