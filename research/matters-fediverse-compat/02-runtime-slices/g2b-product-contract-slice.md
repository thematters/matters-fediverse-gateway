# G2-B Product Contract Slice

Date: 2026-05-12
Status: develop integration merged; staging API validation passed; browser UI QA pending; no production rollout

## Goal

G2-B turns the working export path into a product surface that selected Matters
authors can understand and control.

This slice does not enable production federation. It defines the contract for
author opt-in, per-article behavior, export triggers, and product copy so
`matters-web`, `matters-server`, and `gateway-core` can move in the same
direction.

## Repo-Backed Starting Point

| Repo | Existing evidence | Current meaning |
| --- | --- | --- |
| `matters-server` | `docs/Federation-Export.md` | Server owns public-only eligibility, author/article settings, and decision reports. |
| `matters-server` | `src/connectors/article/federationExportService.ts` | `resolveFederationExportGate` requires explicit author opt-in and blocks non-public content. |
| `matters-server` | `src/types/system.ts` | Admin-only setting mutations and enum states already exist. |
| `matters-web` | `src/views/Me/Settings/Misc/index.tsx` | Account settings page is the lowest-friction author-level UI entry point. |
| `matters-web` | `src/views/ArticleDetail/Edit/OptionContent/index.tsx` | Article edit `Settings` tab is the natural per-article control entry point. |
| `matters-web` | `src/views/ArticleDetail/Edit/gql.ts` | Edit article query is where article federation fields should be read. |
| `gateway-core` | SQLite runtime and public staging probes | Gateway does not need new UI state for the first G2-B slice; it consumes export output and records delivery state. |

## Recommended State Model

Author setting:

| State | Meaning |
| --- | --- |
| missing | Treated as `disabled`. This is the default. |
| `disabled` | No article from the author is federated. |
| `enabled` | Public eligible articles may federate unless the article disables it. |

Article setting:

| State | Meaning |
| --- | --- |
| missing | Treated as `inherit`. |
| `inherit` | Follow author setting. |
| `enabled` | Allow this public article only if author setting is enabled. |
| `disabled` | Block this article. |

Non-public boundary:

- `paid`, encrypted, private, archived, draft, missing-author-identity, or
  message-like content remains blocked even if settings are `enabled`.
- Paywall/private blocks must be decided server-side, not by matters-web.

## Product Flow

```mermaid
flowchart TD
  A["Pilot author opens settings"] --> B["Author-level Fediverse control"]
  B --> C{"Author setting enabled?"}
  C -- "No" --> D["All article controls show blocked or inherit-off state"]
  C -- "Yes" --> E["Public article edit settings can inherit / enable / disable"]
  E --> F["Server computes federation export gate"]
  F -- "eligible" --> G["Async export trigger dry-run or job enqueue"]
  F -- "skipped" --> H["Decision report records reason"]
  G --> I["lambda-handlers generates bundle"]
  I --> J["gateway-core ingests bundle and delivers via ActivityPub"]
```

## API Contract

Read fields:

```graphql
type UserFederationSetting {
  userId: ID!
  state: FederationAuthorSettingState!
  updatedBy: ID
}

type ArticleFederationSetting {
  articleId: ID!
  state: FederationArticleSettingState!
  updatedBy: ID
}
```

Recommended additions:

```graphql
extend type User {
  federationSetting: UserFederationSetting
  federationEligible: Boolean!
}

extend type Article {
  federationSetting: ArticleFederationSetting
  federationEligibility: ArticleFederationEligibility!
}

type ArticleFederationEligibility {
  eligible: Boolean!
  reason: FederationExportDecisionReason!
  effectiveArticleSetting: FederationArticleSettingState!
}
```

Mutation policy:

- Existing admin-only mutations remain for staging/internal setup.
- User-facing author mutation can only update the viewer's own author setting
  after the viewer has the pilot feature flag.
- User-facing article mutation can only update an article owned by the viewer
  after the viewer has the pilot feature flag.
- Both mutations must return the computed effective state or eligibility reason.

As of 2026-05-11, `matters-server` PR #4773 has merged this contract to
`develop`, and the develop deploy exposes the expected fields on
`server.matters.icu`. `matters-web` PR #5883 has also merged the pilot UI
controls to `develop`.

As of 2026-05-12, the staging pilot/admin API gate is cleared:
`mashbean@matters.town` is a staging admin test account, has `fediverseBeta`,
and account-level federation is `enabled`. Public article `23520` is eligible
after author opt-in, while paywalled article `23522` remains blocked as
`article_not_public`. Deployed-Lambda strict-gate dry-run
<https://github.com/thematters/lambda-handlers/actions/runs/25712528545>
passed with one exported public Article and one skipped paywalled Article.
Browser UI QA remains pending because the current pilot account has no owned
staging articles.

## Export Trigger Boundary

First implementation should be dry-run capable:

| Event | Behavior before production |
| --- | --- |
| Author toggles setting | Record setting; do not publish existing backlog automatically. |
| Public article published | Compute decision report; enqueue export only in staging/pilot mode. |
| Public article edited | Compute decision report; enqueue update only in staging/pilot mode. |
| Article becomes non-public | Record skip reason and later enqueue delete/update only after production deletion policy is approved. |
| Article setting disabled | Stop future export; deletion/update behavior remains a rollout/legal decision. |

The safe next engineering slice is a server-side dry-run trigger that records
the decision report without writing S3, sending ActivityPub, or changing
production data.

## Product Copy

Author settings:

```text
Fediverse
讓其他 Fediverse 服務追蹤你的公開文章。付費、加密、私人與草稿內容不會送出。
```

Article settings:

```text
同步到 Fediverse
跟隨帳號設定
允許這篇文章同步
不要同步這篇文章
```

Disabled reason:

```text
這篇文章目前不能同步。只有公開、已發布、作者身分正常的文章可以送到 Fediverse。
```

Beta warning:

```text
這是測試功能。同步後，公開文章與互動可能會出現在其他 Fediverse 服務。
```

## Implementation Order

1. Add read-side federation setting and eligibility fields in `matters-server`.
   Done in PR #4773.
2. Add pilot-scoped user-facing setting mutations in `matters-server`.
   Done in PR #4773.
3. Add account-level control in `matters-web`.
   Done in PR #5883.
4. Add per-article control in `matters-web`.
   Done in PR #5883.
5. Grant staging pilot/admin permission to `mashbean@matters.town`, add
   `fediverseBeta`, and run UI validation on `matters.icu`.
6. Add export-trigger dry-run and decision audit in `matters-server` or
   `lambda-handlers`.
7. Re-run `matters.icu` staging public-only and strict-gate checks.
8. Gate production rollout on legal/privacy, pilot author approval, storage, and
   canonical identity cutover.

## Current Human Decisions

Recommended defaults:

- Author federation default: off.
- First beta: pilot allowlist only.
- Article default: inherit.
- Individual article force-enable: allowed only when author is enabled.
- Existing article backlog: do not auto-export on opt-in until a separate pilot
  action is approved.

Still needs staging permission before UI validation:

- `mashbean@matters.town` must be granted the required staging admin / pilot
  permission.
- `fediverseBeta` must be assigned to the pilot account.

Still needs human approval before production:

- Final copy.
- Backfill policy for existing public articles.
- Delete/update behavior when an already federated article becomes non-public.
- Legal/privacy approval.
