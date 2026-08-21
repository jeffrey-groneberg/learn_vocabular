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

## Infrastructure and release boundary

Terraform owns the stable Azure topology and workload configuration. It does
not own application releases. The Container App and job resources ignore only
their container image fields; ingress, identities, secrets, environment
settings, probes, scaling, networking, and schedules remain Terraform-managed.

First review a bootstrap plan with `deploy_workloads = false`. It creates the
shared platform without Container Apps.

```sh
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init
terraform -chdir=infra validate
terraform -chdir=infra plan -out=state/bootstrap.tfplan
terraform -chdir=infra apply state/bootstrap.tfplan
```

Provision workloads and the first release once:

```sh
npm run azure:provision-workloads
```

The Azure API requires an image when a Container App is created. This command
therefore builds and tests the initial Linux `amd64` images, publishes
one-time `:bootstrap` references, and presents a saved Terraform plan for the
Container Apps, job, and Key Vault values. After that initial apply, it updates
all three workloads directly to immutable `@sha256:` references and changes
the ignored local `deploy_workloads` setting to `true`.

Store the encoded salted scrypt family-code hash, random cookie-signing key,
rate-limit HMAC pepper, and random 256-bit gateway credential in macOS
Keychain. The provisioning and infrastructure scripts expose those values to
Terraform only as ephemeral environment variables. Provider write-only fields
keep them out of state.

For every later application release, use:

```sh
npm run azure:deploy
```

The release command does not call Terraform or write Terraform variables. It
builds, tests, and pushes Git-SHA-tagged images, resolves immutable digests,
shows the exact live-to-proposed image set, and requires the operator to type
`deploy`. Azure Container Apps creates the new app revisions directly; the
no-ingress cleanup job receives the same web image and keeps its maintenance
entry point. A partial update is restored automatically to the pre-release
image set. Current and previous manifests are kept under ignored `infra/state/`.

## Operations and recovery

For an ISP address change, first add the new `/32` through ARM with the
signed-in Azure CLI identity while the existing access still permits control
plane operations. Then update `admin_ipv4_cidr`, create a saved Terraform plan,
and apply it immediately to reconcile all four data-plane firewalls and remove
the old address. Do not leave the transient ARM change in place.

Terraform should run after provisioning only for an infrastructure or runtime
configuration change. Never use it to publish or roll back an image. Run
`npm run azure:rollback` to review and restore the previous immutable image set
directly through Container Apps.

Infrastructure plans require the four Keychain-backed ephemeral secret
variables while `deploy_workloads = true`; the repository scripts supply them
without printing them. Increment `secret_rotation_version` only for an
intentional Key Vault rotation.

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
