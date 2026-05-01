# Matters Fediverse Gateway Worker

This Cloudflare Worker is the public edge demo for Matters Fediverse Gateway. It now serves both the isolated Worker testbed and the canonical Matters-domain prototype routes.

It serves a Matters main-site example:

- WebFinger
- NodeInfo
- ActivityPub actor
- followers and following collections
- canonical outbox
- canonical Article object
- static ActivityPub seed bundle files that model the output expected from `thematters/ipns-site-generator`

The Worker can also be used as the edge in front of a future `gateway-core` runtime. In that mode, read endpoints may still be cached at the edge, while signed inbox POST traffic should be forwarded to `gateway-core`.

## Deployed Demo

The canonical public demo actor is:

```text
acct:matters@matters.town
```

The canonical Matters-domain ActivityPub endpoints are routed narrowly through the Worker:

```text
https://matters.town/.well-known/webfinger?resource=acct:matters@matters.town
https://matters.town/ap/users/matters
https://matters.town/ap/users/matters/outbox
https://matters.town/ap/articles/matters-main-site-open-social-demo
https://matters.town/ap/seed/activitypub-manifest.json
https://matters.town/ap/seed/outbox.jsonld
https://matters.town/.well-known/nodeinfo
https://matters.town/ap/instance-info/2.1
```

The isolated Worker testbed remains:

```text
https://gateway-demo.matters.town
```

The testbed actor is:

```text
acct:matters@gateway-demo.matters.town
```

The temporary probe domain used for Mastodon cache-isolation diagnostics is:

```text
https://gateway-probe.matters.town
```

## Local Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

By default this deploys to a `workers.dev` hostname:

```text
https://matters-fediverse-gateway-demo.<account>.workers.dev
```

The current `wrangler.toml` pins deployment to the Matters Lab Cloudflare account by `account_id`, keeps the verified custom Worker domain, and adds narrow main-domain routes for ActivityPub discovery and objects:

```toml
[[routes]]
pattern = "gateway-demo.matters.town"
custom_domain = true

[[routes]]
pattern = "gateway-probe.matters.town"
custom_domain = true

[[routes]]
pattern = "matters.town/.well-known/webfinger*"
zone_name = "matters.town"

[[routes]]
pattern = "matters.town/.well-known/host-meta"
zone_name = "matters.town"

[[routes]]
pattern = "matters.town/.well-known/nodeinfo"
zone_name = "matters.town"

[[routes]]
pattern = "matters.town/nodeinfo/*"
zone_name = "matters.town"

[[routes]]
pattern = "matters.town/ap/*"
zone_name = "matters.town"
```

### Cloudflare API Token

Create a Cloudflare user API token with these permissions:

- Account / Workers Scripts / Edit
- Account / Account Settings / Read
- User / User Details / Read
- User / Memberships / Read

Scope account resources to `Matters Lab`. For the `gateway-demo.matters.town` custom domain and the narrow `matters.town` routes, Wrangler deploys also need Zone / Workers Routes / Edit for the `matters.town` zone.

Use the token as an environment variable and do not commit it:

```bash
CLOUDFLARE_API_TOKEN=... npm run deploy
```

## Demo Endpoints

Replace `<worker-origin>` with the deployed Worker origin. For the isolated testbed, `<worker-origin>` is `https://gateway-demo.matters.town`.

- `<worker-origin>/.well-known/webfinger?resource=acct:matters@<worker-host>`
- `<worker-origin>/.well-known/nodeinfo`
- `<worker-origin>/nodeinfo/2.1`
- `<worker-origin>/users/matters`
- `<worker-origin>/users/matters/outbox`
- `<worker-origin>/articles/matters-main-site-open-social-demo`
- `<worker-origin>/seed/activitypub-manifest.json`
- `<worker-origin>/seed/about.jsonld`
- `<worker-origin>/seed/outbox.jsonld`

For the canonical Matters-domain surface, use `https://matters.town` and the `/ap` prefix for ActivityPub object paths:

- `https://matters.town/.well-known/webfinger?resource=acct:matters@matters.town`
- `https://matters.town/.well-known/nodeinfo`
- `https://matters.town/ap/instance-info/2.1`
- `https://matters.town/ap/users/matters`
- `https://matters.town/ap/users/matters/outbox`
- `https://matters.town/ap/articles/matters-main-site-open-social-demo`
- `https://matters.town/ap/seed/activitypub-manifest.json`
- `https://matters.town/ap/seed/about.jsonld`
- `https://matters.town/ap/seed/outbox.jsonld`

## Runtime Forwarding

Set `GATEWAY_CORE_ORIGIN` to forward dynamic POST requests to a deployed `gateway-core` runtime:

```toml
[vars]
GATEWAY_CORE_ORIGIN = "https://gateway-core.example"
```

The current demo accepts inbox POST requests only as an edge demo when `GATEWAY_CORE_ORIGIN` is unset. Production federation still requires `gateway-core` for signature verification, followers state, delivery queues, moderation, and persistence.
