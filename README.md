# Matters Fediverse Gateway

An open-source ActivityPub gateway that connects Matters' long-form publishing layer to the Fediverse. It lets Mastodon, Misskey, GoToSocial, and other ActivityPub users discover Matters authors, read full public articles, and interact through follows, replies, likes, and boosts while paid, encrypted, private, and message-like content stays outside federation.

> **Status**: G1 in development. Single-instance reference release planned for July 2026.
> **Demo / docs**: <https://thematters.github.io/matters-fediverse-gateway/>
> **Canonical demo actor**: `acct:matters@matters.town`
> **Worker testbed**: <https://gateway-demo.matters.town>
> **Source**: <https://github.com/thematters/matters-fediverse-gateway>
> **Current integration slice**: G2-A preflight has moved past review-stage PRs. `ipns-site-generator` PR #161 is merged to `main`, `matters-server` PR #4761 is merged to `develop` and deployed to `matters.icu`, `lambda-handlers` PR #223 is deployed to `federation-export-dev` as `v0.14.1`, and real deployed-Lambda staging bundles have been ingested by `gateway-core`, checked through WebFinger / actor / outbox / NodeInfo, and verified against gyutte.site Misskey without admin mutations. G2-B product controls are merged through the server/web staging and production paths, and the `mashbean@matters.town` pilot path now has API, browser UI, Lambda, gateway, Mastodon, Misskey, and Threads gateway-side validation. The isolated AWS `gateway-core` origin is connected through the Cloudflare Worker for the canonical pilot actor `acct:mashbeanmatters@matters.town`; readiness passes, g0v.social Mastodon follow created persistent SQLite follower state, gyutte.site Misskey canonical follow converges to `isFollowing=true`, Threads Follow now completes after the embedded-Follow Accept compatibility fix, and offline SQLite backup/restore verification passed against the live origin backup. The disabled-by-default Threads `Note` companion adapter is now deployed in pilot-scoped / threads.net-scoped mode, and the 2026-06-04 bounded proof delivered both the canonical `Article` and companion `Note` to Threads. Production is in `record_only` observation for the approved `mashbean` slice; broad outbound ActivityPub delivery remains disabled outside bounded pilot sends.

## Why

The Fediverse is strong at short-form social interaction, but long-form publishing is still underserved. Independent media groups, civic writers, multilingual communities, and small publishers need durable essays, archive-first publishing, and federated conversation without operating a full general-purpose social server.

Matters is a long-running, open-source, interoperable IPFS-protocol publishing site and censorship-resistant community-governance platform with more than 280,000 registered users. Matters already has IPFS/IPNS-oriented publishing work and a static ActivityPub output path. This repository packages the missing dynamic layer: a reusable gateway that handles identity discovery, inbox/outbox flows, delivery state, moderation controls, and operator recovery.

## What is in this repository

| Path | Purpose |
| --- | --- |
| [`gateway-core/`](gateway-core/) | Node.js runtime for WebFinger, ActivityPub inbox/outbox, HTTP Signatures, followers state, moderation, persistence, and observability |
| [`cloudflare-worker/`](cloudflare-worker/) | Cloudflare Worker edge prototype for canonical `matters.town` ActivityPub routes, isolated testbed routing, seed bundle exposure, and future `gateway-core` pass-through |
| [`research/matters-fediverse-compat/`](research/matters-fediverse-compat/) | Research, feasibility notes, ADRs, specs, runtime slices, operator notes, and roadmap |
| [`docs/tasks/`](docs/tasks/) | Handoff task files for G1 delivery work |
| [`docs/`](docs/) | GitHub Pages demo and project overview |
| [`docs/ipns-gateway-cloudflare-plan.md`](docs/ipns-gateway-cloudflare-plan.md) | Integration plan for `ipns-site-generator`, `gateway-core`, and a Cloudflare Worker edge |

## Public demo endpoints

The canonical Matters-domain ActivityPub surface is exposed from `matters.town` through narrow Cloudflare Worker routes. The root Matters site remains served by the production site; only the federation paths are routed to the Worker.

- WebFinger: <https://matters.town/.well-known/webfinger?resource=acct:matters@matters.town>
- Actor: <https://matters.town/ap/users/matters>
- Outbox: <https://matters.town/ap/users/matters/outbox>
- Article: <https://matters.town/ap/articles/matters-main-site-open-social-demo>
- ActivityPub seed manifest: <https://matters.town/ap/seed/activitypub-manifest.json>
- ActivityPub seed outbox: <https://matters.town/ap/seed/outbox.jsonld>
- NodeInfo discovery: <https://matters.town/.well-known/nodeinfo>
- NodeInfo 2.1: <https://matters.town/ap/instance-info/2.1>

The dedicated Cloudflare Worker testbed keeps the same read-side federation surface isolated from the main domain:

- WebFinger: <https://gateway-demo.matters.town/.well-known/webfinger?resource=acct:matters@gateway-demo.matters.town>
- Actor: <https://gateway-demo.matters.town/users/matters>
- Outbox: <https://gateway-demo.matters.town/users/matters/outbox>
- Article: <https://gateway-demo.matters.town/articles/matters-main-site-open-social-demo>
- ActivityPub seed manifest: <https://gateway-demo.matters.town/seed/activitypub-manifest.json>
- ActivityPub seed outbox: <https://gateway-demo.matters.town/seed/outbox.jsonld>
- NodeInfo discovery: <https://gateway-demo.matters.town/.well-known/nodeinfo>
- NodeInfo 2.1: <https://gateway-demo.matters.town/nodeinfo/2.1>

These static GitHub Pages endpoints demonstrate the same read-side federation surface and ActivityPub seed bundle for a demo actor. They are not a production gateway and do not expose a public POST inbox.

- WebFinger: <https://thematters.github.io/.well-known/webfinger?resource=acct:matters@thematters.github.io>
- Actor: <https://thematters.github.io/users/matters.json>
- Outbox: <https://thematters.github.io/users/matters/outbox>
- Article: <https://thematters.github.io/articles/matters-main-site-open-social-demo>
- ActivityPub seed manifest: <https://thematters.github.io/seed/activitypub-manifest.json>
- ActivityPub seed outbox: <https://thematters.github.io/seed/outbox.jsonld>
- NodeInfo discovery: <https://thematters.github.io/.well-known/nodeinfo>
- NodeInfo 2.1: <https://thematters.github.io/nodeinfo/2.1>

## Current implementation status

- Canonical discoverability: WebFinger, NodeInfo, actor, followers, following
- Follow loop: signed Follow to Accept/Reject, HTTP Signature verification and signing
- Social loop: inbound `Create`, `Reply`, `Like`, `Announce`, `Undo`; outbound `Create`, `Like`, `Announce`, `Update`, `Delete`
- Thread reconstruction and remote `acct:` mention resolution
- Moderation baseline: domain block, actor suspension, legal takedown, rate limits, evidence retention, manual replay
- Persistence: SQLite plus backup, restore, reconcile, and replay tooling
- Observability: metrics, alerts, logs, webhook dispatch, and Slack incoming webhook support
- Mastodon sandbox black-box interoperability check completed
- `g0v.social` exact discovery and inbound follow delivery confirmed for `acct:matters@matters.town`
- Canonical `acct:mashbeanmatters@matters.town` follow readiness is live through the AWS `gateway-core` origin and Cloudflare Worker proxy; g0v.social Mastodon follow reached the origin inbox, passed HTTP Signature verification, wrote one persistent SQLite follower row, and received a signed Accept with HTTP 202
- AWS origin backup/restore evidence is now available: a live SQLite backup was restored into an offline drill file, `PRAGMA integrity_check` returned `ok`, and the restored database preserved 1 follower row, 32 trace rows, and 6 runtime metadata rows without overwriting the live database
- Misskey public interoperability now covers discovery, follow, text Article delivery, media attachment display, and human UI visual review on gyutte.site
- Misskey canonical follow now converges: gyutte.site resolves `mashbeanmatters@matters.town`, sends signed Follow activities to gateway-core, receives delivered Accept responses, and reports `isFollowing=true` after the staging actor key id was moved to `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517` to avoid the earlier Worker demo key cache
- Canonical pilot Article visibility now passes on Mastodon / g0v.social and Misskey / gyutte.site; Misskey reply, like, and boost-style interactions return to gateway-core and persist as SQLite inbound state. Evidence: [`canonical-pilot-article-interop-20260517.md`](research/matters-fediverse-compat/03-ops/canonical-pilot-article-interop-20260517.md)
- The 2026-05-17 feature dependency audit updated the dependent scripts, gates, and runbooks for the new baseline: canonical `matters.town` pilot identity, `mashbean` record-only / observation preparation, versioned key id, and Threads as a non-blocking compatibility track. See [`12-feature-dependency-audit-20260517.md`](research/matters-fediverse-compat/05-roadmap/decisions/12-feature-dependency-audit-20260517.md).
- `matters-server` PR [#4798](https://github.com/thematters/matters-server/pull/4798) is merged to `master` and adds `User.features.fediverseBeta` as the public-safe current-viewer eligibility field. `User.oss.featureFlags` remains admin-only inventory and should not gate user-facing Fediverse controls.
- `matters-web` PR [#5905](https://github.com/thematters/matters-web/pull/5905) is merged to `master` and restores Fediverse settings, draft controls, and article edit controls through `viewer.features.fediverseBeta`. PR [#5906](https://github.com/thematters/matters-web/pull/5906) is also merged and hides the settings row until eligibility is loaded; develop parity PR [#5907](https://github.com/thematters/matters-web/pull/5907) is merged and deployed on `matters.icu`.
- GoToSocial probe has local contract coverage; public GoToSocial run is intentionally deferred
- 141 `gateway-core` automated tests passing in the latest local verification snapshot after rebuilding `better-sqlite3` for the current local Node runtime
- Public static ActivityPub prototype endpoints and seed bundle live under `thematters.github.io`
- Canonical Matters-domain Cloudflare Worker routes are deployed under `matters.town`, including the pilot actor `acct:mashbeanmatters@matters.town`; configured pilot reads and inbox writes are proxied to the AWS `gateway-core` origin
- Isolated Cloudflare Worker testbed remains deployed under `gateway-demo.matters.town`
- G2-A server preflight landed in `matters-server` PR [#4761](https://github.com/thematters/matters-server/pull/4761), merged to `develop`, and the post-merge develop deploy to `matters.icu` passed
- The ActivityPub bundle contract landed in `ipns-site-generator` PR [#161](https://github.com/thematters/ipns-site-generator/pull/161), merged to `main`
- The async federation export worker landed in `lambda-handlers` PR [#217](https://github.com/thematters/lambda-handlers/pull/217); follow-up PR [#223](https://github.com/thematters/lambda-handlers/pull/223) removed duplicate manifest output, published `v0.14.1`, updated `federation-export-dev`, and passed fixture smoke verification
- Real `matters.icu` public API data passed the deployed `federation-export-dev` Lambda path twice: article `23520` was eligible, paywalled article `23522` was skipped as `article_not_public`, the generated bundle contained seven unique files, and `gateway-core` served it as `zeckagent3@staging-gateway.matters.town`
- The same `matters.icu` rows also passed a strict gate staging run with row-level `authorFederationSetting=enabled` and `articleFederationSetting=inherit`; public article `23520` remained eligible while paywalled article `23522` remained blocked as `article_not_public`
- G2-B product controls are merged to `develop`: `matters-server` PR [#4773](https://github.com/thematters/matters-server/pull/4773) adds read-side federation settings plus pilot-scoped author/article mutations, and `matters-web` PR [#5883](https://github.com/thematters/matters-web/pull/5883) adds pilot UI controls for account-level opt-in and per-article override
- `matters-server` and `matters-web` develop deploys for G2-B both passed on 2026-05-11; `server.matters.icu` schema exposes the new federation fields and mutations
- G2-B staging pilot/admin setup is now verified on `matters.icu`: `mashbean@matters.town` signs in as admin, has `fediverseBeta`, and account-level federation is `enabled`
- Real staging settings now make public article `23520` eligible through the server gate while paywalled article `23522` remains blocked as `article_not_public`; strict-gate deployed-Lambda dry-run [25712528545](https://github.com/thematters/lambda-handlers/actions/runs/25712528545) selected 2 rows, exported 1 public Article, skipped 1 paywalled Article, and returned the expected seven-file bundle
- The pilot-owned staging article `23525` (`ckl5le599uwc`) was created through `matters.icu`, account settings showed the Fediverse row enabled, article edit settings showed the Fediverse override as `Follow author setting`, and strict-gate deployed-Lambda dry-run [25713858021](https://github.com/thematters/lambda-handlers/actions/runs/25713858021) exported it as `mashbeanmatters@staging-gateway.matters.town`
- The `mashbeanmatters` staging bundle passed `gateway-core` ingestion, WebFinger / actor / outbox / NodeInfo public probes, SQLite consistency scan with `totalDiffs=0`, secret layout check, automated tests, and gyutte.site Misskey read-side account resolution
- `matters-server` PR [#4774](https://github.com/thematters/matters-server/pull/4774) is merged to `develop`; deploy run [25768243309](https://github.com/thematters/matters-server/actions/runs/25768243309) passed build, develop DB migration, Elastic Beanstalk deploy, develop Lambda deploy, and notification. The scaffold stays default-off unless `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` is configured on the staging environment.
- Production `matters-server-prod-new` now has `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` for the approved `mashbean` observation slice. Elastic Beanstalk returned to Ready / Green / Ok, `server.matters.town` health returned 200, production GraphQL exposes `UserFeatures.fediverseBeta`, and `gateway-core` `check:production-record-only` passed again on 2026-05-22 with full outbound disabled, outbox `totalItems=0`, and followers `totalItems=2`.
- Production pilot infrastructure gates now include private S3 storage at `s3://matters-fediverse-prod-bundles/pilot/`, a fresh live-origin SQLite backup, and a 2026-05-22 consistency scan with only explained SQLite-primary diffs. Full outbound ActivityPub delivery is still disabled.
- Production pilot article [`3tmz0u0a42qx`](https://matters.town/a/3tmz0u0a42qx) is active, public, owned by `mashbean`, and a 2026-05-18 production GraphQL check reports `federationEligibility.eligible=true` with effective article setting `inherit`. `matters-server` PR [#4804](https://github.com/thematters/matters-server/pull/4804) is merged, and read-only production workflow run [26079277083](https://github.com/thematters/matters-server/actions/runs/26079277083) confirmed one `federation_export_event` row for article `1225211`: `trigger=publish_article`, `mode=record_only`, `status=recorded`, `eligible=true`, `reason=eligible`, `author_setting=enabled`, and `effective_article_setting=inherit`.
- The generated `zeckagent3` Article was delivered through `gateway-core` to gyutte.site Misskey; a follow-up read-only Misskey dry-run resolved the actor, confirmed one follower, and prepared a public Create without sending it
- The latest `zeckagent3` staging probe also validates WebFinger, actor, outbox, NodeInfo discovery, NodeInfo 2.1 ActivityPub support, bundle manifest shape, and SQLite consistency with zero diffs against the G2-B strict-gate bundle
- Real public Matters articles for `@charlesmungerai` were exported into a staging bundle, served through `charlesmungerai@staging-gateway.matters.town`, and one fresh public Article was delivered to gyutte.site Misskey
- The gateway execution/reporting docs were merged in PR [#5](https://github.com/thematters/matters-fediverse-gateway/pull/5)

## Current blockers and next work

The project is past fixture-only proof of concept, but it is not production-ready. The next concrete work items are:

1. Keep the isolated AWS `gateway-core` origin healthy for the canonical pilot path. `GATEWAY_CORE_ORIGIN` is enabled only for the narrow Worker federation routes, `/healthz` reports `component=gateway-core`, and actor key files are present on the VM.
   - The AWS origin runbook is [`research/matters-fediverse-compat/03-ops/aws-gateway-core-origin-runbook.md`](research/matters-fediverse-compat/03-ops/aws-gateway-core-origin-runbook.md).
   - The CloudShell bootstrap script is [`gateway-core/deploy/aws-gateway-core-origin-cloudshell.sh`](gateway-core/deploy/aws-gateway-core-origin-cloudshell.sh).
   - The origin config must use `instance.activityPathPrefix: "/ap"` for canonical `matters.town/ap/*` identity.
2. Keep the deployed-Lambda staging proof repeatable: rerun explicit public article IDs through `federation-export-dev`, ingest the returned manifest into staging gateway, and preserve the Misskey delivery report.
   - The repeatable staging runner is `gateway-core/scripts/run-matters-icu-staging-check.mjs`; see [`research/matters-fediverse-compat/03-ops/matters-icu-staging-e2e-check.md`](research/matters-fediverse-compat/03-ops/matters-icu-staging-e2e-check.md).
   - The `record_only` trigger validation runbook is [`research/matters-fediverse-compat/03-ops/record-only-trigger-validation-runbook.md`](research/matters-fediverse-compat/03-ops/record-only-trigger-validation-runbook.md).
   - Product settings, legal/privacy, and production rollout approvals are tracked in [`research/matters-fediverse-compat/05-roadmap/decisions/08-production-rollout-human-approval.md`](research/matters-fediverse-compat/05-roadmap/decisions/08-production-rollout-human-approval.md).
3. Keep `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` on both the `matters.icu` develop server environment and the approved production pilot observation path. Use staging for repeatable audit validation and production only for the `mashbean` record-only pilot.
   - The G2-B task note is [`docs/tasks/matters-g2-b-web-app-integration.md`](docs/tasks/matters-g2-b-web-app-integration.md).
   - The product contract slice is [`research/matters-fediverse-compat/02-runtime-slices/g2b-product-contract-slice.md`](research/matters-fediverse-compat/02-runtime-slices/g2b-product-contract-slice.md).
   - The exact staging pilot checklist is [`research/matters-fediverse-compat/03-ops/g2b-staging-pilot-validation-checklist.md`](research/matters-fediverse-compat/03-ops/g2b-staging-pilot-validation-checklist.md).
   - The accepted default is conservative: author federation is off by default, author opt-in is explicit, article setting defaults to `inherit`, `disabled` always wins, and existing public articles are not backfilled automatically on opt-in.
4. Production preparation may proceed for the `mashbean` pilot author in record-only / observation mode, but full outbound delivery remains gated. Mastodon canonical follow proof, Misskey canonical follow convergence, canonical pilot Article visibility, Misskey interaction return, Threads gateway-side Follow/Accept delivery, Threads profile/feed visibility, Threads Like return, and AWS origin offline backup/restore proof have passed. The Threads `Note` companion adapter is enabled only for `mashbeanmatters` and `threads.net`; the 2026-06-04 bounded proof delivered the main `Article` and companion `Note` after PR #108 changed the companion payload to plain text. The expanded Threads discovery regression now verifies exact public activity/object URLs with Meta-like user agents and returned `ok=true` for WebFinger, actor, outbox, Article, Note, and companion activity. Threads account search, single-post permalink, and reply remain open receiver-visible checks. Production private S3 storage and public `Create`/`Update`/`Delete` delivery after rollout are approved, but remote visible withdrawal must be described as best-effort because gyutte.site accepted Delete delivery without removing the imported note.
   - The read-only production preparation preflight is `cd gateway-core && npm run check:production-record-only`. It checks canonical gateway health, WebFinger, actor paths, outbox, followers, `record_only`, pilot author `mashbean`, full outbound disabled, and versioned key id without sending ActivityPub activities. The 2026-05-22 run returned `ok=true`, outbox `totalItems=0`, and followers `totalItems=2`.
   - Production audit-row verification for article `1225211` has passed in read-only workflow run [26079277083](https://github.com/thematters/matters-server/actions/runs/26079277083). Keep using the [`production-record-only-observation-runbook.md`](research/matters-fediverse-compat/03-ops/production-record-only-observation-runbook.md) command sequence for repeat checks.
   - Do not enable full production outbound delivery until storage, legal/privacy, rollback, takedown, key rotation, and launch approval gates are closed. The narrow pilot sequence is prepared in [`production-pilot-outbound-runbook.md`](research/matters-fediverse-compat/03-ops/production-pilot-outbound-runbook.md), and the blocking final gates are separated in [`production-pilot-final-gates-20260522.md`](research/matters-fediverse-compat/03-ops/production-pilot-final-gates-20260522.md), but the pilot has not been executed.

## G1 roadmap, May-July 2026

The G1 goal is a single-instance reference release that Matters can run, inspect, and later connect to production.

1. [W1 staging observability drill](docs/tasks/matters-g1-w1-staging-observability-drill.md)
2. [W3 Misskey and GoToSocial interoperability](docs/tasks/matters-g1-w3-misskey-gotosocial-interop.md)
3. [W4a long-form Article systematization](docs/tasks/matters-g1-w4a-longform-article-systematization.md)
4. [W5 paid/private boundary enforcement](docs/tasks/matters-g1-w5-paid-private-boundary-enforcement.md)
5. [W6 key rotation flow](docs/tasks/matters-g1-w6-key-rotation-flow.md)
6. [W2 consistency scan](docs/tasks/matters-g1-w2-consistency-scan.md)
7. [W8 incident runbooks and tabletop drill](docs/tasks/matters-g1-w8-incident-runbooks-tabletop.md)

The full roadmap is in [`research/matters-fediverse-compat/05-roadmap/development-plan.md`](research/matters-fediverse-compat/05-roadmap/development-plan.md).

## Quick start

```bash
cd gateway-core
npm install
npm test
npm start
```

The default development runtime reads `config/dev.instance.json` and writes state to `runtime/dev-state.sqlite`.

## Architecture

```text
matters-server
public-only eligibility / author and article federation settings
        |
        v
lambda-handlers federation-export
async bundle generation / optional S3 publication
        |
        v
ipns-site-generator
static public article bundle / ActivityPub seed bundle
        |
        v
Cloudflare Worker
edge routing / content types / cached reads / signed POST pass-through
        |
        v
gateway-core
dynamic inbox / followers state / delivery queue / moderation / ops
        |
        v
Mastodon, Misskey, GoToSocial, and other ActivityPub implementations
```

The integration spans three key repositories:

| Repo | Role | Produces / consumes | Does not own |
| --- | --- | --- | --- |
| [`thematters/matters-server`](https://github.com/thematters/matters-server) | Matters product backend and source of real article data | Owns author/article federation settings, public-only eligibility checks, and selected public article payloads for export | Bundle rendering, file publication, ActivityPub delivery state, remote followers, Fediverse inbox processing |
| [`thematters/lambda-handlers`](https://github.com/thematters/lambda-handlers) | Async export worker home | Runs retryable federation export jobs outside the main server runtime; returns generated files for preflight or writes to S3 when configured | Product permission decisions, public request handling, gateway social state |
| [`thematters/ipns-site-generator`](https://github.com/thematters/ipns-site-generator) | Static publishing and bundle generator | Converts a `HomepageContext` into HTML, RSS, JSON Feed, WebFinger, actor, outbox, and `activitypub-manifest.json` files | Product permissions, production DB access, retry orchestration, delivery queues, moderation runtime |
| [`thematters/matters-fediverse-gateway`](https://github.com/thematters/matters-fediverse-gateway) | Federation gateway repository | Contains `gateway-core` and the Cloudflare Worker/testbed docs; ingests the generated manifest and serves canonical ActivityPub identity, inbox/outbox, delivery, moderation, persistence, and observability | Source article editing/publishing UI and the IPFS/IPNS static page generator |

In short: `matters-server` decides which real public Matters content may be exported, `lambda-handlers` runs the retryable export job outside the main backend, `ipns-site-generator` turns that content into a durable public ActivityPub seed bundle, and `gateway-core` turns the seed bundle into a live Fediverse actor with signatures, followers, queues, moderation, and recovery.

For the proposed static bundle contract and edge deployment path, see [`docs/ipns-gateway-cloudflare-plan.md`](docs/ipns-gateway-cloudflare-plan.md).

## License

[AGPL-3.0](LICENSE), aligned with Mastodon, Misskey, GoToSocial, and other network-facing Fediverse software.

## Acknowledgements

Original research and development by [@thematters](https://github.com/thematters). The static publishing layer builds on [`thematters/ipns-site-generator`](https://github.com/thematters/ipns-site-generator).
