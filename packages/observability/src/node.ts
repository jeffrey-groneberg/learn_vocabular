import {
  useInstrumenter,
  type Instrumenter,
  type TracingContext,
  type TracingSpan,
} from '@azure/core-tracing'
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

const noopContext: TracingContext = {
  setValue: () => noopContext,
  getValue: () => undefined,
  deleteValue: () => noopContext,
}

const noopSpan: TracingSpan = {
  setStatus: () => undefined,
  setAttribute: () => undefined,
  end: () => undefined,
  recordException: () => undefined,
  isRecording: () => false,
  addEvent: () => undefined,
}

const noopAzureSdkInstrumenter: Instrumenter = {
  startSpan: (_name, options) => ({
    span: noopSpan,
    tracingContext: options.tracingContext ?? noopContext,
  }),
  withContext: (_context, callback, ...args) => callback(...args),
  parseTraceparentHeader: () => undefined,
  createRequestHeaders: () => ({}),
}

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
    disableOutgoingRequestInstrumentation: true,
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

  const release = process.env.RELEASE_ID ?? process.env.RELEASE_DIGEST
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
  useInstrumenter(noopAzureSdkInstrumenter)
}
