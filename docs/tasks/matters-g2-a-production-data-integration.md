---
task_slug: matters-g2-a-production-data-integration
status: active
goal: Connect selected real Matters public author/article output to the federation gateway without touching production credentials or data in the first slice
dispatcher: triad
executor: codex-local
host: any
branch: codex/add-fediverse-execution-plan
latest_commit: updated-in-branch
last_updated: 2026-05-02T22:50:00-04:00
tmux_session: none
host_affinity: none
outputs_scope: matters-server, ipns-site-generator, gateway-core
shared_paths:
  - research/matters-fediverse-compat/02-runtime-slices/g2a-production-data-integration-slice.md
related_repos:
  - ../matters-server
  - ../ipns-site-generator
  - .
related_paths:
  - ../matters-server/src/connectors/article/ipfsPublicationService.ts
  - ../matters-server/src/handlers/ipfsPublication.ts
  - ../ipns-site-generator/src/makeHomepage/index.ts
  - ../ipns-site-generator/src/types.ts
  - gateway-core/src/lib/static-outbox-bridge.mjs
  - gateway-core/src/config.mjs
local_paths:
  - none
start_command: none
stop_command: none
verify_command: matters-server npm ci, npm run build, targeted federationExportService Jest, targeted ESLint, git diff --check
next_step: Fix matters-server PR #4761 Codecov coverage; GitHub Actions build is green, but Codecov patch/project still fails. Resolve npm registry migration once @matters scope publish permission is available; continue G2-B contract scaffolding without production deployment.
blockers: npm @matters scope publish permission for registry migration; production credentials/storage, canonical acct:user@matters.town cutover timing, author-facing copy/defaults, and legal/privacy beta readiness remain human/product gates.
---

# Task Handoff

## Context

G2-A replaces fixture-only ActivityPub seed data with selected real Matters public article output. The current local repos show that the pieces exist but are not yet connected:

- `matters-server` already depends on `@matters/ipns-site-generator` and publishes single article IPFS bundles through `IPFSPublicationService`.
- `ipns-site-generator` already emits `activitypub-manifest.json`, `outbox.jsonld`, WebFinger, and actor files through `makeActivityPubBundles`.
- `gateway-core` already accepts `staticBundleManifestFile` and validates `visibility.federatedPublicOnly: true` before bridging the outbox.

## Acceptance Criteria

- A selected author export can build `HomepageContext` from real public Matters article rows without exposing non-public content.
- The export emits `index.html`, `rss.xml`, `feed.json`, `.well-known/webfinger`, `about.jsonld`, `outbox.jsonld`, and `activitypub-manifest.json`.
- `activitypub-manifest.json` declares `version: 1` and `visibility.federatedPublicOnly: true`.
- `gateway-core` can ingest the emitted manifest through `staticBundleManifestFile` and expose canonical runtime actor/outbox URLs.
- The first code slice stays non-production: no production credentials, no production data mutation, no deployment.

## Change Log

- 2026-05-02 created from G2-A preflight under triad O-0020
- 2026-05-02 `ipns-site-generator` release-readiness checked locally: `npm test -- --runInBand` passed 9/9 and `npm run lint` passed; no dirty diff after verification
- 2026-05-02 `ipns-site-generator` branch `codex/release-ipns-activitypub-bundle` bumped package metadata to `0.1.9` in commit `0cd6e88`; local tarball generated at `/tmp/matters-ipns-site-generator-0.1.9.tgz`
- 2026-05-02 `matters-server` branch `codex/g2a-federation-export-preflight` created; no code changes made because local Node 18 is unavailable and Node 24 should not be used to rewrite its lockfile
- 2026-05-02 local Node 18.20.8 installed under the shared tooling directory and `matters-server npm ci` passed without rewriting the lockfile
- 2026-05-02 `matters-server` commit `50e2219` added a non-production federation export scaffold, tests, and a temporary vendored `@matters/ipns-site-generator@0.1.9` tarball dependency because npm publish permission for the `@matters` scope is not yet available
- 2026-05-02 `matters-server` verification passed: `npm run build`, targeted `federationExportService` Jest 5/5, targeted ESLint, `git diff --check`, and the repository commit hook build/gen/lint/prettier checks
- 2026-05-02 `matters-server` commit `bac7511` added a local bundle writer for generated homepage/ActivityPub files, including path traversal protection and temp-dir tests; targeted Jest now passes 7/7
- 2026-05-02 `matters-server` commit `4761f78` added `npm run federation:export`, supports fixture mode and read-only DB article ID mode, fixes the generated manifest contract to `version: 1` and `visibility.federatedPublicOnly: true`, and masks connection-string-like secrets in CLI errors
- 2026-05-02 public API candidate article selected without private credentials: `mashbean` article ID `1111146`, short hash `oq72hz05fwnl`, state `active`, access `public`
- 2026-05-02 generated bundle stored outside git at `triad-ops/team/artifacts/O-0020/mashbean-public-api-bundle/site`; gateway-core static bundle bridge read the manifest and normalized one `Article` item
- 2026-05-02 local `better-sqlite3` native module rebuilt for gateway-core; SQLite runtime server started locally with the generated bundle config
- 2026-05-02 local endpoint probe passed: WebFinger returned `acct:mashbean@staging-gateway.matters.town`, actor endpoint returned `Person`, and outbox returned one `Article`
- 2026-05-02 updated test author to `@charlesmungerai`; public API returned three `active` / `public` articles: `1182465` (`wdzgj6wllhrf`), `1181808` (`mgbaikfdg7a9`), and `1181797` (`drxqcpmy0obk`)
- 2026-05-02 generated `charlesmungerai` bundle stored outside git at `triad-ops/team/artifacts/O-0020/charlesmungerai-public-api-bundle/site`; local gateway-core SQLite runtime served WebFinger, actor, and outbox successfully with three `Article` items
- 2026-05-02 exposed the generated `charlesmungerai` bundle through the existing local Cloudflare Tunnel staging hostname; public WebFinger, actor, and outbox probes passed for `acct:charlesmungerai@staging-gateway.matters.town`, while `staging-admin` remained local-only
- 2026-05-02 Misskey public run on gyutte.site resolved/followed `charlesmungerai@staging-gateway.matters.town`; existing outbox Articles were not backfilled into `users/notes`
- 2026-05-02 gateway sent the first generated public Matters Article (`1182465`) through `POST /users/charlesmungerai/outbox/create`; delivery to the gyutte.site follower returned `delivered`, and Misskey `users/notes` matched the Article
- 2026-05-02 `matters-server` commit `f8d410b` added the first G2-B contract scaffold: `resolveFederationExportGate` requires explicit author opt-in, supports per-article `inherit` / `enabled` / `disabled`, and prevents any setting from overriding the public-only boundary
- 2026-05-02 `matters-server` commit `af4dffb` added durable schema scaffold tables `user_federation_setting` and `article_federation_setting`; migration is committed for review but was not run against production
- 2026-05-02 `matters-server` commit `3497556` wired strict gate enforcement into the exporter behind `--enforce-federation-gate` / `MATTERS_FEDERATION_REQUIRE_OPT_IN=true`; default preflight behavior remains unchanged
- 2026-05-02 `matters-server` commit `2ae14bf` kept default DB export migration-safe: federation setting tables are joined only when strict gate mode is explicitly enabled
- 2026-05-02 `matters-server` commit `266a1e1` added CLI `decisionReport` output so export runs record selected, eligible, skipped, and per-article gate reasons without exposing secrets
- 2026-05-02 `matters-server` commit `9e3ae63` added DB loader tests for migration-safe default export and strict-setting query behavior; local Node 18 verification passed with build, targeted lint, targeted Jest 18/18, `federationExportService.ts` 97.61% local line coverage, `git diff --check`, and pre-commit build/gen/lint/format. GitHub Actions build passed, but Codecov still reports 26.20% patch coverage with missing lines mainly in `federationExportService.ts` and the federation settings migration scaffold
- 2026-05-02 `gateway-core` rebuilt `better-sqlite3` for Node 18 and full `npm test` passed 117/117
- 2026-05-02 gateway docs PR branch rebased onto `origin/main`, duplicate local `* 2.*` untracked files cleaned, and draft PR #5 updated

## Current Repo-Backed Findings

### matters-server

- Single article publication path: `src/connectors/article/ipfsPublicationService.ts`
- SQS handler: `src/handlers/ipfsPublication.ts`
- Publication trigger: `PublicationService.publishArticle` calls `IPFSPublicationService.triggerPublication`
- Existing generator usage: `makeArticlePage`
- G2-A non-production export scaffold and local writer: `src/connectors/article/federationExportService.ts`
- Local export CLI: `src/connectors/article/federationExportCli.ts`, exposed as `npm run federation:export`
- Federation eligibility gate: `src/connectors/article/federationExportService.ts` exports `resolveFederationExportGate`; docs live in `docs/Federation-Export.md`
- Existing user IPNS resolver: `src/queries/user/ipnsKey.ts`
- Dependency bridge: `matters-server` currently consumes `vendor/matters-ipns-site-generator-0.1.9.tgz` as a temporary local dependency. This keeps preflight moving without npm scope permission, but should be migrated to `@matters/ipns-site-generator@^0.1.9` after publication.

### ipns-site-generator

- ActivityPub output function: `src/makeHomepage/index.ts`
- Required input: `HomepageContext` with `byline.author.webfDomain`
- Public-only boundary: `isFederationPublicArticle`
- Manifest output: `activitypub-manifest.json`
- Existing tests cover Article output, attachment, manifest, and explicit non-public filtering.

### gateway-core

- Manifest ingestion: `gateway-core/src/lib/static-outbox-bridge.mjs`
- Config entry: actor `staticBundleManifestFile`
- Manifest guard: `version: 1` and `visibility.federatedPublicOnly: true`
- Current G2-A staging status: a real emitted bundle path from public Matters data is wired into local staging config and exposed through the existing Cloudflare Tunnel. The committed source of truth remains docs plus generated artifacts; ignored local runtime config and bundles are intentionally not committed.

## Minimal Engineering Slice

1. Keep the temporary `matters-server` vendored tarball only until npm publish permission is available.
2. Publish `@matters/ipns-site-generator@0.1.9` once the `@matters` scope permission is granted.
3. Replace the `matters-server` file dependency with `@matters/ipns-site-generator@^0.1.9` and remove `vendor/matters-ipns-site-generator-0.1.9.tgz`.
4. Use `npm run federation:export` in fixture mode for public API snapshots or in `--article-id` mode with read-only staging DB credentials.
5. Keep the local staging actor pointed at the generated `activitypub-manifest.json` through `staticBundleManifestFile` for continued non-production probes.
6. Continue G2-B contract scaffolding without production deployment: author opt-in state, per-article federation setting shape, and export trigger boundaries.

## Human Gates

- Pilot author list.
- Author opt-in semantics and per-article federation default.
- Canonical cutover timing for `acct:user@matters.town`.
- Production storage/credentials.
- Legal/privacy approval for beta.

## Handoff

- Task: G2-A production data integration preflight
- Branch: `codex/add-fediverse-execution-plan`
- Changed files: this task note plus the G2-A runtime slice
- Verification: repo-backed source inspection; `ipns-site-generator` tests/lint pass; `matters-server npm ci`, build, targeted Jest 18/18, targeted ESLint, `git diff --check`, and commit hook checks pass under Node 18; `gateway-core npm test` passed 117/117 after rebuilding `better-sqlite3`
- Result: G2-A has a non-production exporter scaffold in `matters-server` commits `50e2219`, `bac7511`, `4761f78`, `f8d410b`, `af4dffb`, `3497556`, `2ae14bf`, `266a1e1`, and `9e3ae63`; it produced public API snapshot bundles for `mashbean` and `charlesmungerai`, served `charlesmungerai` through public staging WebFinger/actor/outbox, and delivered one real public Matters Article to Misskey
- Remaining risks: product gates above, npm `@matters` scope publish permission, registry migration from the temporary vendored tarball, production credential/storage choices, canonical `acct:user@matters.town` cutover, and PR #4761 Codecov failure
- Follow-up task: fix PR #4761 Codecov coverage; after npm permission arrives, publish `@matters/ipns-site-generator@0.1.9`, migrate `matters-server` from vendored tarball to registry dependency, rerun Node 18 checks, then continue G2-B author opt-in/per-article setting/API contract scaffolding
