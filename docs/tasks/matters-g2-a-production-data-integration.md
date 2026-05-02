---
task_slug: matters-g2-a-production-data-integration
status: active
goal: Connect selected real Matters public author/article output to the federation gateway without touching production credentials or data in the first slice
dispatcher: triad
executor: codex-local
host: any
branch: codex/add-fediverse-execution-plan
latest_commit: local
last_updated: 2026-05-02T17:05:00-04:00
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
verify_command: repo-specific targeted tests after code begins; current slice is repo-backed contract scan
next_step: Add a non-production exporter path in matters-server that builds HomepageContext for selected public articles and calls makeHomepageBundles plus makeActivityPubBundles.
blockers: publish or otherwise consume the local ipns-site-generator ActivityPub bundle contract from matters-server; production author allowlist, opt-in semantics, canonical acct:user@matters.town cutover timing, and production credentials remain human/product gates.
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

## Current Repo-Backed Findings

### matters-server

- Single article publication path: `src/connectors/article/ipfsPublicationService.ts`
- SQS handler: `src/handlers/ipfsPublication.ts`
- Publication trigger: `PublicationService.publishArticle` calls `IPFSPublicationService.triggerPublication`
- Existing generator usage: `makeArticlePage`
- Missing G2-A piece: no local call site for `makeHomepageBundles` or `makeActivityPubBundles`
- Existing user IPNS resolver: `src/queries/user/ipnsKey.ts`
- Dependency gate: `matters-server` currently locks `@matters/ipns-site-generator@0.1.8` from npm; the local ActivityPub bundle contract must be published, linked, or otherwise made consumable before server code imports `makeActivityPubBundles`.

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

1. Publish or locally wire the `ipns-site-generator` ActivityPub bundle contract so `matters-server` can safely import it without breaking CI.
2. Add a non-production export service or script in `matters-server` that maps selected author/public article rows into `HomepageContext`.
3. Reuse `makeHomepageBundles` and `makeActivityPubBundles`; do not reimplement ActivityPub shape in `matters-server`.
4. Write bundle files to an explicit local or object-storage staging path with a generated `activitypub-manifest.json`.
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
- Verification: repo-backed source inspection; attempted `npm ci` in `matters-server` was blocked by existing lockfile drift and Node 24 vs required Node 18, so full server tests are deferred until the repo has a Node 18 install path and lockfile sync
- Result: G2-A can start with a non-production exporter/manifest slice
- Remaining risks: product gates above, `ipns-site-generator` package publication/linking, plus `matters-server` build/test environment once code begins
- Follow-up task: publish or locally wire the ActivityPub bundle-capable `ipns-site-generator`, then implement the non-production exporter scaffold in `matters-server`
