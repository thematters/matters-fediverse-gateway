# IPNS Generator, Gateway Core, and Cloudflare Worker Plan

Working date: 2026-04-30

This document defines the practical split between `thematters/ipns-site-generator`, `gateway-core`, and an edge Worker in front of the public gateway.

## Decision

Keep `ipns-site-generator` and `matters-fediverse-gateway` as separate repositories for G1.

Do not merge the repos yet. The two systems have different release risk:

- `ipns-site-generator` publishes static public article bundles and IPFS/IPNS-oriented output.
- `gateway-core` handles dynamic federation state, signed inbox traffic, followers, delivery, moderation, and operator recovery.
- A Cloudflare Worker should front the public domain, normalize edge behavior, route read traffic, and forward dynamic requests to `gateway-core`.

The integration point should be an explicit static bundle contract, not shared internal code.

## Current Fit

`ipns-site-generator` already has `makeActivityPubBundles(data)`. It emits:

- `.well-known/webfinger`
- `about.jsonld`
- `outbox.jsonld`

`gateway-core` already supports an actor-level `staticOutboxFile` and rewrites a static collection into the canonical runtime actor:

- outbox `id` becomes `https://<instance>/users/<handle>/outbox`
- activity `actor` becomes `https://<instance>/users/<handle>`
- object `attributedTo` becomes the canonical actor
- activity `cc` becomes the actor followers collection

That is the right seam for G1: the static publisher produces public Article seeds; the gateway owns the live federation contract.

## Required Changes in ipns-site-generator

1. Emit `Article`, not `Note`

Current static ActivityPub output maps articles to `Note`. Matters long-form publishing should be represented as `Article` objects with `name`, `summary`, `content`, `url`, `published`, `updated`, `attributedTo`, `to`, `cc`, `tag`, and `attachment`.

2. Fix outbox identity

The static outbox collection should have its own id, for example:

```json
{
  "id": "https://<webfinger-domain>/outbox.jsonld",
  "type": "OrderedCollection"
}
```

The actor id should remain separate.

3. Add a public-content gate

Only articles that are intentionally public should enter ActivityPub output. Paid articles, encrypted articles, private drafts, private comments, and message-like data must not be serialized into the federation bundle.

4. Produce a gateway seed manifest

Add a generated file such as `activitypub-manifest.json`:

```json
{
  "version": 1,
  "generator": "ipns-site-generator",
  "actor": {
    "handle": "alice",
    "sourceActorId": "https://alice.example/about.jsonld",
    "webfingerSubject": "acct:alice@alice.example",
    "profileUrl": "https://alice.example"
  },
  "files": {
    "actor": "about.jsonld",
    "outbox": "outbox.jsonld",
    "jsonFeed": "feed.json",
    "rss": "rss.xml"
  },
  "visibility": {
    "federatedPublicOnly": true,
    "excluded": ["paid", "encrypted", "private", "message"]
  }
}
```

5. Keep static WebFinger optional

For personal static sites, `ipns-site-generator` can continue emitting WebFinger. For Matters production, WebFinger should be served by the gateway or Worker so the canonical actor and key material are controlled by runtime config.

## Required Changes in gateway-core

1. Accept a manifest, not only an outbox file

Keep `staticOutboxFile` for compatibility, but add optional `staticBundleManifestFile`:

```json
{
  "actors": {
    "alice": {
      "staticBundleManifestFile": "../static/alice/activitypub-manifest.json"
    }
  }
}
```

The runtime should resolve the manifest, read the listed outbox, validate visibility metadata, and expose the canonical runtime actor.

2. Normalize long-form Article objects through one path

The static outbox bridge and outbound create/update APIs should share Article normalization:

- preserve `type: "Article"`
- preserve `name`, `summary`, safe HTML `content`, canonical `url`, and attachments
- sanitize HTML with an allowlist
- rewrite actor and audience fields to runtime canonical URLs
- reject objects that fail the public-content boundary

3. Add a bundle consistency check

Create a command such as:

```bash
npm run check:static-bundle -- --manifest ../static/alice/activitypub-manifest.json
```

It should fail on missing files, non-public visibility, invalid ActivityPub JSON, wrong object type, malformed URLs, duplicate ids, and missing canonical article links.

4. Add a staging ingestion command

Create a command such as:

```bash
npm run ingest:static-bundle -- --actor alice --manifest ../static/alice/activitypub-manifest.json
```

For G1 this can remain read-through. For G2 it can materialize normalized Article objects into SQLite for faster delivery, search, and audit evidence.

## Cloudflare Worker Role

Use a Worker as the public edge for the canonical `matters.town` ActivityPub routes, while keeping the production site root on the existing Matters application. The isolated Worker testbed can remain available at `gateway-demo.matters.town`.

The Worker should not contain federation business logic. Its job is edge routing and safety:

- Serve or proxy read endpoints with correct content types.
- Forward signed POST requests to `gateway-core` without mutating body bytes or signature headers.
- Apply simple method allowlists and request-size limits.
- Set cache headers for read-only endpoints.
- Normalize canonical host redirects.
- Add CORS only for safe read endpoints.
- Hide admin endpoints from the public internet unless explicitly allowed by operator auth.

The repository now includes a deployed Worker under `cloudflare-worker/`. It serves the canonical Matters-domain prototype actor `acct:matters@matters.town` through narrow routes such as `/.well-known/webfinger` and `/ap/*`, while the isolated testbed remains available at `https://gateway-demo.matters.town`. It serves a Matters main-site example, exposes the seed bundle shape, and can later forward dynamic POST traffic to `gateway-core` through `GATEWAY_CORE_ORIGIN`.

## Worker Routes

Read endpoints:

- `GET /.well-known/webfinger`
- `GET /.well-known/host-meta`
- `GET /.well-known/nodeinfo`
- `GET /nodeinfo/2.1`
- `GET /users/:handle`
- `GET /users/:handle/outbox`
- `GET /users/:handle/followers`
- `GET /users/:handle/following`
- `GET /articles/:slug` if article objects are edge-hosted
- `GET /ap/users/:handle` for the current `matters.town` prototype actor namespace
- `GET /ap/articles/:slug` for the current `matters.town` prototype Article namespace
- `GET /ap/seed/*` for the current `matters.town` seed-bundle exposure

Dynamic endpoints:

- `POST /users/:handle/inbox`
- `POST /inbox`
- `POST /jobs/delivery` only if protected by an internal token or scheduler binding
- `POST /jobs/remote-actors/refresh` only if protected by an internal token or scheduler binding

Operator endpoints:

- `/admin/*` should not be exposed through the public Worker by default.
- If needed, expose it on a separate admin hostname with Access, mTLS, or equivalent operator authentication.

## Worker Fetch Rules

For ActivityPub reads:

- `Content-Type: application/activity+json; charset=utf-8` for actor, outbox, followers, following, and Article objects
- `Content-Type: application/jrd+json; charset=utf-8` for WebFinger
- `Content-Type: application/json; charset=utf-8` for NodeInfo
- `Cache-Control: public, max-age=60, s-maxage=300` for actor and outbox
- shorter cache for followers/following, or no cache if follower privacy policy changes

For inbox POST:

- preserve raw request body
- preserve `Signature`, `Date`, `Digest`, and `Content-Type`
- pass the public host through `x-forwarded-host` and `x-original-url`; if the origin verifier requires the literal public `Host`, run `gateway-core` behind a tunnel or origin route that preserves that host
- reject bodies above the configured size limit
- do not decompress, reserialize, or normalize JSON at the edge
- forward `cf-connecting-ip` or a configured client IP header for rate-limit evidence

## Runtime Topology

G1 pragmatic topology:

```text
Fediverse server
      |
      v
Cloudflare Worker
      |
      v
gateway-core Node runtime
      |
      +-- SQLite persistent volume
      +-- static bundle mount or sync directory
      +-- secrets directory for actor private keys and webhook tokens
      +-- external observability sinks
```

Deployment options:

- Small VM or container host behind Cloudflare Tunnel: lowest operational risk for SQLite and filesystem secrets.
- Fly.io or Render style container with persistent volume: acceptable if filesystem durability is verified.
- Cloudflare Containers can be evaluated later, but should not block G1.
- Cloudflare D1 is not the first choice for G1 because the current runtime is built around SQLite file semantics, backups, and restore drills.

## Minimal G1 Demo Path

1. Generate a static bundle from `ipns-site-generator` for one public test author.
2. Fix the bundle to emit `Article` objects.
3. Add an `activitypub-manifest.json`.
4. Configure `gateway-core` with `staticBundleManifestFile` or current `staticOutboxFile`.
5. Run `npm test` and local sandbox interop.
6. Deploy `gateway-core` with SQLite persistence.
7. Put the Worker in front of it.
8. Verify:
   - WebFinger lookup resolves `acct:alice@<gateway-domain>`.
   - Actor document returns a canonical runtime actor.
   - Outbox returns public Article objects.
   - A Mastodon or GoToSocial test account can follow the actor.
   - The gateway returns `Accept`.
   - Replies, likes, and boosts are recorded without crossing paid/private boundaries.

## Open Questions

- Whether Matters production actor URLs should stay under `https://matters.town/ap/users/<handle>` or later move to a shorter compatibility alias such as `https://matters.town/@<handle>`.
- Whether static personal sites should keep their own WebFinger or delegate canonical identity to the gateway.
- Whether Article bodies should be delivered in full HTML or as summary plus canonical link for the first pilot.
- Which pilot authors can be named publicly in award materials.
