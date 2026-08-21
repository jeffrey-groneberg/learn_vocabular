resource "azurerm_container_app_environment" "main" {
  name                           = "cae-${local.resource_prefix}"
  location                       = azurerm_resource_group.main.location
  resource_group_name            = azurerm_resource_group.main.name
  logs_destination               = "log-analytics"
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id       = azurerm_subnet.container_apps.id
  internal_load_balancer_enabled = false
  zone_redundancy_enabled        = false
  mutual_tls_enabled             = true
  public_network_access          = "Enabled"
  tags                           = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "azapi_resource_action" "peer_traffic_encryption" {
  type        = "Microsoft.App/managedEnvironments@2025-01-01"
  resource_id = azurerm_container_app_environment.main.id
  method      = "PATCH"

  body = {
    properties = {
      peerTrafficConfiguration = {
        encryption = {
          enabled = true
        }
      }
    }
  }
}

resource "azurerm_container_app" "web" {
  count = var.deploy_workloads ? 1 : 0

  name                         = "vocabulary-web"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.gateway.id, azurerm_user_assigned_identity.image_pull.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.image_pull.id
  }

  secret {
    name                = "access-code-hash"
    identity            = azurerm_user_assigned_identity.gateway.id
    key_vault_secret_id = azurerm_key_vault_secret.access_code_hash[0].versionless_id
  }

  secret {
    name                = "cookie-signing-key"
    identity            = azurerm_user_assigned_identity.gateway.id
    key_vault_secret_id = azurerm_key_vault_secret.cookie_signing_key[0].versionless_id
  }

  secret {
    name                = "rate-limit-pepper"
    identity            = azurerm_user_assigned_identity.gateway.id
    key_vault_secret_id = azurerm_key_vault_secret.rate_limit_pepper[0].versionless_id
  }

  secret {
    name                = "gateway-api-credential"
    identity            = azurerm_user_assigned_identity.gateway.id
    key_vault_secret_id = azurerm_key_vault_secret.gateway_api_credential[0].versionless_id
  }

  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = 8080
    transport                  = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "gateway"
      image  = var.web_image_digest
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.gateway.client_id
      }

      env {
        name        = "ACCESS_CODE_HASH"
        secret_name = "access-code-hash"
      }

      env {
        name        = "COOKIE_SIGNING_KEY"
        secret_name = "cookie-signing-key"
      }

      env {
        name        = "RATE_LIMIT_PEPPER"
        secret_name = "rate-limit-pepper"
      }

      env {
        name        = "INTERNAL_API_CREDENTIAL"
        secret_name = "gateway-api-credential"
      }

      env {
        name = "INTERNAL_API_URL"
        # ACA short-name service discovery uses HTTP; environment peer encryption protects this hop.
        value = "http://vocabulary-api"
      }

      env {
        name  = "STORAGE_TABLE_ENDPOINT"
        value = azurerm_storage_account.main.primary_table_endpoint
      }

      env {
        name  = "STORAGE_TABLE_NAME"
        value = azapi_resource.rate_limits_table.name
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
      }

      env {
        name  = "RELEASE_DIGEST"
        value = var.web_image_digest
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/live"
        initial_delay           = 5
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/ready"
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 3
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/live"
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 12
      }
    }
  }

  lifecycle {
    precondition {
      condition     = local.workload_inputs_ready
      error_message = "deploy_workloads requires provision_secrets, all ephemeral secret inputs, and immutable image digests."
    }
  }

  depends_on = [azapi_resource_action.peer_traffic_encryption]
}

resource "azurerm_container_app" "api" {
  count = var.deploy_workloads ? 1 : 0

  name                         = "vocabulary-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id, azurerm_user_assigned_identity.image_pull.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.image_pull.id
  }

  secret {
    name                = "gateway-api-credential"
    identity            = azurerm_user_assigned_identity.api.id
    key_vault_secret_id = azurerm_key_vault_secret.gateway_api_credential[0].versionless_id
  }

  ingress {
    external_enabled           = false
    allow_insecure_connections = false
    target_port                = 8080
    transport                  = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "speech-api"
      image  = var.api_image_digest
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.api.client_id
      }

      env {
        name        = "INTERNAL_API_CREDENTIAL"
        secret_name = "gateway-api-credential"
      }

      env {
        name  = "SPEECH_ENDPOINT"
        value = azurerm_cognitive_account.speech.endpoint
      }

      env {
        name  = "SPEECH_REGION"
        value = var.location
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
      }

      env {
        name  = "RELEASE_DIGEST"
        value = var.api_image_digest
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/live"
        initial_delay           = 5
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/ready"
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 3
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/health/live"
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 12
      }
    }
  }

  lifecycle {
    precondition {
      condition     = local.workload_inputs_ready
      error_message = "deploy_workloads requires provision_secrets, all ephemeral secret inputs, and immutable image digests."
    }
  }

  depends_on = [azapi_resource_action.peer_traffic_encryption]
}

resource "azurerm_container_app_job" "cleanup" {
  count = var.deploy_workloads ? 1 : 0

  name                         = "vocabulary-cleanup"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 1
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.cleanup.id, azurerm_user_assigned_identity.image_pull.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.image_pull.id
  }

  schedule_trigger_config {
    cron_expression          = "0 0 * * *"
    parallelism              = 1
    replica_completion_count = 1
  }

  template {
    container {
      name   = "cleanup"
      image  = var.web_image_digest
      cpu    = 0.25
      memory = "0.5Gi"

      command = [
        "node",
        "--import",
        "@azure/monitor-opentelemetry/loader",
        "dist-server/cleanup.js",
      ]

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.cleanup.client_id
      }

      env {
        name  = "STORAGE_TABLE_ENDPOINT"
        value = azurerm_storage_account.main.primary_table_endpoint
      }

      env {
        name  = "STORAGE_TABLE_NAME"
        value = azapi_resource.rate_limits_table.name
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
      }

      env {
        name  = "RELEASE_DIGEST"
        value = var.web_image_digest
      }
    }
  }

  lifecycle {
    precondition {
      condition     = local.workload_inputs_ready
      error_message = "deploy_workloads requires provision_secrets, all ephemeral secret inputs, and immutable image digests."
    }
  }

  depends_on = [azapi_resource_action.peer_traffic_encryption]
}
