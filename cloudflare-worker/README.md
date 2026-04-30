# Matters Fediverse Gateway Worker

This Cloudflare Worker is the public edge demo for Matters Fediverse Gateway.

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

The current public Worker demo is:

```text
https://matters-fediverse-gateway-demo.matters-lab.workers.dev
```

The demo actor is:

```text
acct:matters@matters-fediverse-gateway-demo.matters-lab.workers.dev
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

The current `wrangler.toml` pins deployment to the Matters Lab Cloudflare account by `account_id`.

### Cloudflare API Token

Create a Cloudflare user API token with these permissions:

- Account / Workers Scripts / Edit
- Account / Account Settings / Read
- User / User Details / Read
- User / Memberships / Read

Scope account resources to `Matters Lab`. No zone permission is required for the `workers.dev` demo. Add Zone / Workers Routes / Edit only when binding a custom route or custom domain.

Use the token as an environment variable and do not commit it:

```bash
CLOUDFLARE_API_TOKEN=... npm run deploy
```

## Demo Endpoints

Replace `<worker-origin>` with the deployed Worker origin. For the live demo, `<worker-origin>` is `https://matters-fediverse-gateway-demo.matters-lab.workers.dev`.

- `<worker-origin>/.well-known/webfinger?resource=acct:matters@<worker-host>`
- `<worker-origin>/.well-known/nodeinfo`
- `<worker-origin>/nodeinfo/2.1`
- `<worker-origin>/users/matters`
- `<worker-origin>/users/matters/outbox`
- `<worker-origin>/articles/matters-main-site-open-social-demo`
- `<worker-origin>/seed/activitypub-manifest.json`
- `<worker-origin>/seed/about.jsonld`
- `<worker-origin>/seed/outbox.jsonld`

## Runtime Forwarding

Set `GATEWAY_CORE_ORIGIN` to forward dynamic POST requests to a deployed `gateway-core` runtime:

```toml
[vars]
GATEWAY_CORE_ORIGIN = "https://gateway-core.example"
```

The current demo accepts inbox POST requests only as an edge demo when `GATEWAY_CORE_ORIGIN` is unset. Production federation still requires `gateway-core` for signature verification, followers state, delivery queues, moderation, and persistence.
