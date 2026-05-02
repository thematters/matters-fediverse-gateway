# Matters x Fediverse Execution Plan

Last updated: 2026-05-01

This document is the execution controller for the Matters x Fediverse work from G1 through G3. It turns the high-level roadmap in [`development-plan.md`](development-plan.md) into ordered, verifiable execution batches.

This plan deliberately excludes DID / shared DID work, ZK anonymity, and Billboard / on-chain advertising incentives. Those topics may remain in the deck-level vision, but work following this file should not implement or refactor them.

## Execution Rules

- Treat this repository, `thematters/matters-fediverse-gateway`, as the planning source of truth.
- Use existing `docs/tasks/matters-g1-*` task notes as detailed G1 handoffs.
- Add future G2 and G3 task notes under `docs/tasks/` only when execution starts; keep this file as the cross-stage controller.
- Each execution task must finish with a short handoff note containing changed files, verification commands, result status, and remaining risks.
- Do not start a downstream stage until its stop/go gate is satisfied.

## Status Board

| Stage | Status | Primary repo scope | Gate |
|---|---|---|---|
| G1-A Static Article Contract | done | `ipns-site-generator`, `gateway-core` | Public Article seed bundle passes bridge and generator tests |
| G1-B Gateway Hardening | queued | `gateway-core` | Gateway runtime passes hardening tests and staging drill |
| G1-C Interop Validation | done with deferral | `gateway-core`, ops reports | Mastodon and Misskey reports are archived; GoToSocial is skipped until a later decision |
| G2-A Matters Production Data Integration | active preflight | `matters-server`, `ipns-site-generator`, `gateway-core` | Selected real Matters authors resolve and publish public Article objects |
| G2-B Matters Web/App Integration | queued | `matters-web`, `matters-server`, `gateway-core` | Pilot authors can control federation and see inbound interactions |
| G2-C Production Rollout | queued | product, ops, docs | Beta rollout has legal, comms, rollback, and monitoring readiness |
| G3 Second Instance Validation | queued | `gateway-core`, deployment docs | A second independent instance passes black-box acceptance |

## Related Task Notes

Existing G1 task notes remain the detailed handoffs:

- W1 staging observability drill: `docs/tasks/matters-g1-w1-staging-observability-drill.md`
- W2 consistency scan: `docs/tasks/matters-g1-w2-consistency-scan.md`
- W3 Misskey and GoToSocial interop: `docs/tasks/matters-g1-w3-misskey-gotosocial-interop.md`
- W4a long-form Article systematization: `docs/tasks/matters-g1-w4a-longform-article-systematization.md`
- W5 paid/private boundary enforcement: `docs/tasks/matters-g1-w5-paid-private-boundary-enforcement.md`
- W6 key rotation flow: `docs/tasks/matters-g1-w6-key-rotation-flow.md`
- W8 incident runbooks and tabletop drill: `docs/tasks/matters-g1-w8-incident-runbooks-tabletop.md`

G2 and G3 task notes should be created under `docs/tasks/` when those stages start. Until then, the G2/G3 packets in this file are the execution source of truth.

## Execution Order

### G1-A: Static Article Contract

Objective: make the static publishing output safe and usable as the gateway's public Article seed source.

Status:

- 2026-05-01: minimal v1 completed. `ipns-site-generator` commit `4c46826` emits `Article` static bundles, `activitypub-manifest.json`, and explicit non-public filtering. `gateway-core` commit `9dca186` accepts `staticBundleManifestFile` and validates manifest visibility before reading the outbox.

Dependencies:

- Existing `ipns-site-generator` static ActivityPub output.
- Existing `gateway-core` static outbox bridge.
- Decisions 02 and 03 in `05-roadmap/decisions/`.

Stop/go gate:

- `ipns-site-generator` emits `Article`, not `Note`.
- `activitypub-manifest.json` exists and declares `version: 1`.
- Non-public content is excluded before it can enter a federation bundle.
- `gateway-core` can ingest or bridge the seed without identity drift.

### G1-B: Gateway Hardening

Objective: finish the reference gateway behaviors required before staging operation.

Dependencies:

- G1-A static Article contract.
- Existing `gateway-core` runtime and SQLite persistence.
- Existing task notes for W1, W2, W4a, W5, W6, and W8.

Stop/go gate:

- Article normalization, sanitizer, summary, attachment, and canonical URL behavior are covered by tests.
- Paid, encrypted, private, draft, and message-like content cannot be delivered.
- Key rotation, consistency scan, incident runbook, and tabletop drill artifacts exist.
- `gateway-core` test suite and staging observability drill pass.

### G1-C: Interop Validation

Objective: prove the reference gateway is not Mastodon-only.

Dependencies:

- G1-B hardened runtime.
- Test accounts or controlled instances for Mastodon, Misskey, and GoToSocial.

Stop/go gate:

- Each implementation has a run report under `research/matters-fediverse-compat/03-ops/`.
- Reports cover discovery, follow/accept, inbound Create/Like/Announce, outbound Article Create, reply threading, and known display differences.
- Any blocking compatibility issue is linked back to a task note or issue before G1 release.

Status:

- 2026-05-02: Mastodon baseline remains archived; Misskey public discovery, follow, text Article display, media attachment display, and human UI visual review are complete. GoToSocial remains deferred by current decision, so it is not blocking G2-A preflight.

### G2-A: Matters Production Data Integration

Objective: connect real Matters data and identity to the gateway.

Status:

- 2026-05-02: active preflight started. Repo-backed gap scan and non-production contract slice are documented in `research/matters-fediverse-compat/02-runtime-slices/g2a-production-data-integration-slice.md` and `docs/tasks/matters-g2-a-production-data-integration.md`.
- 2026-05-02: `matters-server` commit `50e2219` added the non-production federation export scaffold on branch `codex/g2a-federation-export-preflight`. It uses a temporary vendored `@matters/ipns-site-generator@0.1.9` tarball because npm `@matters` scope publish permission is not yet available; registry migration is the next dependency gate.
- 2026-05-02: `matters-server` commit `bac7511` added a local federation export writer and path traversal guard, so the next non-production slice can wrap it in a CLI/worker once staging-safe article IDs and runtime credentials are available.
- 2026-05-02: `matters-server` commit `4761f78` added `npm run federation:export`; a public API snapshot for `mashbean` article `1111146` generated a local bundle under triad O-0020 artifacts, and gateway-core normalized it as one `Article` through `staticBundleManifestFile`.
- 2026-05-02: local gateway-core SQLite runtime served that generated bundle successfully: WebFinger, actor, and outbox probes passed for `acct:mashbean@staging-gateway.matters.town`.
- 2026-05-02: test author switched to `@charlesmungerai`; a public API snapshot generated a local bundle with three public Articles (`1182465`, `1181808`, `1181797`), and local gateway-core WebFinger/actor/outbox probes passed for `acct:charlesmungerai@staging-gateway.matters.town`.

Dependencies:

- G1 reference gateway.
- Real Matters IPNS/static article output.
- Product decision to use `acct:user@matters.town`.

Stop/go gate:

- Selected real author accounts resolve as `acct:user@matters.town`.
- Selected public Matters articles produce ActivityPub `Article` objects through the gateway.
- Author-level opt-in and per-article federation setting exist in the backend contract.
- Non-public content remains fully invisible to federation.

### G2-B: Matters Web/App Integration

Objective: make federation visible and controllable in the Matters product.

Dependencies:

- G2-A backend integration.
- Pilot author list.
- Product copy for author-facing controls.

Stop/go gate:

- Authors can opt in, opt out, and control federation per article.
- Fediverse replies, follows, likes, and boosts are visible in Matters Web/App where product scope requires them.
- Admins can inspect pilot status, failed deliveries, visibility exclusions, and rollback state.
- Pilot acceptance is complete for 50-100 selected authors before wider beta.

### G2-C: Production Rollout

Objective: move from pilot to beta and broader availability.

Dependencies:

- G2-B pilot acceptance.
- Legal review.
- Operator monitoring and rollback path.

Stop/go gate:

- Terms of Service and privacy policy updates are ready before beta.
- User communication and migration notes are ready.
- Monitoring, incident response, and rollback checklist are accepted by ops.
- Beta results are reviewed before general availability.

### G3: Second Instance Validation

Objective: prove the gateway is reusable beyond Matters.town.

Dependencies:

- G1 reference gateway.
- A second independent publisher or community instance.
- Instance operator with a test domain and public content source.

Stop/go gate:

- Second-instance config and namespace isolation are implemented.
- A second instance federates publicly and does not leak Matters.town identity, followers, keys, queues, or moderation state.
- Discovery, follow, social loop, visibility boundary, moderation, replay, backup, and restore checks pass.
- Launch harness and operator docs can be reused by another operator or implementer.

## Execution Task Packets

### G1-A1: Emit Article Static Bundles

- Objective: update static ActivityPub output so public long-form content is represented as `Article`.
- Repo scope: `ipns-site-generator`.
- Owned areas: ActivityPub bundle generation and related tests.
- Verification: run the package test command for `ipns-site-generator`.
- Acceptance: generated outbox objects use `type: "Article"` with `name`, `summary`, `content`, `url`, `published`, `updated`, `attributedTo`, `to`, `cc`, `tag`, and `attachment` where available.
- Handoff output: `ipns-site-generator` commit `4c46826`; `npm test -- --runInBand` and `npm run lint` pass.

### G1-A2: Add Static Bundle Manifest

- Objective: add `activitypub-manifest.json` to the static bundle contract.
- Repo scope: `ipns-site-generator`, then `gateway-core`.
- Owned areas: manifest generation, manifest validation, bridge fixture.
- Verification: generator tests plus `cd gateway-core && npm test`.
- Acceptance: manifest declares generator, actor identity, file paths, and public-only visibility policy.
- Handoff output: `activitypub-manifest.json` v1 in `ipns-site-generator` commit `4c46826`; gateway manifest read path in `gateway-core` commit `9dca186`; `node --test` passes with 103 tests.

### G1-A3: Enforce Public-Only Static Boundary

- Objective: prevent non-public content from entering static federation output.
- Repo scope: `ipns-site-generator`, `gateway-core`.
- Owned areas: public-content filtering, bridge rejection behavior, fixtures.
- Verification: tests covering public, paid, encrypted, private, draft, and message-like inputs.
- Acceptance: non-public items never appear in outbox or outbound Create activities.
- Handoff output: generator filters explicit non-public markers while treating missing visibility as public; gateway keeps the runtime visibility gate as a second defense.

### G1-B1: Systematize Article Normalization

- Objective: make static bridge and outbound create/update paths share Article normalization rules.
- Repo scope: `gateway-core`.
- Owned areas: Article mapping, sanitizer, summary/excerpt, attachments, canonical link.
- Verification: `cd gateway-core && npm test`.
- Acceptance: public Articles retain safe HTML, preserve canonical URL, map IPFS media through the chosen gateway policy, and append original Matters link.
- Handoff output: normalized Article examples and compatibility notes for Mastodon, Misskey, and GoToSocial.

### G1-B2: Finish Visibility Audit and Admin Inspection

- Objective: make privacy boundary inspectable by operators.
- Repo scope: `gateway-core`.
- Owned areas: visibility audit records, admin endpoint, tests.
- Verification: `cd gateway-core && npm test`.
- Acceptance: operators can inspect recent included and excluded federation candidates without exposing private content.
- Handoff output: endpoint shape, sample response, and privacy review notes.

### G1-B3: Add Key Rotation and Consistency Scan

- Objective: harden long-running gateway operation.
- Repo scope: `gateway-core`.
- Owned areas: key overlap window, rotation script/runbook, follower/inbound object reconciliation.
- Verification: `cd gateway-core && npm test` plus script dry runs.
- Acceptance: key rotation does not break signed delivery, and consistency scans produce actionable difference reports.
- Handoff output: runbook paths, script commands, and sample scan report.

### G1-B4: Complete Incident Runbooks and Staging Drill

- Objective: make G1 operable by Matters.
- Repo scope: `gateway-core`, ops docs.
- Owned areas: staging observability drill, rollback plan, incident playbook, tabletop report.
- Verification: `npm run drill:observability` with staging-like config, plus `npm test`.
- Acceptance: alerts, metrics, logs, backup, restore, replay, and rollback procedures are documented and exercised.
- Handoff output: drill report path and launch readiness checklist update.

### G1-C1: Misskey and GoToSocial Interop

- Objective: complete multi-implementation fediverse validation.
- Repo scope: `gateway-core`, ops reports.
- Owned areas: black-box probes and archived reports.
- Verification: probe scripts and manual report review.
- Acceptance: Mastodon baseline remains valid; Misskey discovery and follow are documented; GoToSocial remains optional until a later product/testing decision.
- Handoff output: one report per implementation under `03-ops/`.

### G2-A1: Connect Real Matters Article Output

- Objective: replace fixture-only seed flow with selected real Matters article output.
- Repo scope: `matters-server`, `ipns-site-generator`, `gateway-core`.
- Owned areas: article export, manifest path, gateway ingestion config.
- Verification: targeted backend tests plus `gateway-core npm test`.
- Acceptance: selected public articles from real authors appear as gateway-served Article objects.
- Handoff output: `matters-server` commits `50e2219`, `bac7511`, and `4761f78` provide the non-production exporter scaffold, local writer, CLI, and targeted tests; current public API sample author is `charlesmungerai` with articles `1182465`, `1181808`, and `1181797`; local gateway-core probes passed; next handoff should add externally reachable staging URLs and rollback notes if the existing tunnel is used.

### G2-A2: Add Federation Settings Backend Contract

- Objective: support staged opt-in and per-article federation control.
- Repo scope: `matters-server`.
- Owned areas: schema/API, persistence, permission checks.
- Verification: targeted GraphQL/API tests.
- Acceptance: author-level opt-in is required, per-article control is respected, and non-public content cannot override the exclusion policy.
- Handoff output: API contract and migration notes.

### G2-B1: Add Author-Facing Controls

- Objective: let authors understand and control federation in Matters Web/App.
- Repo scope: `matters-web`.
- Owned areas: settings UI, article publish/edit UI, copy, error states.
- Verification: targeted component and workflow tests.
- Acceptance: pilot authors can opt in, choose article federation, and see clear disabled states for ineligible content.
- Handoff output: screenshots or QA notes and copy review status.

### G2-B2: Surface Federated Interactions

- Objective: show relevant Fediverse replies, follows, likes, and boosts in Matters.
- Repo scope: `matters-server`, `matters-web`, `gateway-core`.
- Owned areas: interaction projection, notification/feed surfaces, admin inspection.
- Verification: targeted API/UI tests plus gateway social-loop tests.
- Acceptance: inbound interactions are visible, attributable, moderatable, and do not duplicate native Matters interactions.
- Handoff output: interaction mapping table and QA notes.

### G2-C1: Pilot and Beta Rollout

- Objective: move from internal validation to selected-author pilot and beta.
- Repo scope: product docs, ops docs, targeted code fixes only.
- Owned areas: pilot list, rollout checklist, monitoring dashboard, rollback procedure, legal/comms readiness.
- Verification: pilot checklist and production readiness review.
- Acceptance: 50-100 selected authors complete pilot criteria before beta; beta does not start until legal and privacy text are accepted.
- Handoff output: pilot report, beta go/no-go decision, and open risks.

### G3-A1: Second-Instance Isolation

- Objective: make one independent instance run without Matters.town leakage.
- Repo scope: `gateway-core`, deployment docs.
- Owned areas: instance config, namespace isolation, launch harness.
- Verification: namespace isolation tests and black-box second-instance checks.
- Acceptance: actors, keys, queues, followers, moderation state, and URLs are isolated per instance.
- Handoff output: second-instance config sample and isolation report.

### G3-A2: Second-Instance Acceptance Run

- Objective: prove reuse with a real second publisher/community.
- Repo scope: `gateway-core`, ops reports.
- Owned areas: deployment, acceptance scripts, operator docs.
- Verification: discovery, follow, social loop, visibility boundary, moderation, replay, backup, and restore checks.
- Acceptance: second instance federates publicly and launch harness can be rerun by another operator or implementer.
- Handoff output: acceptance report and reusable launch guide.

## Public Interfaces

Static bundle contract:

- `activitypub-manifest.json`, version `1`.
- Article objects use `type: "Article"`, not `Note`.
- Visibility metadata must prove `federatedPublicOnly: true`.
- Non-public content is fully absent from generated ActivityPub output.

Gateway runtime:

- Existing WebFinger, actor, outbox, inbox, NodeInfo, admin, moderation, persistence, and observability endpoints remain supported.
- New or finalized admin surfaces should be limited to visibility audit, rollout inspection, and incident recovery.

Matters product integration:

- Canonical account format is `acct:user@matters.town`.
- Adoption model is staged opt-in plus per-article control.
- Paid, encrypted, private, draft, and message-like content remains fully invisible to federation.

## Verification Matrix

| Area | Required verification |
|---|---|
| `gateway-core` | `npm test` for every gateway change |
| `ipns-site-generator` | Existing package test command after static bundle changes |
| `matters-server` | Targeted GraphQL/API tests for federation settings and export |
| `matters-web` | Targeted UI/workflow tests for controls and interaction display |
| Interop | Mastodon, Misskey, and GoToSocial black-box reports |
| Ops | Staging observability drill, backup/restore, replay, rollback, incident tabletop |
| G3 | Second-instance isolation and launch harness acceptance |

## Handoff Template

Each task should end with:

```md
## Handoff

- Task:
- Branch:
- Changed files:
- Verification:
- Result:
- Remaining risks:
- Follow-up task:
```

## Assumptions

- `development-plan.md` remains the high-level roadmap.
- This file is the execution controller for G1-G3 implementation work.
- Existing `docs/tasks/matters-g1-*` files remain valid task-level handoffs.
- G2 and G3 task notes will be added under `docs/tasks/` when those stages enter execution.
- DID, ZK, and Billboard are intentionally out of scope for this execution plan.
