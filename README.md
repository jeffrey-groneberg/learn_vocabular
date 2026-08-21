# Vocabulary Voice Tutor

A private, mobile-first English and German language tutor for one learner.
Practice sets, progress, and a bounded generated-audio cache stay in IndexedDB
on the iPhone. Azure AI Speech plays an audio-only cue and checks a deliberate
English word or sentence; recorded microphone audio is kept only in memory for
that request and is then discarded.

## What the learner can do

- Create and edit English/German practice sets containing words or complete sentences.
- Practise English → German, German → English, or a mix.
- Begin every item with a replayable audio cue while complete written answers
  stay hidden, apart from exact problem-word feedback during a retry.
- Record the English word or sentence for pronunciation feedback in every
  direction. Available aggregate, prosody, and word checks must reach `80/100`.
  Individual sound data does not fail an otherwise correct answer; it helps
  select a child-friendly mouth or tongue tip when a word needs work.
- After a pronunciation retry or answer mismatch, replay the complete English
  model answer at normal or slower pace.
- In English → German, write the German translation and the English answer. In
  German → English, write the English answer.
- Check spelling locally. Exact spelling passes; one edit is shown as a minor
  typo; larger differences are marked for another look.
- Install the PWA on an iPhone and keep all learning records on that device.

There are no points, streaks, rankings, cloud learner accounts, or device sync.

## Architecture

```text
iPhone Safari / installed PWA
            |
            | HTTPS + fixed 30-day family session
            v
vocabulary-web (public Azure Container App)
  - static PWA
  - family-code verification and per-source lockout
  - explicit /tts and /pronunciation gateway routes
            |
            | ACA-internal TLS + independent gateway credential
            v
vocabulary-api (internal Azure Container App; no public route)
            |
            | managed identity + Private Link
            v
Azure AI Speech
```

The ACA environment also reaches Key Vault, Azure Table Storage, and Premium
ACR through private endpoints and private DNS. Their public firewalls deny by
default and permit only the explicitly configured administrator IPv4 `/32` for
local operations. The scheduled no-ingress cleanup job removes expired lockout
rows.

Key Vault and Storage carry the narrowly scoped `SecurityControl=Ignore` tag
required by the inherited SFI policy to permit selected-network public access.
The exemption does not open either service: both retain `Deny` as the default
firewall action and allow only the configured administrator `/32`.

## Repository

```text
apps/web/             React PWA and public Fastify gateway
apps/api/             Internal Fastify Azure Speech API
packages/domain/      Shared contracts, normalization, scoring, state machine
packages/observability/
                      Strict telemetry allowlists and Azure Monitor setup
infra/                Complete Terraform root module
scripts/              Mac-only bootstrap, deployment, IP update, and smoke tools
```

## Local development

Prerequisites:

- Node.js 24 or newer and npm
- Azure CLI
- macOS Keychain with the runtime secrets created by `npm run azure:bootstrap`,
  unless all four development secrets are supplied as environment variables

Install dependencies:

```sh
npm install
```

For an Azure-backed local app, sign in with Azure CLI, copy the environment
template, and configure either `SPEECH_ENDPOINT` or the Speech resource group
and account name:

```sh
az login
cp .env.azure.local.example .env.azure.local
# Edit .env.azure.local
npm run dev:azure
```

The launcher builds the shared packages, reads the four existing runtime
secrets from macOS Keychain, resolves the configured Speech resource, and
starts the Speech API, gateway, and Vite UI together. Open
the URL printed by the launcher (`http://127.0.0.1:5173` by default) and use the
normal family access code. The Speech API authenticates with
`DefaultAzureCredential`, including the identity selected by `az login`.

Local and Azure behavior is selected only through explicit configuration:
`SPEECH_ENDPOINT`, ports, the Vite gateway proxy, and
`SESSION_COOKIE_NAME`/`SESSION_COOKIE_SECURE`. The app does not inspect its
hostname or attempt to detect where it is running.

`localhost` is a browser-secure microphone context. To test from a phone against
the Mac, place the Vite address behind a trusted HTTPS development tunnel or
local certificate; plain LAN HTTP cannot request microphone access. Routine
tests use a Speech test double and do not need Azure credentials.

Project checks:

```sh
npm run lint
npm run typecheck
npm test
npm run build
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
```

## Mac-only Azure provisioning

No GitHub workflow, OIDC identity, repository hook, or cloud build is used.
Infrastructure changes and application releases are reviewed separately on this
Mac with the signed-in Azure CLI identity.

1. Copy `infra/terraform.tfvars.example` to the ignored
   `infra/terraform.tfvars`.
2. Set the exact subscription and one known public administrator IPv4 `/32`.
   The scripts never call an IP-discovery service.
3. Select the same subscription with `az account set`.
4. Run:

```sh
npm run azure:bootstrap
```

Bootstrap prompts invisibly for the family code, keeps the code and its salted
scrypt hash only in macOS Keychain, and generates three independent random
keys there. It creates the shared Azure platform with a saved Terraform plan
and applies only after the operator types `apply`.

Provision the Container Apps, Key Vault values, and first release once:

```sh
npm run azure:provision-workloads
```

This is the only application-image flow that invokes Terraform, because Azure
requires an image when each Container App resource is first created. Terraform
uses one-time `:bootstrap` references, then the script immediately pins the
running workloads to immutable digests. Terraform deliberately ignores later
image changes while continuing to own ingress, identities, secrets, scaling,
probes, networking, and the cleanup schedule.

For every later application release:

```sh
npm run azure:deploy
```

Deployment refuses a dirty Git tree unless `--allow-dirty` is explicit. It runs
the project gates, builds and hardens Linux `amd64` images locally, pushes
Git-SHA tags, resolves immutable digests, and displays the live-to-proposed
Container Apps image changes. After the operator types `deploy`, it updates the
API, web app, and cleanup job directly through Azure CLI. It never invokes
Terraform. Current and previous release manifests remain under ignored
`infra/state/`.

Roll back to the recorded previous immutable release without Terraform:

```sh
npm run azure:rollback
```

If the residential address changes, determine the new address yourself and run:

```sh
npm run azure:update-admin-cidr -- "$ADMIN_IPV4_CIDR"
```

Set `ADMIN_IPV4_CIDR` to the current public IPv4 address with a `/32` suffix.
Documentation, private, shared, or broader address ranges are rejected.

The script first adds the new address through Azure Resource Manager, then
updates local Terraform input and applies a reviewed plan that removes the old
rule from ACR, Key Vault, Storage, and Speech. It never broadens access beyond
one public `/32`.

Run the full production checks at any time:

```sh
npm run azure:smoke
```

For unattended checks on this Mac, read the family code from Keychain instead
of prompting:

```sh
npm run azure:smoke -- --keychain
```

This queries Azure directly and verifies public web health, external API
isolation, family session behavior, TTS, logout, and correlated
gateway/API/Speech telemetry. It does not invoke Terraform or read Terraform
state.

See [`infra/README.md`](infra/README.md) for state backup, restore, import,
destroy, secret rotation, firewall recovery, and rollback details.

## iPhone installation and privacy

1. Open the deployed site in Safari.
2. Use **Share → Add to Home Screen**.
3. Open Vocabulary Tutor from the new icon.
4. Allow microphone access only when prompted for a speaking attempt.

Exercise content, typed answers, aggregate practice results, and up to 256
generated cue or model-playback blobs stay in the iPhone's IndexedDB. Normal and
slower versions use separate cache entries, and the oldest generated audio is
removed as the cache fills. Microphone recordings are never persisted.
The gateway and API disable request-body logging. Telemetry is limited to route,
locale, mode, duration, retry/outcome category, release, and anonymous
per-launch identifiers; it excludes exercise text, translations, transcripts, typed
answers, scores, audio, codes, cookies, tokens, addresses, and rate-limit keys.

The family code intentionally has no minimum strength rule. Five failures from
one normalized source within 15 minutes cause a fixed 30-minute block, but a
weak code still has residual risk from distributed guessing. Choose a code the
family can remember without making it easy to predict.

Vocabulary Voice Tutor is a practice aid, not an authoritative linguistic judgment.
Speech feedback can be affected by noise, microphone position, accent, or
service availability and always invites another attempt.
