# Matters Fediverse Gateway

An open-source ActivityPub gateway that connects Matters' long-form publishing layer to the Fediverse. It lets Mastodon, Misskey, GoToSocial, and other ActivityPub users discover Matters authors, read full public articles, and interact through follows, replies, likes, and boosts while paid, encrypted, private, and message-like content stays outside federation.

> **Status**: G1 in development. Single-instance reference release planned for July 2026.
> **Demo / docs**: <https://thematters.github.io/matters-fediverse-gateway/>
> **Canonical demo actor**: `acct:matters@matters.town`
> **Worker testbed**: <https://gateway-demo.matters.town>
> **Source**: <https://github.com/thematters/matters-fediverse-gateway>
> **Current integration slice**: G2-A preflight is active across review-stage server/generator PRs plus a merged lambda handler. Real public Matters articles have been exported into a non-production staging gateway and delivered once to gyutte.site Misskey; production rollout is not enabled.

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
- Misskey public interoperability now covers discovery, follow, text Article delivery, media attachment display, and human UI visual review on gyutte.site
- GoToSocial probe has local contract coverage; public GoToSocial run is intentionally deferred
- 117 `gateway-core` automated tests passing in the latest local verification snapshot after rebuilding `better-sqlite3` for Node 18
- Public static ActivityPub prototype endpoints and seed bundle live under `thematters.github.io`
- Canonical Matters-domain Cloudflare Worker routes are deployed under `matters.town`
- Isolated Cloudflare Worker testbed remains deployed under `gateway-demo.matters.town`
- G2-A server preflight exists in `matters-server` PR [#4761](https://github.com/thematters/matters-server/pull/4761); GitHub Actions and Codecov now pass, and the PR is waiting for human review before merge to `develop`
- The ActivityPub bundle contract is ready in `ipns-site-generator` PR [#161](https://github.com/thematters/ipns-site-generator/pull/161); CI passes and the PR is waiting for review
- The async federation export worker landed in `lambda-handlers` PR [#217](https://github.com/thematters/lambda-handlers/pull/217); its code build/test passed, while the post-merge ECR publish job needs a version/tag retry because the immutable `v0.13.5` image tag already exists
- Real public Matters articles for `@charlesmungerai` were exported into a staging bundle, served through `charlesmungerai@staging-gateway.matters.town`, and one fresh public Article was delivered to gyutte.site Misskey
- The gateway execution/reporting docs were merged in PR [#5](https://github.com/thematters/matters-fediverse-gateway/pull/5)

## Current blockers and next work

The project is past fixture-only proof of concept, but it is not production-ready. The next concrete work items are:

1. Merge `ipns-site-generator` PR #161 after a non-author reviewer approves it, then use the published package from downstream server/lambda code.
2. Merge `matters-server` PR #4761 to `develop`, deploy it to the `matters.icu` test environment, and verify the migration plus public-only preflight behavior there before any master/production PR.
3. Fix or retry the `lambda-handlers` ECR publish step with a fresh image version/tag, then create or update the federation export dev Lambda from the merged handler.
4. Run the end-to-end `matters.icu` staging check: select explicit public article IDs, run server eligibility/preflight, invoke the lambda generator, inspect returned files or S3 output, ingest the manifest into the staging gateway, and send a public Article to Misskey.
   - The repeatable staging runner is `gateway-core/scripts/run-matters-icu-staging-check.mjs`; see [`research/matters-fediverse-compat/03-ops/matters-icu-staging-e2e-check.md`](research/matters-fediverse-compat/03-ops/matters-icu-staging-e2e-check.md).
   - Product settings, legal/privacy, and production rollout approvals are tracked in [`research/matters-fediverse-compat/05-roadmap/decisions/08-production-rollout-human-approval.md`](research/matters-fediverse-compat/05-roadmap/decisions/08-production-rollout-human-approval.md).
5. Continue G2-B contract work locally: author opt-in state, per-article federation setting behavior, export trigger boundaries, and product-facing copy/API shape.
6. Keep G2-A non-production until production credentials, storage target, migration timing, legal/privacy review, and canonical `acct:user@matters.town` cutover are explicitly approved.

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
