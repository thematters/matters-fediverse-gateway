# Decision 07: G1 Human Gates

Date: 2026-05-01

## Decision

G1 continues through the smallest executable path, but external environment,
credential, publishing, legal, and tabletop steps remain human-owned.

## G1-A Static Article Contract

Use `ipns-site-generator` for the minimal v1 static Article bundle.

Public filtering policy:

- Treat missing visibility metadata as public, because current Matters article
  data is overwhelmingly public and legacy private articles are rare and
  sunsetted.
- Drop articles that explicitly declare non-public markers such as paid,
  encrypted, private, draft, or message-like types.
- Keep the gateway-side visibility gate as a second defense. The generator is
  the first filter; the gateway remains the enforcement fallback.

## W1 Staging Observability Drill

Recommended staging topology:

- first drill can use the local Mac as staging host through Cloudflare Tunnel;
  use a small VM or container host when longer uptime is needed
- SQLite on a persistent local volume
- Caddy or equivalent reverse proxy with TLS
- Cloudflare Tunnel on the existing Cloudflare account
- secret files managed by mashbean

Chosen staging hostnames:

- `staging-gateway.matters.town`
- `staging-admin.matters.town`
- `staging-hooks.matters.town`

Webhook choice:

- Prefer a no-cost self-hosted receiver on the same staging host or an existing
  internal ops endpoint.
- For the drill, use generic webhook dispatch for alerts, metrics, and logs.
- Slack incoming webhook is optional for the first free path. If Slack is already
  available at no extra cost, use it for alerts only.

Payload retention:

- Keep staging webhook payloads and drill bundles for 14 days.
- Internal reports should record file names, timestamps, statuses, and SHA-256
  hashes by default.
- Do not retain token-bearing request bodies. Drill payloads must not contain
  secrets.
- Delete or archive `runtime/webhooks/` and `runtime/drills/` after 14 days.

Drill report naming:

`research/matters-fediverse-compat/03-ops/staging-observability-drill-YYYYMMDD.md`

## W3 Misskey / GoToSocial Interop

Use public instances. The human operator will provide Misskey and GoToSocial
test accounts and tokens when needed.

Testing is allowed to perform full external interoperability flows, including
public test Article, Follow, Like, Announce, and reply traffic.

Masking rule:

- Mask access tokens and secrets.
- Other test account identifiers, URLs, reports, and public activity evidence do
  not need to be masked unless later requested.

## W8 Incident Runbooks / Tabletop

Participant list and timing are human-owned and accepted as available.

First tabletop scenarios:

- large-scale signature verification failures
- outbound queue backlog

Legal takedown is deferred to legal review. Tabletop records should be kept as
internal documents rather than public repo artifacts unless explicitly approved.

## W6 Production Key Rotation

Use the implemented key rotation recommendation:

- rotate with an overlap window
- publish the generated Actor Update when the human operator approves production
  cutover
- key material is created, stored, and managed by mashbean
- suspected key exposure flows go to legal review before external communication

## Current Stop/Go

Codex may continue with code and local verification when the task stays inside
the local repo and uses non-secret fixtures.

Codex must stop before:

- using real staging credentials
- publishing Actor Update externally
- pushing git changes
- creating or handling production key material
- running public instance interop without provided tokens
- recording or publishing tabletop notes
- making legal, privacy, or user communication decisions
