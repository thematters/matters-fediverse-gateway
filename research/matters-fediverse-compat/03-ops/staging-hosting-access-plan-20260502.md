# Staging Hosting And Access Plan 20260502

## Scope

This note answers the current staging decision question: which hosting and access-control path can move forward without adding a new paid service, and what should be protected before Misskey public interop testing.

Sources checked on 2026-05-02:

- Cloudflare Tunnel docs: <https://developers.cloudflare.com/tunnel/>
- Cloudflare Access product page: <https://www.cloudflare.com/sase/products/access/>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Google Cloud Free Tier: <https://cloud.google.com/free/docs/free-cloud-features>
- Google Cloud Run overview: <https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run>
- Google Workspace AppSheet admin docs: <https://support.google.com/a/answer/10100275>
- Misskey API token docs: <https://misskey-hub.net/en/docs/for-developers/api/token/>
- Misskey permission list: <https://misskey-hub.net/en/docs/for-developers/api/permission/>

## No-New-Cost Options

### Recommended Now: Existing Mac + Cloudflare Tunnel

This is the best no-new-cost path for the current `gateway-core` runtime.

Why:

- Cloudflare Tunnel is available on all Cloudflare plans and maps public hostnames to local services without a public origin IP.
- The current staging smoke already passed through `staging-gateway.matters.town`, `staging-admin.matters.town`, and `staging-hooks.matters.town`.
- The current Node + SQLite runtime can run as-is on the Mac; no adapter rewrite is needed.
- It preserves the fastest loop for Misskey / GoToSocial public interop testing.

Remaining work:

- Install `cloudflared`, gateway, webhook receiver, and reverse proxy as durable services.
- Decide whether this should be a macOS `launchd` setup or a small container supervisor.
- Keep token/private key material in ignored local secret files only.

Risk:

- The Mac must stay awake and online for staging to remain reachable.
- Local service installation changes machine state and should be treated as a human-approved operational step.

### Viable Later: Existing Google Cloud Free Tier / Credits

Google Cloud has Free Tier options that can run containers or VMs within limits. Cloud Run has request-based free usage and Compute Engine includes one eligible `e2-micro` VM per month in specific US regions, subject to billing account and quota constraints.

Why not first choice today:

- It requires Google Cloud project / billing / IAM setup and deployment credentials.
- It is easy to accidentally leave the Free Tier boundary through traffic, region, storage, log, or egress usage.
- The current gateway needs native `better-sqlite3`, durable local files, and secret file management; packaging and runtime setup need a separate deployment pass.

Use this when:

- The Mac is not acceptable as a staging origin.
- A billing guardrail and project owner are confirmed.
- We are ready to package `gateway-core` as a container or VM service.

### Not Suitable As Primary Runtime: Google Workspace

Google Workspace helps with collaboration, notes, docs, and AppSheet. AppSheet Core is included at no cost with most Google Workspace editions, but it is not a Node service host for `gateway-core`.

Use it for:

- Internal runbooks.
- Staging checklist or lightweight operator UI.
- Secret handoff notes that remain outside git.

Do not use it for:

- Running `gateway-core`.
- Exposing ActivityPub routes.
- Hosting webhook callbacks.

### Not Suitable As Primary Runtime Without Rewrite: Cloudflare Workers / Pages

Cloudflare Workers can be useful for edge adapters and narrow public routes, and the repo already has a Worker slice. However, the current `gateway-core` runtime uses Node APIs, native `better-sqlite3`, and local runtime files.

Why not primary now:

- Workers Free has CPU and request limits.
- Native `better-sqlite3` and local SQLite files are not compatible with the Worker runtime.
- Moving this path forward would mean rewriting storage/runtime boundaries to D1 / Durable Objects / R2 or a separate origin.

Use it for:

- Edge adapter routes.
- Fallback / compatibility surfaces.
- Static demo pages or narrow proxy logic.

## Access Policy Recommendation

Recommended Cloudflare Access split:

| Hostname | Policy |
| --- | --- |
| `staging-gateway.matters.town` | Public, no Access. This must remain reachable by Fediverse instances for WebFinger, actor, inbox/outbox, NodeInfo, and public GET/POST interop. |
| `staging-admin.matters.town` | Protect with Cloudflare Access before broader testing. Allow only named Matters operators or a confirmed Google Workspace domain. |
| `staging-hooks.matters.town` | Keep public but bearer-token protected for external webhook callbacks. Do not put Access in front unless the receiver is only for internal drills. |

Rationale:

- ActivityPub and external webhook callbacks usually cannot complete an interactive Cloudflare Access login.
- Admin surfaces do not need public unauthenticated access.
- The generic webhook receiver already requires bearer-token protection, which is more compatible with machine callbacks.

## Misskey Token Recommendation

Account: `https://gyutte.site/@mashbean`

Create a dedicated staging token in Misskey Web under Settings > API. Keep it confidential and do not paste it into git, reports, tickets, or chat.

Minimum recommended scopes for the first public interop probe:

- `read:account`
- `read:following`
- `write:following`

Do not grant yet:

- `write:notes`, unless the next test explicitly includes publishing a public note.
- `read:messaging` or `write:messaging`.
- Any `admin:*` permission.

The token guidance has also been copied into Apple Notes under `Matters Gateway Misskey staging token 建議`.

## Next Human Decision

Before I can apply Cloudflare Access in the dashboard, I need action-time confirmation for the cloud access-control change and the exact allowed identity boundary:

- Allow specific emails only, or allow an entire Google Workspace domain.
- If domain-based: confirm the domain string.
- If email-based: confirm the operator email list.

My default recommendation is email-based allowlist for `staging-admin.matters.town` only, with `staging-hooks.matters.town` left public and bearer-token protected.
