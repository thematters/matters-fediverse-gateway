---
task_slug: matters-g2-b-web-app-integration
status: staging-api-validation-passed
goal: Define and implement the Matters product-facing federation controls without enabling production rollout
dispatcher: triad
executor: codex-local
host: any
branch: develop integration merged
latest_commit: server #4773 / web #5883 merged
last_updated: 2026-05-12T00:10:00-04:00
tmux_session: none
host_affinity: none
outputs_scope: matters-web, matters-server, gateway-core
shared_paths:
  - research/matters-fediverse-compat/02-runtime-slices/g2b-product-contract-slice.md
  - research/matters-fediverse-compat/05-roadmap/decisions/09-g2b-product-contract.md
related_repos:
  - ../matters-web
  - ../matters-server
  - .
related_paths:
  - ../matters-web/src/views/Me/Settings/Misc/index.tsx
  - ../matters-web/src/views/ArticleDetail/Edit/OptionContent/index.tsx
  - ../matters-web/src/views/ArticleDetail/Edit/gql.ts
  - ../matters-server/docs/Federation-Export.md
  - ../matters-server/src/connectors/article/federationExportService.ts
  - gateway-core/src/store/sqlite-state-store.mjs
local_paths:
  - none
start_command: none
stop_command: none
verify_command: gateway-core npm test; scan:consistency; check:secret-layout; lambda strict-gate run 25712528545; staging browser UI QA still pending
next_step: Finish browser UI QA for account-level Fediverse row, article edit override, and disabled-state copy on matters.icu
blockers: current pilot account has no owned staging articles for browser article-control QA; legal/privacy beta approval, production storage, and canonical acct:user@matters.town cutover remain human gates
---

# Task Handoff

## Context

G2-A proved that selected real public `matters.icu` article data can move through
`federation-export-dev`, the ActivityPub seed bundle, `gateway-core`, public
WebFinger / actor / outbox / NodeInfo probes, SQLite consistency scan, and
Misskey read-only verification.

G2-B is the product contract layer. It lets selected pilot authors understand
and control federation in Matters Web/App, while keeping production rollout
gated.

As of 2026-05-11, the code portion is merged to `develop`:

- `matters-server` PR #4773 added read-side federation settings, article
  eligibility, and pilot-scoped author/article mutations.
- `matters-web` PR #5883 added the account-level and per-article pilot UI
  controls.
- Both develop deploys passed on `matters.icu`.
- `server.matters.icu` exposes the expected G2-B schema fields and mutations.

The account permission gate is cleared for API validation:
`mashbean@matters.town` is confirmed as staging admin, has `fediverseBeta`, and
its account-level federation setting is enabled on `matters.icu`. Browser UI QA
still needs a real staging article owned by the pilot account, or an agreed test
author/article path.

## Recommended Product Contract

Use the conservative default:

- Author-level federation is default off.
- Only pilot authors can see and use the controls at first.
- Author setting must be explicitly `enabled` before any article can federate.
- Article setting defaults to `inherit`.
- Article `disabled` always blocks federation.
- Article `enabled` is only meaningful when the author setting is enabled.
- Paid, encrypted, private, archived, missing-identity, or otherwise non-public
  content cannot be federated regardless of settings.

This matches the existing server gate in
`matters-server/src/connectors/article/federationExportService.ts`.

## UI Entry Points

Author-level control:

- Repo: `matters-web`
- Suggested location: `src/views/Me/Settings/Misc/index.tsx`
- Add a `Fediverse` settings row near existing account/service settings.
- Row state should show `Off`, `On`, or `Pilot unavailable`.
- First implementation can be a dialog or drawer with one switch and
  explanatory copy.

Per-article control:

- Repo: `matters-web`
- Suggested location: `src/views/ArticleDetail/Edit/OptionContent/index.tsx`
- Add the control under the existing `Settings` tab.
- Query article setting from `src/views/ArticleDetail/Edit/gql.ts`.
- Disable the control for ineligible articles and show why.

Admin inspection:

- Repo: `matters-server` first, then `matters-web`
- Use existing admin-only mutations only for staging/internal setup until the
  user-facing mutation contract is added.
- Admin status should show pilot author setting, article overrides, latest export
  decision, failed delivery count, and rollback state.

## Copy Draft

Author setting title:

```text
Fediverse
```

Author setting description:

```text
讓其他 Fediverse 服務追蹤你的公開文章。付費、加密、私人與草稿內容不會送出。
```

Article setting title:

```text
同步到 Fediverse
```

Article setting states:

```text
跟隨帳號設定
允許這篇文章同步
不要同步這篇文章
```

Disabled-state copy:

```text
這篇文章目前不能同步。只有公開、已發布、作者身分正常的文章可以送到 Fediverse。
```

Beta warning:

```text
這是測試功能。同步後，公開文章與互動可能會出現在其他 Fediverse 服務。
```

## Backend Contract Gaps

Already present in `matters-server` after PR #4773:

- `putUserFederationSetting(input: { id, state })`
- `putArticleFederationSetting(input: { id, state })`
- `resolveFederationExportGate`
- `decisionReport`
- strict gate support for export runs
- Read-side GraphQL fields on viewer/user/article for current federation setting.
- Non-admin, pilot-scoped mutation for the viewer to update their own author
  setting.
- Author-owned mutation for article federation override.

Still needed after staging UI validation:

- Export trigger contract after publish/edit when an eligible public article
  changes.
- Audit log or durable decision record for setting changes and export decisions.

## Acceptance Criteria

- Pilot authors can see their author-level federation setting in Matters Web.
- Pilot authors can turn federation on or off for their own account.
- Pilot authors can set an article override to `inherit`, `enabled`, or
  `disabled` from article edit settings.
- Ineligible articles show a disabled state with a clear reason.
- The UI cannot override the server-side public-only boundary.
- Export trigger behavior is documented and covered by tests before production
  rollout.
- All user-facing copy is reviewed before beta.

## Verification Plan

Server:

- Targeted GraphQL tests for read fields and pilot-scoped mutations are covered
  in the merged server PR.
- Read-only `server.matters.icu` checks confirmed the schema fields and
  conservative default gate behavior.
- Strict-gate Lambda dry-run still blocks the paywalled article as
  `article_not_public`.

Web:

- API validation confirmed the pilot account has `fediverseBeta` and
  account-level federation is `enabled`.
- Merged pilot controls still need manual browser QA on `matters.icu`.
- Validate account setting, article setting, disabled state, and pilot
  unavailable state before any production PR.

Gateway:

- No new runtime requirement for the first UI slice.
- Continue using staging public probes and SQLite consistency scan after export
  trigger dry-runs.
- 2026-05-12 deployed-Lambda strict-gate run
  `25712528545` selected public article `23520` and paywalled article `23522`;
  `23520` was exported, `23522` stayed blocked as `article_not_public`, the
  bundle was ingested by `gateway-core`, WebFinger / actor / outbox / NodeInfo
  probes passed, and SQLite consistency scan returned `totalDiffs=0`.
- 2026-05-11 local gateway verification passed: `npm test` 117/117,
  `scan:consistency` total diffs `0`, `check:rollout-artifact` OK, and
  `check:secret-layout` OK.

## Human Gates

- Browser UI QA for the pilot account and a staging article owned by that
  account, or an agreed alternate test author/article.
- Final copy approval.
- Whether pilot authors can force-enable individual public articles or only
  inherit/disable during the first beta.
- Legal/privacy approval before broader beta.
- Production storage and credential approval.
- Canonical identity cutover timing for `acct:user@matters.town`.
