output "resource_group_name" {
  description = "Resource group that contains this deployment."
  value       = azurerm_resource_group.main.name
}

output "acr_login_server" {
  description = "ACR login server for local immutable image publication."
  value       = azurerm_container_registry.main.login_server
}

output "speech_endpoint" {
  description = "Azure Speech endpoint for the runtime."
  value       = azurerm_cognitive_account.speech.endpoint
}

output "speech_region" {
  description = "Azure Speech region."
  value       = var.location
}

output "application_insights_connection_string" {
  description = "Application Insights ingestion connection string."
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "web_application_url" {
  description = "External HTTPS URL for the public gateway, present after the workload phase."
  value       = try("https://${azurerm_container_app.web[0].ingress[0].fqdn}", null)
}

output "internal_api_name" {
  description = "Environment-scoped internal Container App name, present after the workload phase."
  value       = try(azurerm_container_app.api[0].name, null)
}

output "resource_names" {
  description = "Non-secret resource names for operations."
  value = {
    container_apps_environment = azurerm_container_app_environment.main.name
    container_registry         = azurerm_container_registry.main.name
    key_vault                  = azurerm_key_vault.main.name
    storage_account            = azurerm_storage_account.main.name
    speech                     = azurerm_cognitive_account.speech.name
    application_insights       = azurerm_application_insights.main.name
  }
}
