variable "subscription_id" {
  description = "Azure subscription ID that owns this deployment."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id must be an Azure subscription UUID."
  }
}

variable "location" {
  description = "Azure region for all regional resources."
  type        = string
  default     = "germanywestcentral"

  validation {
    condition     = lower(var.location) == "germanywestcentral"
    error_message = "The approved architecture is deployed in germanywestcentral."
  }
}

variable "name_prefix" {
  description = "Lowercase alphanumeric deployment prefix. Choose a globally unique value."
  type        = string
  default     = "vocabtutor"

  validation {
    condition     = can(regex("^[a-z0-9]{3,12}$", var.name_prefix))
    error_message = "name_prefix must contain 3-12 lowercase letters or digits."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z0-9]{2,8}$", var.environment))
    error_message = "environment must contain 2-8 lowercase letters or digits."
  }
}

variable "admin_ipv4_cidr" {
  description = "Exactly one publicly routable administrator IPv4 /32 for selected-network data-plane access."
  type        = string
  nullable    = false

  validation {
    condition = var.admin_ipv4_cidr == null || (
      can(cidrhost(var.admin_ipv4_cidr, 0)) &&
      can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/32$", var.admin_ipv4_cidr)) &&
      try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) >= 1 &&
      try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), 256) <= 223 &&
      !(
        try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 10 ||
        try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 127 ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 100 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) >= 64 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), 256) <= 127
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 169 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 254
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 172 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) >= 16 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), 256) <= 31
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 168
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 0 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) <= 2
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 88 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 99
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 31 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 196
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 52 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 193
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 192 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 175 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 48
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 198 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) >= 18 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), 256) <= 19
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 198 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 51 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 100
        ) ||
        (
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[0]), -1) == 203 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[1]), -1) == 0 &&
          try(tonumber(split(".", split("/", var.admin_ipv4_cidr)[0])[2]), -1) == 113
        )
      )
    )
    error_message = "admin_ipv4_cidr must be one public unicast IPv4 /32; 0.0.0.0/0, loopback, RFC1918, link-local, and CGNAT ranges are rejected."
  }
}

variable "vnet_cidr" {
  description = "Address space for the application virtual network."
  type        = string
  default     = "10.40.0.0/16"
}

variable "container_apps_subnet_cidr" {
  description = "Delegated workload-profiles Container Apps infrastructure subnet."
  type        = string
  default     = "10.40.0.0/23"
}

variable "private_endpoints_subnet_cidr" {
  description = "Subnet reserved for private endpoints."
  type        = string
  default     = "10.40.2.0/24"
}

variable "common_tags" {
  description = "Additional tags applied to supported resources."
  type        = map(string)
  default     = {}
}

variable "deploy_workloads" {
  description = "Set true after one-time workload provisioning. Image releases are managed directly through Container Apps."
  type        = bool
  default     = true
}

variable "access_code_hash" {
  description = "Encoded salted scrypt family-code hash supplied ephemerally from macOS Keychain."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  nullable    = true
}

variable "cookie_signing_key" {
  description = "Random cookie signing key supplied ephemerally from macOS Keychain."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  nullable    = true
}

variable "rate_limit_pepper" {
  description = "Random HMAC pepper supplied ephemerally from macOS Keychain."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  nullable    = true
}

variable "gateway_api_credential" {
  description = "Random 256-bit internal gateway credential supplied ephemerally from macOS Keychain."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  nullable    = true
}

variable "secret_rotation_version" {
  description = "Non-secret monotonic version used to rotate Key Vault write-only values."
  type        = number
  default     = 1

  validation {
    condition     = var.secret_rotation_version >= 1 && floor(var.secret_rotation_version) == var.secret_rotation_version
    error_message = "secret_rotation_version must be a positive integer."
  }
}

variable "alert_email" {
  description = "Optional email address for platform failure alerts."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.alert_email == null || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address when set."
  }
}
