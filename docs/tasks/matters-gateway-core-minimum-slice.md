---
task_slug: matters-gateway-core-minimum-slice
status: active
goal: 落地 Matters federation gateway 的最小工程切片，先完成 follow / accept / reject、signature verification、followers state、retry 與 dead letter
dispatcher: human-fallback
owner: codex-local
host: huangdounideiMac
branch: codex/matters-gateway-stage03-alert-webhook
latest_commit: ca691ab
last_updated: 2026-03-25T23:17:14+08:00
tmux_session: none
host_affinity: imac
outputs_scope: mixed
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - research/matters-fediverse-compat/01-specs/federation-gateway-spec.md
  - research/matters-fediverse-compat/01-specs/identity-discovery-spec.md
  - research/matters-fediverse-compat/03-ops/launch-readiness-checklist.md
  - research/matters-fediverse-compat/01-specs/gateway-core-implementation-slice.md
  - research/matters-fediverse-compat/01-specs/instance-interoperability-flow.md
  - research/matters-fediverse-compat/04-status/implementation-progress.md
  - research/matters-fediverse-compat/01-specs/static-outbox-adapter-contract.md
  - research/matters-fediverse-compat/03-ops/local-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-run-20260321.md
  - research/matters-fediverse-compat/01-specs/social-loop-implementation-slice.md
  - research/matters-fediverse-compat/03-ops/production-deployment-gaps.md
  - research/matters-fediverse-compat/02-runtime-slices/production-persistence-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/moderation-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/rate-limit-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/evidence-retention-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/manual-replay-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/sqlite-ops-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/remote-actor-policy-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/sqlite-recovery-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/observability-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/metrics-export-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/queue-durability-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/structured-logs-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/provider-alert-routing-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/staging-observability-drill-runtime-slice.md
  - research/matters-fediverse-compat/03-ops/deployment-topology-baseline.md
  - research/matters-fediverse-compat/02-runtime-slices/rollout-artifact-runtime-slice.md
  - research/matters-fediverse-compat/03-ops/restore-replay-drill-runbook.md
  - research/matters-fediverse-compat/02-runtime-slices/social-fanout-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/social-thread-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/local-domain-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/remote-mention-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/remote-mention-error-policy-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/content-model-runtime-slice.md
  - research/matters-fediverse-compat/02-runtime-slices/notification-model-runtime-slice.md
  - gateway-core/README.md
  - gateway-core/config/staging.instance.example.json
  - gateway-core/config/staging.secrets.example/README.md
  - gateway-core/deploy/Caddyfile.example
  - gateway-core/deploy/matters-gateway-core.env.example
  - gateway-core/deploy/matters-gateway-core.service.example
  - gateway-core/scripts/check-secret-layout.mjs
  - gateway-core/scripts/check-rollout-artifact.mjs
  - gateway-core/src/app.mjs
  - gateway-core/test/gateway-core.test.mjs
local_paths:
  - /Users/mashbean/Documents/AI Agent/worktrees/matters-gateway
start_command: none
stop_command: none
verify_command: cd gateway-core && npm test
next_step: `Stage 03` production gap 已補 webhook alert sink、Slack incoming webhook alert routing、queue durability baseline、external metrics sink、structured logs、observability staging drill runner、deployment topology baseline artifact、secret layout check、reverse proxy baseline，以及 rollout artifact baseline，下一步實跑 staging drill，再決定 provider-specific exporter 是否要繼續往下補
blockers: none
---

# Task Handoff

## Context

這個 task 承接已完成的 instance interoperability delivery run，目標不再是補規劃，而是直接把第一個工程 seed 落地。優先順序鎖定在 gateway core，因為 follow flow、signatures、followers state、retry、dead letter 都卡在這一層。

## Change Log

- 2026-03-20 codex-local on huangdounideiMac created the gateway core engineering task from the completed delivery planning branch
- 2026-03-20 codex-local on huangdounideiMac pointed the task at the completed gateway spec, identity spec, and launch checklist outputs
- 2026-03-20 codex-local on huangdounideiMac confirmed `ipns-site-generator` is static-only and added a runtime placement note for the first engineering slice
- 2026-03-20 codex-local on huangdounideiMac added `gateway-core/` as the first dynamic runtime implementation, with webfinger, actor, inbox, followers, NodeInfo, delivery queue, retry, dead letter, and tests
- 2026-03-20 codex-local on huangdounideiMac added remote actor discovery, cache, and key refresh fallback so inbound Follow no longer depends only on static remote actor seeds
- 2026-03-20 codex-local on huangdounideiMac added a static outbox bridge that reads `ipns-site-generator` `outbox.jsonld` and rewrites it to the canonical Matters actor surface
- 2026-03-20 codex-local on huangdounideiMac added a local sandbox interop harness that checks canonical discoverability and verifies signed `Follow` -> `Accept` end to end
- 2026-03-21 codex-local on huangdounideiMac added a real Mastodon sandbox probe script that can resolve, follow, and poll relationships once sandbox credentials are available
- 2026-03-21 codex-local on huangdounideiMac executed the real Mastodon probe against `mastodon.social` and confirmed the first black-box discoverability and follow-loop pass
- 2026-03-21 codex-local on huangdounideiMac started `Stage 04` by mapping public inbound `Create` / `Reply` into persisted inbound object state
- 2026-03-21 codex-local on huangdounideiMac extended `Stage 04` with inbound `Like` / `Announce` persistence, updated the engineering flow chart, and added a production deployment gap report
- 2026-03-21 codex-local on huangdounideiMac added inbound `Undo` plus outbound `Update` / `Delete` fan-out routes, extending the social loop to cover the first revoke and delete synchronization slice
- 2026-03-21 codex-local on huangdounideiMac added a SQLite persistence baseline, store factory, dev runtime driver switch, and persistence-specific verification
- 2026-03-21 codex-local on huangdounideiMac added the first moderation runtime slice with domain blocks, abuse queue, audit log, and admin endpoints wired into inbound and outbound enforcement
- 2026-03-21 codex-local on huangdounideiMac added actor suspension, legal takedown controls, and a minimal admin dashboard wired into actor policy and delete propagation
- 2026-03-21 codex-local on huangdounideiMac added instance-level and actor-level rate limit controls, persisted counters, and rate-limit admin endpoints
- 2026-03-21 codex-local on huangdounideiMac added evidence retention persistence, the `/admin/evidence` query surface, and evidence snapshots for moderation and dead-letter events
- 2026-03-21 codex-local on huangdounideiMac added dead-letter listing and manual replay control, with replay audit, trace, evidence, and policy-safe reprocessing
- 2026-03-21 codex-local on huangdounideiMac added SQLite ops baseline with backup script, runtime migration metadata, and outbound queue observability endpoints
- 2026-03-21 codex-local on huangdounideiMac added remote actor policy controls for inbound deny / review and outbound deny, with admin endpoints and moderation evidence
- 2026-03-21 codex-local on huangdounideiMac added SQLite recovery baseline with restore tooling, runtime storage alerts, and queue / dead-letter reconciliation backfill
- 2026-03-21 codex-local on huangdounideiMac added runtime observability baseline with structured metrics, runtime alerts query / dispatch, and a restore / replay drill runbook
- 2026-03-21 codex-local on huangdounideiMac added social fan-out baseline with outbox Create / engagement endpoints and mention mapping
- 2026-03-21 codex-local on huangdounideiMac added social thread reconstruction baseline with canonical local mention mapping, engagement thread roots, and `/admin/threads`
- 2026-03-21 codex-local on huangdounideiMac added local domain projection baseline with actor-scoped `localConversations`, social reconcile, and `dryRun`
- 2026-03-21 codex-local on huangdounideiMac added remote mention resolution baseline with `resolveAccount()`, outbound remote acct mention fan-out, and engagement action counts
- 2026-03-21 codex-local on huangdounideiMac added local content projection baseline with `localContents`, `/admin/local-content`, richer action matrix, and stable partial-thread content keys
- 2026-03-21 codex-local on huangdounideiMac added remote mention error policy with mention failure classification, failure cache / retry boundary, evidence / trace, and `/admin/remote-mentions`
- 2026-03-21 codex-local on huangdounideiMac added notification model projection with actor-scoped `localNotifications`, `/admin/local-notifications`, and per-content notification summary
- 2026-03-21 codex-local on huangdounideiMac added delivery-aware content projection with outbound action matrix, delivery summary, and queue-driven content rebuild
- 2026-03-22 codex-local on huangdounideiMac added grouped notification read state, unread filtering, grouped feed reopening, and a sandbox host-binding fix
- 2026-03-22 codex-local on huangdounideiMac added outbound-authored content projection so local root posts and replies appear in `localContents` with stable identity boundaries
- 2026-03-25 codex-local on huangdounideiMac collapsed `localContents.delivery` to activity-level outcome summary while keeping recipient-level breakdown
- 2026-03-25 codex-local on huangdounideiMac added content delivery drilldown and content-context replay so operators can inspect and replay dead-letter recipients from a content surface
- 2026-03-25 codex-local on huangdounideiMac added content delivery review queue and richer dashboard summary so operators can see issue backlog, replayable items, and recent replay from a single admin surface
- 2026-03-25 codex-local on huangdounideiMac added persisted content delivery review snapshot so review queue / dashboard can reuse a store-backed query path
- 2026-03-25 codex-local on huangdounideiMac added a content delivery activity index so operators can inspect unique delivery activity across content cards
- 2026-03-25 codex-local on huangdounideiMac added activity-level replay from the unique activity index so operators can replay dead-letter recipients without expanding per-content drilldown
- 2026-03-25 codex-local on huangdounideiMac aligned the content delivery ops read model minimal slice in tests and docs, covering review queue item `replayableItems`, `replayCount`, `lastReplayAt`, `staleSince`, and the smallest filter surface
- 2026-03-25 codex-local on huangdounideiMac added `replayedOnly` and `replayableOnly` filters to the store-backed review queue and dashboard content delivery views
- 2026-03-25 codex-local on huangdounideiMac stabilized replay filter semantics so `replayedOnly` tracks activity recipient queue item history even after a replay returns the item to pending
- 2026-03-25 codex-local on huangdounideiMac exposed `filteredSummary` on the review queue response so filtered item lists and summary views stay aligned
- 2026-03-25 codex-local on huangdounideiMac exposed `appliedFilters` on review queue and dashboard content delivery snapshots so operators can see exactly which filter combination produced the current read model
- 2026-03-25 codex-local on huangdounideiMac extended the unique activity index with `replayedOnly` and `replayableOnly` so operators can filter replay backlog and replay history from the deduped activity view
- 2026-03-25 codex-local on huangdounideiMac preserved merged activity recipients in the unique activity index so deduped activity ops keep the right replayable and replayed semantics
- 2026-03-25 codex-local on huangdounideiMac refreshed file-store replay projection rebuilds so activity-index replay filters stay aligned with review snapshots after replay audit updates
- 2026-03-25 codex-local on huangdounideiMac added explicit `fullSummary` alongside `summary` and `filteredSummary` on content delivery ops views so dashboard and review queue full-vs-filtered counts are easier to read
- 2026-03-25 codex-local on huangdounideiMac added `summaries.full` and `summaries.filtered` so dashboard and review queue can share a clearer content delivery ops envelope without dropping the old fields
- 2026-03-25 codex-local on huangdounideiMac added `viewSummary` and `summaries.current` so new callers can read the active content delivery summary without guessing whether filters are in effect
- 2026-03-25 codex-local on huangdounideiMac added `canonicalSummaryKey` and `summaryAliases` so content delivery ops callers can adopt `summaries.current` as the canonical summary path while keeping legacy aliases
- 2026-03-25 codex-local on huangdounideiMac added `currentSummaryMode` so callers can tell whether `summaries.current` currently represents the full or filtered summary
- 2026-03-25 codex-local on huangdounideiMac added `contractVersion` and `legacySummaryKeys` so callers can stage content delivery alias deprecation against an explicit contract version
- 2026-03-25 codex-local on huangdounideiMac shared content delivery summary normalization so dashboard and review queue use the same fallback path
- 2026-03-25 codex-local on huangdounideiMac added a `contract` subobject so new content delivery callers can read summary metadata from a single stable envelope
- 2026-03-25 codex-local on huangdounideiMac added `contract.legacyFields` so each compatibility field now declares its replacement path
- 2026-03-25 codex-local on huangdounideiMac refreshed handoff pointers to match the current content delivery ops head
- 2026-03-25 codex-local on huangdounideiMac added sqlite persistence coverage for the content delivery activity index so the dedupe view is verified across reopen
- 2026-03-25 codex-local on huangdounideiMac added webhook dispatch for runtime alerts, including config-driven sink defaults, admin dispatch webhook routing, CLI webhook delivery, and sink audit / trace metadata
- 2026-03-25 codex-local on huangdounideiMac added outbound queue durability with processing lease, stale lease recovery, restart recovery, and file-store atomic persist
- 2026-03-25 codex-local on huangdounideiMac added runtime metrics dispatch with admin route, CLI script, config-driven sink defaults, and shared file / webhook dispatch helpers
- 2026-03-25 codex-local on huangdounideiMac added runtime logs dispatch with admin route, CLI script, config-driven sink defaults, audit / trace bundle filters, and shared file / webhook dispatch helpers
- 2026-03-25 codex-local on huangdounideiMac added Slack incoming webhook alert routing with admin dispatch support, CLI flags, provider-specific payload shaping, timeout handling, and sink audit / trace metadata
- 2026-03-25 codex-local on huangdounideiMac added deployment topology baseline artifacts with a staging config example, README deployment notes, and a topology baseline document
- 2026-03-25 codex-local on huangdounideiMac added secret layout and reverse proxy baselines with a secret-file checker, staging secret layout example, and a Caddy reverse proxy example
- 2026-03-25 codex-local on huangdounideiMac added rollout artifact baselines with a systemd unit example, rollout env example, and rollout env checker script

## Validation

- `./scripts/start-task.sh matters-gateway-core-minimum-slice codex-local task/matters-instance-interoperability-delivery--codex-local` created the task branch, actor branch, and task note
- `git -C external/ipns-site-generator status --short --branch` showed the upstream repo is still clean on `main`
- `rg -n "webfinger|followers|inbox|outbox|activitypub|sharedInbox|publicKey|signature" external/ipns-site-generator/src` showed only static bundle generation paths, not a dynamic gateway runtime
- `cd gateway-core && npm test` passed the webfinger, Follow accept/reject, signature rejection, and retry / dead letter scenarios
- `cd gateway-core && npm test` now also covers remote actor discovery without static seed data and key refresh after remote signature rotation
- `cd gateway-core && npm test` now also covers static outbox bridge rewrite against an `ipns-site-generator`-style `outbox.jsonld` fixture
- `cd gateway-core && npm run check:local-sandbox` passes the local sandbox discoverability and follow-loop verification
- `cd gateway-core && npm run check:mastodon-sandbox` passed against `mastodon.social` using a temporary public trycloudflare gateway URL
- `cd gateway-core && npm test` now also covers public inbound `Create` / `Reply` persistence and non-public `Create` boundary ignore
- `cd gateway-core && npm test` now also covers inbound `Like` / `Announce` persistence
- `cd gateway-core && npm run check:local-sandbox` still passes after the new social-loop engagement slice
- `cd gateway-core && npm test` now also covers inbound `Undo` and outbound `Update` / `Delete`
- `cd gateway-core && npm run check:local-sandbox` still passes after the new social sync slice
- `cd gateway-core && npm test` now also covers SQLite reopen persistence
- `cd gateway-core && npm run check:local-sandbox` now exercises the SQLite driver through the dev runtime config
- `cd gateway-core && npm test` now also covers blocked inbound domain, moderation admin endpoints, and blocked outbound delivery
- `cd gateway-core && npm run check:local-sandbox` still passes after the moderation baseline runtime
- `cd gateway-core && npm test` now also covers actor suspension, legal takedown propagation, and dashboard summary
- `cd gateway-core && npm run check:local-sandbox` still passes after the actor suspension and legal takedown slice
- `cd gateway-core && npm test` now also covers instance inbound rate limit, actor outbound rate limit, and rate-limit admin state
- `cd gateway-core && npm run check:local-sandbox` still passes after the rate-limit slice
- `cd gateway-core && npm test` now also covers SQLite evidence persistence, blocked inbound evidence, legal takedown evidence, and dead-letter evidence
- `cd gateway-core && npm run check:local-sandbox` still passes after the evidence retention slice
- `cd gateway-core && npm test` now also covers dead-letter listing, successful manual replay, and blocked-domain replay without policy bypass
- `cd gateway-core && npm run check:local-sandbox` still passes after the manual replay slice
- `cd gateway-core && npm test` now also covers SQLite runtime metadata, queue observability, admin queue endpoint, and backup script
- `cd gateway-core && npm run check:local-sandbox` still passes after the SQLite ops slice
- `cd gateway-core && npm test` now also covers inbound deny, inbound review, admin remote actor policy endpoints, and outbound deny for a single remote actor
- `cd gateway-core && npm run check:local-sandbox` still passes after the remote actor policy slice
- `cd gateway-core && npm test` now also covers SQLite dead-letter backfill, storage alerts, admin storage reconciliation, and restore script metadata stamping
- `cd gateway-core && npm run check:local-sandbox` still passes after the SQLite recovery slice
- `cd gateway-core && npm test` now also covers runtime metrics endpoint, runtime alerts query / dispatch, and alert dispatch script output
- `cd gateway-core && npm run check:local-sandbox` still passes after the observability slice
- `cd gateway-core && npm test` now also covers runtime alert webhook dispatch, config-driven webhook sink loading, and sink metadata on admin dispatch audit
- `cd gateway-core && npm run check:local-sandbox` still passes after the runtime alert webhook sink slice
- `cd gateway-core && npm test` now also covers outbound queue processing lease, stale lease recovery across reopen, and delivery job pre-dispatch recovery
- `cd gateway-core && npm run check:local-sandbox` still passes after the queue durability slice
- `cd gateway-core && npm test` now also covers runtime metrics dispatch route, config-driven metrics webhook sink, and metrics dispatch script
- `cd gateway-core && npm run check:local-sandbox` still passes after the metrics export slice
- `cd gateway-core && npm test` now also covers runtime logs dispatch route, config-driven logs webhook sink, and logs dispatch script
- `cd gateway-core && npm run check:local-sandbox` still passes after the structured logs slice
- `cd gateway-core && npm test` now also covers admin Slack alert dispatch and config-driven Slack alert script routing
- `node -e "JSON.parse(...staging.instance.example.json...)"` validates the new staging config example is well-formed JSON
- `cd gateway-core && npm test` now also covers the secret layout checker script
- `cd gateway-core && npm run check:secret-layout` passes against the default dev config
- `cd gateway-core && npm test` now also covers the rollout artifact checker script
- `cd gateway-core && npm run check:rollout-artifact` passes against the rollout env example
- `cd gateway-core && npm run check:local-sandbox` still passes after the Slack alert routing slice
- `cd gateway-core && npm test` now also covers outbox reply fan-out, mention mapping, Like fan-out, and Announce fan-out
- `cd gateway-core && npm run check:local-sandbox` still passes after the social fan-out slice
- `cd gateway-core && npm test` now also covers nested reply thread reconstruction, orphan reply fallback, engagement thread roots, local mention normalization, and the `/admin/threads` query surface
- `cd gateway-core && npm run check:local-sandbox` still passes after the social thread slice
- `cd gateway-core && npm test` now also covers local conversation projection sync, social reconcile `dryRun`, orphan reply repair, and mention backfill
- `cd gateway-core && npm run check:local-sandbox` still passes after the local domain slice
- `cd gateway-core && npm test` now also covers remote acct mention resolution through the remote actor directory and conversation engagement counts
- `cd gateway-core && npm run check:local-sandbox` still passes after the remote mention slice
- `cd gateway-core && npm test` now also covers local content projection, richer conversation action matrix, and reconcile-driven content backfill
- `cd gateway-core && npm run check:local-sandbox` still passes after the content model slice
- `cd gateway-core && npm test` now also covers retryable mention failure cache, permanent mention failure fallback tags, admin remote mention query, and SQLite mention resolution persistence
- `cd gateway-core && npm run check:local-sandbox` still passes after the remote mention error policy slice
- `cd gateway-core && npm test` now also covers local notification projection and delivery-aware local content action matrix
- `cd gateway-core && npm run check:local-sandbox` still passes after the notification and delivery-aware content slice
- `cd gateway-core && npm test` now also covers grouped notification read state, unread reopening, outbound-authored root content projection, and authored reply identity boundaries
- `cd gateway-core && npm run check:local-sandbox` still passes after the grouped notification and outbound-authored content slices
- `cd gateway-core && npm test` now also covers activity-level delivery collapse with recipient breakdown on `localContents`
- `cd gateway-core && npm run check:local-sandbox` still passes after the delivery collapse slice
- `cd gateway-core && npm test` now also covers content delivery drilldown filters and content-context replay for dead-letter recipients
- `cd gateway-core && npm run check:local-sandbox` still passes after the content delivery drilldown slice
- `cd gateway-core && npm test` now also covers review queue issue listing, richer dashboard delivery summary, cross-content activity index queries, activity-level replay, and activity index persistence
- `cd gateway-core && npm test` now also covers `replayedOnly` review queue filtering on the store-backed content delivery ops surface
- `cd gateway-core && npm run check:local-sandbox` still passes after the content delivery ops slice
