# Current Production Gates

Date: 2026-05-16
Status: canonical read surface pilot is live; production outbound rollout is still gated

This is the current gate list after the staging Cloudflare crawler bypass,
canonical `matters.town` pilot read-surface deployment, Threads diagnostic
rerun, Mastodon/Misskey delivery proof, and the first scheduled inbound
reconciliation endpoint.

## Cleared For Staging

| Gate | Status | Evidence |
| --- | --- | --- |
| Public-only export boundary | Cleared on staging | `matters.icu` strict-gate checks keep public article eligible and paywalled article blocked. |
| Product opt-in model | Cleared on staging | Author default-off, article `inherit`, article `disabled` wins, and article `enabled` cannot bypass author opt-in. |
| Record-only trigger | Cleared on staging | `publish_article` and `revise_article` audit rows were recorded for article `23534`; no Lambda, S3, IPNS, or ActivityPub delivery was triggered by `matters-server`. |
| Mastodon/Misskey outbound delivery | Cleared on staging | Public `Create`, `Update`, and bounded `Delete` reached accepted g0v.social and gyutte.site followers. |
| Mastodon read-back | Cleared on staging | `check:mastodon-readback` can resolve the staging actor and read matching remote status visibility through a read-only token. |
| Cloudflare Meta crawler bypass | Cleared on staging and canonical pilot paths | `skip-fediverse-meta-crawlers` is active for `staging-gateway.matters.town` and narrow `matters.town` federation paths; `check:threads-discovery -- --canonical-base-url https://matters.town` returns `ok: true`. |
| Manual inbound reconcile | Cleared on staging | `POST /admin/inbound/reconcile-activity` can import a public remote reply to a known local object and preserve SQLite consistency. |
| Periodic inbound reconcile baseline | Cleared on staging | `POST /jobs/inbound-reconciliation` batches known public Activity URLs through the same policy-checked reconcile path, requires a configured scheduler bearer token, has a bounded source runner for explicit public `https` Activity URLs, and is wired on the Mac-hosted staging gateway as a 15-minute no-op-safe loop. |
| Canonical cutover read surface | Cleared for pilot discovery only | Worker deploy `c48024e3-c249-4402-824b-7d199ace5a7f` exposes `acct:mashbeanmatters@matters.town` on WebFinger / actor / NodeInfo / `/ap/*`; production outbound delivery remains disabled. |
| Canonical Mastodon/Misskey read-only discovery | Cleared | g0v.social resolves `mashbeanmatters@matters.town` to `https://matters.town/ap/users/mashbeanmatters`; gyutte.site resolves the same actor through `users/show`. |
| Canonical follow readiness preflight | Cleared as a blocker, not ready for follow | Worker deploys `b002f589-f9d3-4cf3-b389-0e137e36efc9`, `7f9077c0-5dc8-4164-8793-83d437508758`, and `7096c2e3-4e03-4133-9b0d-3ac7547be482` expose healthz readiness, strip canonical `/ap` before proxying to gateway-core, and require origin `/healthz` to identify as `gateway-core`; live preflight still returns `followReadiness=blocked` because `GATEWAY_CORE_ORIGIN` is not active. |

## Still Open Before Production

| Gate | Required decision or proof | Owner |
| --- | --- | --- |
| Threads UI discovery | Threads still does not show the canonical profile in web UI search after WebFinger and Meta crawler probes return 200; continue compatibility/indexing investigation without treating it as a backend regression. | Product + gateway operator |
| Persistent canonical gateway-core origin | Choose and configure a production-grade origin for canonical inbox POSTs, expose gateway-core `/healthz`, then set `GATEWAY_CORE_ORIGIN` on the Worker. | CTO / infra + gateway operator |
| Canonical follow proof | After `check:follow-readiness` returns `ok: true`, verify Mastodon and Misskey can follow `mashbeanmatters@matters.town`; this creates canonical pilot followers and should be treated as a visible social action. | Gateway operator |
| Production gateway hosting | Confirm long-running gateway host, SQLite backup path, restore drill, monitoring, and direct-origin fallback outside Cloudflare. | Infra + gateway operator |
| Production private S3 | Create/confirm bucket, prefix, IAM role, lifecycle, access logs, and retention for generated bundles. | Infra + security/legal input |
| Production Lambda secrets | Confirm owner and rotation path for Lambda credentials and gateway ingestion credentials. | CTO / infra |
| Legal takedown owner | Name the legal/policy owner and approve the takedown response path before beta. | Legal / policy |
| Privacy notice | Approve user-facing copy that explains external server caching and replication. | Product + legal |
| Key exposure / rotation | Name the owner and approve severity, rotation, actor update/delete, and external notice rules. | CTO / security |
| Rollback rehearsal | Prove the rollback sequence: disable author opt-in, stop export trigger, preserve evidence, pause delivery, and remove public routing if needed. | Launch commander + gateway operator |
| Production `record_only` | Decide when production backend may enter audit-only mode before real delivery. | CTO / backend operator |
| Production public delivery | Although approved in principle, only enable `Create` / `Update` / `Delete` after the gates above pass. | Launch commander |

## Do Not Do Automatically

- Do not expand canonical `acct:user@matters.town` beyond the approved pilot handle before the canonical identity gate is expanded.
- Do not enable production outbound delivery while legal/privacy/rollback gates are open.
- Do not expose actor private keys, Lambda secrets, S3 credentials, or Cloudflare production routing changes in repo or chat logs.
- Do not treat Threads UI failure as a backend regression now that direct crawler diagnostics pass.
- Do not treat Worker edge-demo inbox 202 responses as successful canonical
  follows; follow proof requires a persistent gateway-core origin.
