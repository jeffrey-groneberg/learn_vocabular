# Vocabulary Voice Tutor

A private, mobile-first English and German vocabulary tutor for one learner.
Word lists and progress stay in IndexedDB on the iPhone. Azure AI Speech reads
the expected answer and checks a short, deliberate pronunciation attempt;
recorded audio is kept only in memory for that request and is then discarded.

## What the learner can do

- Create and edit English/German word or short-phrase lists.
- Practise English → German, German → English, or a mix.
- Use **Learn** mode to listen first or **Test** mode to recall before reveal.
- Record one bounded pronunciation attempt and receive calm retry guidance.
- Type the answer locally. Exact spelling passes; one edit is shown as a minor
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
- Terraform 1.15.x
- Azure CLI
- Docker with buildx for container validation and deployment
- macOS Keychain and FileVault for production operations

Install and run the frontend:

```sh
npm install
npm run dev
```

Run the local gateway in another terminal with development-only values:

```sh
ACCESS_CODE_HASH='<encoded scrypt hash>' \
COOKIE_SIGNING_KEY='<random key>' \
RATE_LIMIT_PEPPER='<random pepper>' \
INTERNAL_API_CREDENTIAL='<random internal credential>' \
INTERNAL_API_URL='http://127.0.0.1:3001' \
npm run dev:server --workspace @vocabulary/web
```

Run the internal API separately:

```sh
INTERNAL_API_CREDENTIAL='<same internal credential>' \
SPEECH_ENDPOINT='https://<speech-name>.cognitiveservices.azure.com/' \
npm run dev:api
```

The real Speech adapter uses the signed-in Azure identity locally. Routine tests
use a test double and do not need cloud credentials.

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
Everything is planned, reviewed, built, pushed, and applied from this Mac with
the signed-in Azure CLI identity.

1. Copy `infra/terraform.tfvars.example` to the ignored
   `infra/terraform.tfvars`.
2. Set the exact subscription and one known public administrator IPv4 `/32`.
   The scripts never call an IP-discovery service.
3. Select the same subscription with `az account set`.
4. Run:

```sh
npm run azure:bootstrap
```

Bootstrap prompts invisibly for the family code, stores only its salted scrypt
hash, generates three independent random keys, and writes those values to macOS
Keychain. It creates and displays a saved Terraform plan and applies only after
the operator types `apply`.

After shared infrastructure exists:

```sh
npm run azure:deploy
```

Deployment refuses a dirty Git tree unless `--allow-dirty` is explicit. It runs
the project gates, builds Linux `amd64` images locally, starts hardened local
containers, pushes Git-SHA tags to the selected-network ACR, resolves immutable
digests, displays a saved Terraform workload plan, and applies only that
approved plan. The previous digest manifest remains under ignored
`infra/state/` for a reviewed rollback.

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

This verifies public web health, external API isolation, family session
behavior, TTS, logout, and correlated gateway/API/Speech telemetry.

See [`infra/README.md`](infra/README.md) for state backup, restore, import,
destroy, secret rotation, firewall recovery, and rollback details.

## iPhone installation and privacy

1. Open the deployed site in Safari.
2. Use **Share → Add to Home Screen**.
3. Open Vocabulary Tutor from the new icon.
4. Allow microphone access only when prompted for a speaking attempt.

Exercise content, typed answers, and aggregate practice results stay in the
iPhone's IndexedDB. Audio and generated replay blobs are never put in IndexedDB
or Cache Storage. The gateway and API disable request-body logging. Telemetry is
limited to route, locale, mode, duration, retry/outcome category, release, and
anonymous per-launch identifiers; it excludes words, translations, transcripts,
typed answers, scores, audio, codes, cookies, tokens, addresses, and rate-limit
keys.

The family code intentionally has no minimum strength rule. Five failures from
one normalized source within 15 minutes cause a fixed 30-minute block, but a
weak code still has residual risk from distributed guessing. Choose a code the
family can remember without making it easy to predict.

Vocabulary Voice Tutor is a practice aid, not an authoritative linguistic judgment.
Speech feedback can be affected by noise, microphone position, accent, or
service availability and always invites another attempt.
