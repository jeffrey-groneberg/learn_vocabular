resource "azurerm_monitor_scheduled_query_rules_alert_v2" "container_app_failures" {
  count = var.alert_email == null || !var.deploy_workloads ? 0 : 1

  name                 = "alert-${local.resource_prefix}-container-app-failures"
  resource_group_name  = azurerm_resource_group.main.name
  location             = azurerm_resource_group.main.location
  scopes               = [azurerm_log_analytics_workspace.main.id]
  severity             = 2
  enabled              = true
  evaluation_frequency = "PT5M"
  window_duration      = "PT15M"
  description          = "Container Apps error logs exceeded the low-volume failure threshold."
  tags                 = local.tags

  criteria {
    query                   = <<-KQL
      AppRequests
      | where Success == false and ResultCode !in ("401", "404")
      | summarize failures = count()
    KQL
    time_aggregation_method = "Total"
    threshold               = 5
    operator                = "GreaterThan"
    metric_measure_column   = "failures"
  }

  action {
    action_groups = [azurerm_monitor_action_group.operations[0].id]
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "request_latency" {
  count = var.alert_email == null || !var.deploy_workloads ? 0 : 1

  name                 = "alert-${local.resource_prefix}-request-latency"
  resource_group_name  = azurerm_resource_group.main.name
  location             = azurerm_resource_group.main.location
  scopes               = [azurerm_log_analytics_workspace.main.id]
  severity             = 3
  enabled              = true
  evaluation_frequency = "PT5M"
  window_duration      = "PT15M"
  description          = "Application request p95 latency exceeded five seconds."
  tags                 = local.tags

  criteria {
    query                   = <<-KQL
      AppRequests
      | summarize p95_ms = percentile(DurationMs, 95)
    KQL
    time_aggregation_method = "Maximum"
    threshold               = 5000
    operator                = "GreaterThan"
    metric_measure_column   = "p95_ms"
  }

  action {
    action_groups = [azurerm_monitor_action_group.operations[0].id]
  }
}
