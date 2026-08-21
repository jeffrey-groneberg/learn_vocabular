resource "azurerm_key_vault" "main" {
  name                          = local.key_vault_name
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 90
  public_network_access_enabled = true
  tags                          = local.selected_network_exemption_tags

  network_acls {
    default_action = "Deny"
    bypass         = "None"
    ip_rules       = [var.admin_ipv4_cidr]
  }
}

resource "azurerm_storage_account" "main" {
  name                            = local.storage_name
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true
  tags                            = local.selected_network_exemption_tags

  network_rules {
    default_action             = "Deny"
    bypass                     = ["None"]
    ip_rules                   = [trimsuffix(var.admin_ipv4_cidr, "/32")]
    virtual_network_subnet_ids = []
  }

  lifecycle {
    ignore_changes = [network_rules[0].private_link_access]
  }
}

resource "azapi_resource" "rate_limits_table" {
  type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01"
  name      = "ratelimits"
  parent_id = "${azurerm_storage_account.main.id}/tableServices/default"

  body = {}
}

resource "azurerm_cognitive_account" "speech" {
  name                          = local.speech_name
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  kind                          = "SpeechServices"
  sku_name                      = "S0"
  custom_subdomain_name         = local.speech_name
  local_auth_enabled            = false
  public_network_access_enabled = true
  tags                          = local.tags

  network_acls {
    default_action = "Deny"
    ip_rules       = [trimsuffix(var.admin_ipv4_cidr, "/32")]
  }
}

resource "azurerm_key_vault_secret" "access_code_hash" {
  count = var.provision_secrets ? 1 : 0

  name             = "access-code-hash"
  key_vault_id     = azurerm_key_vault.main.id
  value_wo         = var.access_code_hash
  value_wo_version = var.secret_rotation_version
  content_type     = "application/octet-stream"
  tags             = local.tags

  lifecycle {
    precondition {
      condition     = var.access_code_hash != null
      error_message = "access_code_hash must be supplied ephemerally when provision_secrets is true."
    }
  }
}

resource "azurerm_key_vault_secret" "cookie_signing_key" {
  count = var.provision_secrets ? 1 : 0

  name             = "cookie-signing-key"
  key_vault_id     = azurerm_key_vault.main.id
  value_wo         = var.cookie_signing_key
  value_wo_version = var.secret_rotation_version
  content_type     = "application/octet-stream"
  tags             = local.tags

  lifecycle {
    precondition {
      condition     = var.cookie_signing_key != null
      error_message = "cookie_signing_key must be supplied ephemerally when provision_secrets is true."
    }
  }
}

resource "azurerm_key_vault_secret" "rate_limit_pepper" {
  count = var.provision_secrets ? 1 : 0

  name             = "rate-limit-pepper"
  key_vault_id     = azurerm_key_vault.main.id
  value_wo         = var.rate_limit_pepper
  value_wo_version = var.secret_rotation_version
  content_type     = "application/octet-stream"
  tags             = local.tags

  lifecycle {
    precondition {
      condition     = var.rate_limit_pepper != null
      error_message = "rate_limit_pepper must be supplied ephemerally when provision_secrets is true."
    }
  }
}

resource "azurerm_key_vault_secret" "gateway_api_credential" {
  count = var.provision_secrets ? 1 : 0

  name             = "gateway-api-credential"
  key_vault_id     = azurerm_key_vault.main.id
  value_wo         = var.gateway_api_credential
  value_wo_version = var.secret_rotation_version
  content_type     = "application/octet-stream"
  tags             = local.tags

  lifecycle {
    precondition {
      condition     = var.gateway_api_credential != null
      error_message = "gateway_api_credential must be supplied ephemerally when provision_secrets is true."
    }
  }
}

resource "azurerm_private_endpoint" "key_vault" {
  name                = "pe-${local.resource_prefix}-kv"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = local.tags

  private_service_connection {
    name                           = "psc-${local.resource_prefix}-kv"
    private_connection_resource_id = azurerm_key_vault.main.id
    is_manual_connection           = false
    subresource_names              = ["vault"]
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [azurerm_private_dns_zone.services["keyvault"].id]
  }
}

resource "azurerm_private_endpoint" "table" {
  name                = "pe-${local.resource_prefix}-table"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = local.tags

  private_service_connection {
    name                           = "psc-${local.resource_prefix}-table"
    private_connection_resource_id = azurerm_storage_account.main.id
    is_manual_connection           = false
    subresource_names              = ["table"]
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [azurerm_private_dns_zone.services["table"].id]
  }
}

resource "azurerm_private_endpoint" "speech" {
  name                = "pe-${local.resource_prefix}-speech"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = local.tags

  private_service_connection {
    name                           = "psc-${local.resource_prefix}-speech"
    private_connection_resource_id = azurerm_cognitive_account.speech.id
    is_manual_connection           = false
    subresource_names              = ["account"]
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [azurerm_private_dns_zone.services["speech"].id]
  }
}
