resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${local.resource_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${local.resource_prefix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.main.id
  tags                = local.tags
}

resource "azurerm_application_insights_workbook" "operations" {
  name                = "11111111-1111-1111-1111-111111111111"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  display_name        = "Vocabulary Voice Tutor Operations"
  category            = "workbook"
  source_id           = lower(azurerm_application_insights.main.id)
  tags                = local.tags

  data_json = jsonencode({
    version = "Notebook/1.0"
    items = [
      {
        type = 1
        name = "Overview"
        content = {
          json = "# Vocabulary Voice Tutor\nReliability-only operations for browser, gateway, API, lockout outcomes, and private Speech dependencies. Learner content is intentionally excluded."
        }
      },
      {
        type = 3
        name = "Requests by role"
        content = {
          version       = "KqlItem/1.0"
          title         = "Request volume, latency, and failures by role"
          query         = "requests | summarize requests=count(), failures=countif(success == false), p95_ms=percentile(duration, 95) by cloud_RoleName, bin(timestamp, 15m) | order by timestamp desc"
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.insights/components"
          visualization = "timechart"
          timeContext = {
            durationMs = 86400000
          }
        }
      },
      {
        type = 3
        name = "Speech dependencies"
        content = {
          version       = "KqlItem/1.0"
          title         = "Private Speech dependencies by locale and outcome"
          query         = "dependencies | where name in ('speech.tts', 'speech.pronunciation') | extend locale=tostring(customDimensions['app.locale']), outcome=tostring(customDimensions['app.outcome']) | summarize calls=count(), failures=countif(success == false), p95_ms=percentile(duration, 95) by name, locale, outcome"
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.insights/components"
          visualization = "table"
          timeContext = {
            durationMs = 86400000
          }
        }
      },
      {
        type = 3
        name = "Access outcomes"
        content = {
          version       = "KqlItem/1.0"
          title         = "Family access and lockout outcomes"
          query         = "requests | where name contains '/api/session' | summarize attempts=count() by resultCode, bin(timestamp, 30m) | order by timestamp desc"
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.insights/components"
          visualization = "columnchart"
          timeContext = {
            durationMs = 604800000
          }
        }
      },
      {
        type = 3
        name = "Operation drill-through"
        content = {
          version       = "KqlItem/1.0"
          title         = "Recent operations for correlation drill-through"
          query         = "requests | project timestamp, cloud_RoleName, name, resultCode, duration, operation_Id, serviceVersion=tostring(customDimensions['service.version']) | order by timestamp desc | take 100"
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.insights/components"
          visualization = "table"
          timeContext = {
            durationMs = 86400000
          }
        }
      }
    ]
    isLocked = false
  })
}

resource "azurerm_monitor_action_group" "operations" {
  count = var.alert_email == null ? 0 : 1

  name                = "ag-${local.resource_prefix}-operations"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "vocabops"
  tags                = local.tags

  email_receiver {
    name                    = "local-operator"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}
