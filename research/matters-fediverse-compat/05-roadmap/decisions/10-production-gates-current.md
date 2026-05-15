# Current Production Gates

Date: 2026-05-15
Status: staging can continue; production rollout is still gated

This is the current gate list after the staging Cloudflare crawler bypass,
Threads diagnostic rerun, Mastodon/Misskey delivery proof, and the first
scheduled inbound reconciliation endpoint.

## Cleared For Staging

| Gate | Status | Evidence |
| --- | --- | --- |
| Public-only export boundary | Cleared on staging | `matters.icu` strict-gate checks keep public article eligible and paywalled article blocked. |
| Product opt-in model | Cleared on staging | Author default-off, article `inherit`, article `disabled` wins, and article `enabled` cannot bypass author opt-in. |
| Record-only trigger | Cleared on staging | `publish_article` and `revise_article` audit rows were recorded for article `23534`; no Lambda, S3, IPNS, or ActivityPub delivery was triggered by `matters-server`. |
| Mastodon/Misskey outbound delivery | Cleared on staging | Public `Create`, `Update`, and bounded `Delete` reached accepted g0v.social and gyutte.site followers. |
| Mastodon read-back | Cleared on staging | `check:mastodon-readback` can resolve the staging actor and read matching remote status visibility through a read-only token. |
| Cloudflare Meta crawler bypass | Cleared on staging | `skip-staging-fediverse-meta-crawlers` is active for `staging-gateway.matters.town`; `check:threads-discovery` returns `ok: true`. |
| Manual inbound reconcile | Cleared on staging | `POST /admin/inbound/reconcile-activity` can import a public remote reply to a known local object and preserve SQLite consistency. |
| Periodic inbound reconcile baseline | Implemented for review | `POST /jobs/inbound-reconciliation` batches known public Activity URLs through the same policy-checked reconcile path. |

## Still Open Before Production

| Gate | Required decision or proof | Owner |
| --- | --- | --- |
| Threads UI discovery | Retest exact Threads search after crawler bypass; if still missing, decide whether to wait for indexing or move it behind canonical identity cutover. | Product + gateway operator |
| Canonical identity cutover | Decide when to expose `acct:user@matters.town` instead of staging `acct:user@staging-gateway.matters.town`. | CTO / infra + gateway operator |
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

- Do not publish canonical `acct:user@matters.town` before the canonical identity gate.
- Do not enable production outbound delivery while legal/privacy/rollback gates are open.
- Do not expose actor private keys, Lambda secrets, S3 credentials, or Cloudflare production routing changes in repo or chat logs.
- Do not treat Threads UI failure as a backend regression now that direct crawler diagnostics pass.
