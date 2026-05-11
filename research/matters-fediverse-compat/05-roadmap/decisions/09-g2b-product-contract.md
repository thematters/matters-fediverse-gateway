# Decision 09: G2-B Product Contract

Date: 2026-05-11
Status: accepted; develop integration merged; staging UI validation pending pilot/admin permission

## Decision

G2-B starts with a conservative, pilot-only product contract:

- Federation is default off at the author level.
- Missing author setting is treated as `disabled`.
- Missing article setting is treated as `inherit`.
- Author opt-in is required before any article can federate.
- Article `disabled` blocks federation.
- Article `enabled` cannot override an author who has not opted in.
- Non-public content cannot be federated regardless of settings.
- Existing public articles are not automatically backfilled on opt-in.
- Product UI starts in `matters-web`, but server-side eligibility remains the
  source of truth.

## Reasoning

This keeps the first beta understandable and reversible. It also matches the
current `matters-server` gate behavior, where `resolveFederationExportGate`
requires explicit author opt-in, supports per-article
`inherit` / `enabled` / `disabled`, and preserves the public-only boundary.

The strongest product risk is accidental external publication. Default-off,
pilot-only, server-owned eligibility is the safest path while still letting real
authors test the workflow.

## Repo Boundaries

| Repo | Responsibility |
| --- | --- |
| `matters-server` | Author/article setting persistence, read fields, mutation permissions, eligibility decisions, export decision audit. |
| `matters-web` | Author-facing account control, per-article edit control, disabled states, copy, and QA surface. |
| `lambda-handlers` | Async export job execution and optional S3/file output after server decision. |
| `matters-fediverse-gateway` | Runtime federation state, ActivityPub delivery, public probes, moderation/ops state. |

## Deferred Decisions

- Pilot author list.
- Final Traditional Chinese / English copy.
- Whether beta supports article-level force-enable or only inherit/disable.
- Backfill policy for old public articles after opt-in.
- Delete/update policy when a previously federated article becomes non-public.
- Legal/privacy approval before beta.
- Production storage and canonical `acct:user@matters.town` cutover timing.

## Acceptance For This Decision

- G2-B task note exists.
- G2-B runtime/product contract slice exists.
- Execution plan marks G2-B as active contract work.
- No production setting, storage, or deployment is changed by this decision.
- `matters-server` PR #4773 and `matters-web` PR #5883 are merged to
  `develop` and deployed to `matters.icu`.
- `mashbean@matters.town` is the intended staging pilot/admin test account, but
  it is not yet granted the permission required for UI validation.
