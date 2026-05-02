---
task_slug: matters-g2-a-production-data-integration
status: active
goal: Connect selected real Matters public author/article output to the federation gateway without touching production credentials or data in the first slice
dispatcher: triad
executor: codex-local
host: any
branch: codex/add-fediverse-execution-plan
latest_commit: local
last_updated: 2026-05-02T18:25:00-04:00
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
next_step: After @matters npm publish permission is available, publish @matters/ipns-site-generator@0.1.9 and replace the temporary matters-server vendored tarball dependency with ^0.1.9.
blockers: npm @matters scope publish permission for registry migration; production author allowlist, opt-in semantics, canonical acct:user@matters.town cutover timing, and production credentials remain human/product gates.
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

## Current Repo-Backed Findings

### matters-server

- Single article publication path: `src/connectors/article/ipfsPublicationService.ts`
- SQS handler: `src/handlers/ipfsPublication.ts`
- Publication trigger: `PublicationService.publishArticle` calls `IPFSPublicationService.triggerPublication`
- Existing generator usage: `makeArticlePage`
- G2-A non-production export scaffold: `src/connectors/article/federationExportService.ts`
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
- Remaining G2-A gap: a real emitted bundle path from Matters has not been wired into a staging config.

## Minimal Engineering Slice

1. Keep the temporary `matters-server` vendored tarball only until npm publish permission is available.
2. Publish `@matters/ipns-site-generator@0.1.9` once the `@matters` scope permission is granted.
3. Replace the `matters-server` file dependency with `@matters/ipns-site-generator@^0.1.9` and remove `vendor/matters-ipns-site-generator-0.1.9.tgz`.
4. Use the committed non-production export scaffold to write selected-author bundles to an explicit local or object-storage staging path with a generated `activitypub-manifest.json`.
5. Point a `gateway-core` staging actor at that manifest through `staticBundleManifestFile`.
6. Run gateway bridge tests against the generated manifest.

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
- Verification: repo-backed source inspection; `ipns-site-generator` tests/lint pass; `matters-server npm ci`, build, targeted Jest, targeted ESLint, `git diff --check`, and commit hook checks pass under Node 18
- Result: G2-A has a non-production exporter scaffold committed in `matters-server` commit `50e2219`; it can produce selected public Article bundle data through the generator contract without production deployment or data mutation
- Remaining risks: product gates above, npm `@matters` scope publish permission, registry migration from the temporary vendored tarball, and later staging manifest ingestion through `gateway-core`
- Follow-up task: after npm permission arrives, publish `@matters/ipns-site-generator@0.1.9`, migrate `matters-server` from vendored tarball to registry dependency, then wire a staging actor to a generated manifest
