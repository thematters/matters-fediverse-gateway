# Current Production Gates

Date: 2026-05-22
Status: first bounded `mashbean` production `Create` and `Update` delivered; bounded withdrawal rehearsal partially passed; production outbound rollout is still gated

This is the current gate list after the staging Cloudflare crawler bypass,
canonical `matters.town` pilot deployment, Threads diagnostic rerun,
Mastodon/Misskey follow proof, canonical pilot Article visibility proof,
Misskey interaction return proof, the first scheduled inbound reconciliation
endpoint, production `record_only` enablement on `matters-server-prod-new`,
and the post-change production preflight.

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
| Production record-only preflight | Cleared as read-only check | `npm run check:production-record-only` validates canonical gateway health, WebFinger, actor, outbox, followers, `record_only`, pilot author `mashbean`, full outbound disabled, and versioned key id without sending ActivityPub activities. The 2026-05-22 rerun returned `ok=true`, outbox `totalItems=0`, and followers `totalItems=2`. |
| Production `record_only` backend setting | Enabled for pilot observation | `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` is set on Elastic Beanstalk environment `matters-server-prod-new`; the update returned to Ready / Green / Ok, `https://server.matters.town/health` returned 200, production schema exposes `UserFeatures.fediverseBeta`, and the 2026-05-18 production preflight passed. No production ActivityPub outbound delivery was sent. |
| Production pilot article eligibility | Cleared before audit-row query | Real production article `1225211` / `3tmz0u0a42qx` is `active`, `public`, owned by `mashbean`, and a 2026-05-18 production GraphQL check reports `federationEligibility.eligible=true` with effective article setting `inherit`. |
| Production audit-row query | Cleared for record-only observation | Read-only production workflow run 26079277083 returned one `federation_export_event` row for article `1225211`: `trigger=publish_article`, `mode=record_only`, `status=recorded`, `eligible=true`, `reason=eligible`, `author_setting=enabled`, and `effective_article_setting=inherit`. No production ActivityPub outbound delivery was enabled. |
| Production audit repeat query | Cleared after release | Read-only workflow run 26269962135 passed on 2026-05-22 with `include_decision_report=false` after the v5.23.0 release. It returned row `id=399` for article `1225211` with `trigger=publish_article`, `mode=record_only`, `status=recorded`, `eligible=true`, `reason=eligible`, `author_setting=enabled`, `effective_article_setting=inherit`, and redacted `decision_report`. |
| Production public discovery repeat | Cleared as public check | `npm run check:threads-discovery` returned `ok=true` on 2026-05-22 for canonical WebFinger, actor, outbox, and NodeInfo probes across default, `facebookexternalua`, `facebookexternalhit`, and `meta-externalagent` user agents. |
| Pilot outbound runbook | First bounded `Create` executed | `03-ops/production-pilot-outbound-runbook.md` defines the narrow `mashbean` pilot sequence, stop conditions, rollback, evidence archive, and release branch policy constraints. |
| Pilot final gate checklist | Partially cleared | `03-ops/production-pilot-final-gates-20260522.md` separates closed gates, blocking open gates, AWS verification commands, owner recommendations, and the go/no-go rule. On 2026-05-22, AWS CLI auth was restored, private S3 pilot storage was created, the live origin SQLite backup succeeded, and the consistency scan returned only explained SQLite-primary diffs. |
| First bounded production `Create` | Cleared for Mastodon and Misskey | `03-ops/production-pilot-create-run-20260522.md` records the approved 2026-05-22 16:43-20:43 CST pilot window, private S3 bundle prefix, gateway-origin `Create`, delivery to g0v.social and gyutte.site with HTTP 202, Mastodon readback success, Misskey visual readback, queue `pending=0` / `deadLetter=0`, and post-send SQLite scan with no SQLite omissions or value mismatches. |
| First bounded production `Update` | Cleared for delivery acceptance | `03-ops/production-pilot-update-run-20260528.md` records the gateway-origin `Update`, delivery to g0v.social and gyutte.site with HTTP 202, Mastodon readback success, Misskey visual readback, and queue `pending=0` / `deadLetter=0`. AWS session had expired, so S3/SSM evidence still needs a follow-up after reauthentication. |
| Bounded production withdrawal | Partial pass | `03-ops/production-pilot-delete-run-20260528.md` records two Delete variants. Mastodon withdrew the real article status and direct lookup returned `Not Found`; Misskey accepted both deliveries with HTTP 202 but still showed the remote note, so Misskey withdrawal is an open compatibility gap. |
| Deployed-Lambda staging workflow | Cleared as repeatable path | `lambda-handlers` workflow run 26017383955 selected public article `23525`, skipped paywalled article `23522` as `article_not_public`, returned one eligible bundle, and kept `dryRun=true`. Direct `articleIds` Lambda invocation is not the validated path because the Lambda environment does not include DB connection variables. |

## Still Open Before Production

| Gate | Required decision or proof | Decision owner |
| --- | --- | --- |
| Threads Follow compatibility | Threads can discover the canonical profile but cannot complete Follow; keep investigating without blocking Mastodon/Misskey pilot preparation. | Matters current General Manager; product and gateway operator support. |
| Mastodon interaction return | Current g0v.social token is read-only, so reply / favourite / boost write tests require a write-scoped token or manual browser action. | Matters current General Manager; gateway operator executes. |
| Production gateway hosting | Confirm long-running gateway host, SQLite backup path, restore drill, monitoring, and direct-origin fallback outside Cloudflare. | Matters current General Manager; infra and gateway operator support. |
| Production private S3 | Pilot bucket `matters-fediverse-prod-bundles` now exists with public access blocked, SSE-S3 encryption, versioning, and 90-day `pilot/` lifecycle. Before broader rollout, confirm IAM role wiring and whether CloudTrail data events or another access audit path is required. | Matters current General Manager; infra and security/legal support. |
| Production Lambda secrets | Confirm owner and rotation path for Lambda credentials and gateway ingestion credentials. | Matters current General Manager; CTO/infra support. |
| Legal takedown owner | Approve the takedown response path before beta. | Matters current General Manager; legal/policy supports. |
| Privacy notice | Approve user-facing copy that explains external server caching and replication. | Matters current General Manager; product/legal supports. |
| Key exposure / rotation | Approve severity, rotation, actor update/delete, and external notice rules. | Matters current General Manager; CTO/security supports. |
| Rollback rehearsal | Prove the rollback sequence: disable author opt-in, stop export trigger, preserve evidence, pause delivery, and remove public routing if needed. | Matters current General Manager; gateway operator executes. |
| Next bounded production action | Keep observing the first `Create` / `Update` and the withdrawal rehearsal, then fix or scope the Misskey withdrawal gap before larger pilot expansion. Do not expand to broad delivery yet. | Matters current General Manager. |

## Do Not Do Automatically

- Do not expand canonical `acct:user@matters.town` beyond the approved pilot handle before the canonical identity gate is expanded.
- Do not enable broad production outbound delivery while legal/privacy/rollback
  gates are open. The first bounded `Create` does not imply broad rollout.
- Treat Matters current General Manager as the owner for all remaining pilot
  gate decisions unless a decision is explicitly delegated in writing.
- Do not expose actor private keys, Lambda secrets, S3 credentials, or Cloudflare production routing changes in repo or chat logs.
- Do not treat Threads UI failure as a backend regression now that direct crawler diagnostics pass.
- Do not treat Worker edge-demo inbox 202 responses as successful canonical
  follows; follow proof requires a persistent gateway-core origin.
