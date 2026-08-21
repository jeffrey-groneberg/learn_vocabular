locals {
  resource_prefix = "${var.name_prefix}-${var.environment}"
  acr_name        = substr("${var.name_prefix}${var.environment}acr", 0, 50)
  storage_name    = substr("${var.name_prefix}${var.environment}st", 0, 24)
  key_vault_name  = substr("${var.name_prefix}-${var.environment}-kv", 0, 24)
  speech_name     = substr("${var.name_prefix}-${var.environment}-speech", 0, 63)

  tags = merge(
    {
      application = "vocabulary-voice-tutor"
      environment = var.environment
      managed-by  = "terraform"
      owner       = "local-operator"
      privacy     = "no-learner-content"
    },
    var.common_tags
  )

  selected_network_exemption_tags = merge(
    local.tags,
    {
      SecurityControl = "Ignore"
    }
  )

  private_dns_zones = {
    acr      = "privatelink.azurecr.io"
    keyvault = "privatelink.vaultcore.azure.net"
    table    = "privatelink.table.core.windows.net"
    speech   = "privatelink.cognitiveservices.azure.com"
  }

  workload_inputs_ready = (
    var.provision_secrets &&
    var.web_image_digest != null &&
    var.api_image_digest != null &&
    var.access_code_hash != null &&
    var.cookie_signing_key != null &&
    var.rate_limit_pepper != null &&
    var.gateway_api_credential != null
  )
}
