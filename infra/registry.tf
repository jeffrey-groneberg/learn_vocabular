resource "azurerm_container_registry" "main" {
  name                                  = local.acr_name
  resource_group_name                   = azurerm_resource_group.main.name
  location                              = azurerm_resource_group.main.location
  sku                                   = "Premium"
  admin_enabled                         = false
  anonymous_pull_enabled                = false
  data_endpoint_enabled                 = true
  public_network_access_enabled         = true
  network_rule_bypass_option            = "None"
  network_rule_bypass_for_tasks_enabled = false
  tags                                  = local.tags

  network_rule_set {
    default_action = "Deny"

    ip_rule {
      action   = "Allow"
      ip_range = var.admin_ipv4_cidr
    }
  }
}

resource "azurerm_private_endpoint" "acr" {
  name                = "pe-${local.resource_prefix}-acr"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = local.tags

  private_service_connection {
    name                           = "psc-${local.resource_prefix}-acr"
    private_connection_resource_id = azurerm_container_registry.main.id
    is_manual_connection           = false
    subresource_names              = ["registry"]
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [azurerm_private_dns_zone.services["acr"].id]
  }
}
