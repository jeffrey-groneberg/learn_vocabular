# Vocabulary Voice Tutor Azure infrastructure

This is the single, transparent Terraform root module for the approved
Germany West Central deployment. It creates a VNet-integrated workload-profiles
Container Apps environment, Premium ACR, Key Vault, Storage Table, Speech,
private endpoints/DNS, resource-scoped RBAC, and workspace-based monitoring.
Only `vocabulary-web` is externally routable; `vocabulary-api` is internal and
the scheduled cleanup job has no ingress.

## Security model

- All four data services use selected-network public access with one required,
  publicly routable `admin_ipv4_cidr` `/32`. The variable rejects broad CIDRs,
  `0.0.0.0/0`, loopback, RFC1918, link-local, and CGNAT ranges.
- Runtime access uses private endpoints and VNet-linked private DNS zones for
  ACR, Key Vault, Storage Table, and Speech. ACR is Premium, deny-by-default,
  anonymous/admin access is disabled, and all workloads use an `AcrPull`
  user-assigned identity.
- Gateway, API, cleanup, and image-pull identities are separate. Their roles
  are limited to the resource scope required by the approved architecture.
- Key Vault uses RBAC, purge protection, soft delete, and write-only
  `value_wo` secret inputs. The four secret values are Terraform ephemeral
  variables and must be passed from macOS Keychain, not a tfvars file.
- Storage shared-key access and Speech local authentication are disabled.
  No secret output is defined. Application Insights' ingestion connection
  string is intentionally an operational output.

The managed environment enables peer-to-peer TLS encryption explicitly through
the ARM `peerTrafficConfiguration` property. The application still authenticates
gateway-to-API calls with the independent Key Vault credential.

## Prerequisites

Use a local Mac only. Install Terraform `>= 1.15, < 2.0`, Azure CLI, Docker
with buildx, and the project’s existing Node tooling. Sign in and select the
intended subscription before every plan:

```sh
az login
az account set --subscription "<subscription-id>"
az account show --query '{subscription:id,tenant:tenantId,user:user.name}' -o json
terraform -chdir=infra init
```

Copy the example locally and set the actual public `/32` without using an IP
discovery service:

```sh
cp infra/terraform.tfvars.example infra/terraform.tfvars
chmod 600 infra/terraform.tfvars
```

`infra/state/` is the explicit local backend and is ignored. Keep the working
directory on FileVault-encrypted storage, restrict its permissions, and make
only encrypted backups. Never commit, email, or copy state unencrypted.

## Two-phase deployment

First review a bootstrap plan with `provision_secrets = false` and
`deploy_workloads = false`. It creates the shared platform without creating
Container Apps that reference unavailable images.

```sh
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init
terraform -chdir=infra validate
terraform -chdir=infra plan -out=state/bootstrap.tfplan
terraform -chdir=infra apply state/bootstrap.tfplan
```

For the workload phase, build and test Linux `amd64` images locally, sign in to
the selected-network registry from the permitted `/32`, push Git-SHA-tagged
images, and resolve each tag to an immutable `@sha256:` digest. Keep the
non-secret digest manifest under ignored `infra/state/`; never use `latest`.

Store an encoded salted scrypt family-code hash, random cookie-signing key,
rate-limit HMAC pepper, and random 256-bit gateway credential in macOS
Keychain. Export the four values only for the reviewed Terraform command:

```sh
export TF_VAR_access_code_hash="$(security find-generic-password -s vocab-access-code-hash -w)"
export TF_VAR_cookie_signing_key="$(security find-generic-password -s vocab-cookie-signing-key -w)"
export TF_VAR_rate_limit_pepper="$(security find-generic-password -s vocab-rate-limit-pepper -w)"
export TF_VAR_gateway_api_credential="$(security find-generic-password -s vocab-gateway-api-credential -w)"
terraform -chdir=infra plan -out=state/workloads.tfplan
terraform -chdir=infra apply state/workloads.tfplan
unset TF_VAR_access_code_hash TF_VAR_cookie_signing_key TF_VAR_rate_limit_pepper TF_VAR_gateway_api_credential
```

Before that plan, set both switches to `true`, provide the web and API digest
variables, and use a new `secret_rotation_version` when rotating a secret. The
no-ingress cleanup job deliberately reuses the web image and starts its separate
maintenance entry point.
Terraform enforces the complete workload input set. The secrets use provider
write-only fields, so the values are not retained in state.

## Operations and recovery

For an ISP address change, first add the new `/32` through ARM with the
signed-in Azure CLI identity while the existing access still permits control
plane operations. Then update `admin_ipv4_cidr`, create a saved Terraform plan,
and apply it immediately to reconcile all four data-plane firewalls and remove
the old address. Do not leave the transient ARM change in place.

Use the same reviewed saved-plan flow for image digest updates and rollback:
set a previously known digest, run `plan -out`, review, then `apply` that plan.
Use `terraform import` only to recover a known existing resource, after taking
an encrypted state backup. Restore state only from an encrypted backup after
checking its permissions and matching subscription. `terraform destroy` is a
destructive, deliberate local operation; review its saved plan and account for
Key Vault purge protection before using it.

The optional `alert_email` creates an action group and a low-volume Container
Apps console-error alert. The workbook and 30-day Log Analytics retention are
for reliability operations only. Application telemetry must redact vocabulary,
translations, audio, transcripts, access codes, cookies, client addresses,
rate-limit keys, and internal credentials.

After deployment, verify the public web liveness endpoint, that direct access
to the API is unavailable, private DNS resolution from a workload, managed
identity image pulls, and W3C trace correlation. Install and test the PWA on
an iPhone separately; learner content and progress remain local to IndexedDB,
and no raw audio is persisted by this infrastructure.
