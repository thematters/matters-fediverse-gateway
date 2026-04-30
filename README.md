# Matters Fediverse Gateway

An open-source ActivityPub gateway that connects Matters' long-form publishing layer to the Fediverse. It lets Mastodon, Misskey, GoToSocial, and other ActivityPub users discover Matters authors, read full public articles, and interact through follows, replies, likes, and boosts while paid, encrypted, private, and message-like content stays outside federation.

> **Status**: G1 in development. Single-instance reference release planned for July 2026.
> **Demo / docs**: <https://thematters.github.io/matters-fediverse-gateway/>
> **Public demo actor**: `acct:matters@thematters.github.io`
> **Source**: <https://github.com/thematters/matters-fediverse-gateway>

## Why

The Fediverse is strong at short-form social interaction, but long-form publishing is still underserved. Independent media groups, civic writers, multilingual communities, and small publishers need durable essays, archive-first publishing, and federated conversation without operating a full general-purpose social server.

Matters is a long-running, open-source, interoperable IPFS-protocol publishing site and censorship-resistant community-governance platform with more than 280,000 registered users. Matters already has IPFS/IPNS-oriented publishing work and a static ActivityPub output path. This repository packages the missing dynamic layer: a reusable gateway that handles identity discovery, inbox/outbox flows, delivery state, moderation controls, and operator recovery.

## What is in this repository

| Path | Purpose |
| --- | --- |
| [`gateway-core/`](gateway-core/) | Node.js runtime for WebFinger, ActivityPub inbox/outbox, HTTP Signatures, followers state, moderation, persistence, and observability |
| [`cloudflare-worker/`](cloudflare-worker/) | Cloudflare Worker edge demo for ActivityPub content types, route handling, seed bundle exposure, and future `gateway-core` pass-through |
| [`research/matters-fediverse-compat/`](research/matters-fediverse-compat/) | Research, feasibility notes, ADRs, specs, runtime slices, operator notes, and roadmap |
| [`docs/tasks/`](docs/tasks/) | Handoff task files for G1 delivery work |
| [`docs/`](docs/) | GitHub Pages demo and project overview |
| [`docs/ipns-gateway-cloudflare-plan.md`](docs/ipns-gateway-cloudflare-plan.md) | Integration plan for `ipns-site-generator`, `gateway-core`, and a Cloudflare Worker edge |

## Public demo endpoints

These static endpoints demonstrate the read-side federation surface for a demo actor. They are not a production gateway and do not expose a public POST inbox.

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
- First Mastodon sandbox black-box interoperability check completed
- 85 automated tests passing in the latest recorded local verification snapshot
- Public static ActivityPub prototype endpoints and seed bundle live under `thematters.github.io`
- Cloudflare Worker edge demo is implemented and passes Wrangler dry-run packaging

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
Matters main platform
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

`ipns-site-generator` remains responsible for public article output and static publishing. `gateway-core` handles dynamic federation behavior: discovery, inbox handling, signatures, followers, delivery state, moderation operations, and recovery.

For the proposed static bundle contract and edge deployment path, see [`docs/ipns-gateway-cloudflare-plan.md`](docs/ipns-gateway-cloudflare-plan.md).

## License

[AGPL-3.0](LICENSE), aligned with Mastodon, Misskey, GoToSocial, and other network-facing Fediverse software.

## Acknowledgements

Original research and development by [@thematters](https://github.com/thematters). The static publishing layer builds on [`thematters/ipns-site-generator`](https://github.com/thematters/ipns-site-generator).
