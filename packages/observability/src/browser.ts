import {
  ApplicationInsights,
  DistributedTracingModes,
  type ITelemetryItem,
} from '@microsoft/applicationinsights-web'
import { safeRoute } from './index.js'

function sanitizeBrowserTelemetry(item: ITelemetryItem, release: string | undefined): boolean {
  if (item.baseData) {
    for (const key of ['uri', 'refUri', 'name', 'target'] as const) {
      const value = item.baseData[key]
      if (typeof value === 'string') {
        item.baseData[key] = safeRoute(value)
      }
    }
    delete item.baseData.properties
    delete item.baseData.measurements
  }

  if (item.data) {
    item.data = {}
  }
  if (item.ext) {
    delete item.ext.user
  }
  if (item.tags) {
    item.tags['ai.cloud.role'] = 'vocabulary-web'
    if (release) {
      item.tags['ai.application.ver'] = release
    }
    delete item.tags['ai.user.authUserId']
    delete item.tags['ai.user.accountId']
  }
  return true
}

export function startBrowserTelemetry(
  connectionString: string | undefined,
  release: string | undefined,
): void {
  if (!connectionString) {
    return
  }

  const applicationInsights = new ApplicationInsights({
    config: {
      connectionString,
      distributedTracingMode: DistributedTracingModes.W3C,
      enableAutoRouteTracking: true,
      enableCorsCorrelation: true,
      disableCookiesUsage: true,
      enableSessionStorageBuffer: false,
      enableRequestHeaderTracking: false,
      enableResponseHeaderTracking: false,
      disableExceptionTracking: true,
      enableUnhandledPromiseRejectionTracking: false,
      samplingPercentage: 100,
      correlationHeaderExcludedDomains: ['*.azurecr.io', '*.vault.azure.net'],
      extensionConfig: {
        AppInsightsCfgSyncPlugin: {
          cfgUrl: '',
        },
      },
    },
  })
  applicationInsights.addTelemetryInitializer((item) =>
    sanitizeBrowserTelemetry(item, release),
  )
  applicationInsights.loadAppInsights()
  applicationInsights.trackPageView({ name: safeRoute(window.location.pathname) })
}
