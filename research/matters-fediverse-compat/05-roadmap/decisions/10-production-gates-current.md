# Current Production Gates

Date: 2026-05-17
Status: production preparation is approved for `mashbean` record-only observation; production outbound rollout is still gated

This is the current gate list after the staging Cloudflare crawler bypass,
canonical `matters.town` pilot deployment, Threads diagnostic rerun,
Mastodon/Misskey follow proof, canonical pilot Article visibility proof,
Misskey interaction return proof, and the first scheduled inbound reconciliation
endpoint.

## Cleared For Staging

| Gate | Status | Evidence |
| --- | --- | --- |
| Public-only export boundary | Cleared on staging | `matters.icu` strict-gate checks keep public article eligible and paywalled article blocked. |
| Product opt-in model | Cleared on staging | Author default-off, article `inherit`, article `disabled` wins, and article `enabled` cannot bypass author opt-in. |
| Record-only trigger | Cleared on staging | `publish_article` and `revise_article` audit rows were recorded for article `23534`; no Lambda, S3, IPNS, or ActivityPub delivery was triggered by `matters-server`. |
| Mastodon/Misskey outbound delivery | Cleared on staging | Public `Create`, `Update`, and bounded `Delete` reached accepted g0v.social and gyutte.site followers. |
| Mastodon read-back | Cleared on staging | `check:mastodon-readback` can resolve the staging actor and read matching remote status visibility through a read-only token. |
| Cloudflare Meta crawler bypass | Cleared on staging and canonical pilot paths | `skip-fediverse-meta-crawlers` is active for `staging-gateway.matters.town` and narrow `matters.town` federation paths; `check:threads-discovery` now defaults to the canonical surface and returns `ok: true`. |
| Manual inbound reconcile | Cleared on staging | `POST /admin/inbound/reconcile-activity` can import a public remote reply to a known local object and preserve SQLite consistency. |
| Periodic inbound reconcile baseline | Cleared on staging | `POST /jobs/inbound-reconciliation` batches known public Activity URLs through the same policy-checked reconcile path, requires a configured scheduler bearer token, has a bounded source runner for explicit public `https` Activity URLs, and is wired on the Mac-hosted staging gateway as a 15-minute no-op-safe loop. |
| Canonical pilot identity surface | Cleared for pilot | Worker exposes `acct:mashbeanmatters@matters.town` on WebFinger / actor / NodeInfo / `/ap/*`; production full outbound delivery remains disabled. |
| Canonical Mastodon/Misskey read-only discovery | Cleared | g0v.social resolves `mashbeanmatters@matters.town` to `https://matters.town/ap/users/mashbeanmatters`; gyutte.site resolves the same actor through `users/show`. |
| Persistent canonical gateway-core origin | Cleared for pilot | AWS `gateway-core` origin is active behind the Worker; `/ap/healthz` reports `gateway-core-proxy`, `inboxMode=persistent`, and `followReadiness=ready`. |
| Canonical follow proof | Cleared for Mastodon and Misskey | g0v.social follow creates persistent SQLite follower state and receives signed Accept; gyutte.site follow converges to `isFollowing=true` after the actor key id moved to `#gateway-core-20260517`. |
| Canonical pilot Article visibility | Cleared for Mastodon and Misskey | Pilot Article `https://matters.town/ap/articles/canonical-pilot-article-20260517t042821z` is visible through Mastodon readback and Misskey `users/notes`. |
| Canonical Misskey interaction return | Cleared | Misskey reply, reaction/like, and renote returned to gateway-core and were persisted as `reply.stored`, `like.stored`, and `announce.stored`. |
| Production preparation mode | Approved for narrow pilot | Product approved `mashbean` as the first pilot author, record-only / observation mode, and a fresh versioned key id. Full outbound remains disabled. |
| Production record-only preflight | Cleared as read-only check | `npm run check:production-record-only` validates canonical gateway health, WebFinger, actor, outbox, followers, `record_only`, pilot author `mashbean`, full outbound disabled, and versioned key id without sending ActivityPub activities. |

## Still Open Before Production

| Gate | Required decision or proof | Owner |
| --- | --- | --- |
| Threads Follow compatibility | Threads can discover the canonical profile but cannot complete Follow; keep investigating without blocking Mastodon/Misskey pilot preparation. | Product + gateway operator |
| Mastodon interaction return | Current g0v.social token is read-only, so reply / favourite / boost write tests require a write-scoped token or manual browser action. | Gateway operator |
| Production gateway hosting | Confirm long-running gateway host, SQLite backup path, restore drill, monitoring, and direct-origin fallback outside Cloudflare. | Infra + gateway operator |
| Production private S3 | Create/confirm bucket, prefix, IAM role, lifecycle, access logs, and retention for generated bundles. | Infra + security/legal input |
| Production Lambda secrets | Confirm owner and rotation path for Lambda credentials and gateway ingestion credentials. | CTO / infra |
| Legal takedown owner | Name the legal/policy owner and approve the takedown response path before beta. | Legal / policy |
| Privacy notice | Approve user-facing copy that explains external server caching and replication. | Product + legal |
| Key exposure / rotation | Name the owner and approve severity, rotation, actor update/delete, and external notice rules. | CTO / security |
| Rollback rehearsal | Prove the rollback sequence: disable author opt-in, stop export trigger, preserve evidence, pause delivery, and remove public routing if needed. | Launch commander + gateway operator |
| Production `record_only` | Implement and observe production audit-only mode for the `mashbean` pilot author before real delivery. | CTO / backend operator |
| Production public delivery | Although approved in principle, only enable `Create` / `Update` / `Delete` after the gates above pass. | Launch commander |

## Do Not Do Automatically

- Do not expand canonical `acct:user@matters.town` beyond the approved pilot handle before the canonical identity gate is expanded.
- Do not enable production outbound delivery while legal/privacy/rollback gates are open.
- Do not expose actor private keys, Lambda secrets, S3 credentials, or Cloudflare production routing changes in repo or chat logs.
- Do not treat Threads UI failure as a backend regression now that direct crawler diagnostics pass.
- Do not treat Worker edge-demo inbox 202 responses as successful canonical
  follows; follow proof requires a persistent gateway-core origin.
