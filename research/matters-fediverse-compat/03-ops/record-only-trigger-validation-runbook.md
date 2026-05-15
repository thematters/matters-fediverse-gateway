# Record-Only Trigger Validation Runbook

Date: 2026-05-13
Status: prepared; waiting for `matters.icu` develop environment variable access

## Purpose

Validate that the `matters-server` publish/edit trigger scaffold can record
strict federation export decisions on `matters.icu` without enabling production
delivery.

This runbook does not enable production federation. It only verifies audit rows
in the develop environment.

## Preconditions

- `matters-server` PR
  [#4774](https://github.com/thematters/matters-server/pull/4774) is merged to
  `develop`.
- Deploy run
  [25768243309](https://github.com/thematters/matters-server/actions/runs/25768243309)
  passed build, develop DB migration, Elastic Beanstalk deploy, develop Lambda
  deploy, and notification.
- `server.matters.icu` GraphQL responds.
- `mashbean@matters.town` remains the staging pilot account.
- The pilot account has `fediverseBeta` and account-level federation enabled.
- Production deploy, production DB migration, and production federation delivery
  remain disabled.

## Enable Staging Audit Mode

Ask the infrastructure owner to set this environment variable on the
`matters.icu` develop Elastic Beanstalk environment:

```text
MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only
```

Then restart or redeploy the develop server environment.

Rollback is:

```text
MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=off
```

or remove the variable and restart/redeploy develop.

## Trigger Test

Use a fresh staging-only public article after `record_only` is enabled.
Do not reuse article `23525` for the publish trigger because it was already
published before this validation mode was enabled.

1. Log in to `https://matters.icu` as `mashbean@matters.town`.
2. Confirm account-level federation is enabled.
3. Publish a new clearly marked public staging article.
4. Record its article ID and short hash.
5. Edit the same article with a small visible staging note.
6. Confirm normal publish/edit UX remains unblocked.

Expected triggers:

| Action | Expected trigger |
| --- | --- |
| Fresh public publish | `publish_article` |
| Content edit/revision | `revise_article` |

## Database Evidence

Query `federation_export_event` for the new article ID:

```sql
select
  id,
  article_id,
  actor_id,
  trigger,
  mode,
  status,
  eligible,
  reason,
  author_setting,
  article_setting,
  effective_article_setting,
  decision_report,
  created_at
from federation_export_event
where article_id = :article_id
order by created_at desc;
```

Save the result as JSON, for example:

```json
[
  {
    "article_id": "ARTICLE_ID",
    "trigger": "revise_article",
    "mode": "record_only",
    "status": "recorded",
    "eligible": true,
    "reason": "eligible",
    "effective_article_setting": "inherit",
    "decision_report": {
      "decisions": [
        {
          "eligible": true,
          "reason": "eligible"
        }
      ]
    }
  }
]
```

Then run the local evidence checker from `gateway-core`:

```bash
node scripts/check-record-only-trigger-report.mjs \
  --events-file ./runtime/record-only-events.json \
  --article-id ARTICLE_ID
```

The checker also accepts stdin:

```bash
cat ./runtime/record-only-events.json | \
  node scripts/check-record-only-trigger-report.mjs \
    --events-file - \
    --article-id ARTICLE_ID
```

For a revise-only check against an existing article:

```bash
node scripts/check-record-only-trigger-report.mjs \
  --events-file ./runtime/record-only-events.json \
  --article-id 23525 \
  --only-trigger revise_article
```

## Pass Criteria

- `publish_article` and `revise_article` rows exist for the fresh article.
- Each row has `mode = record_only`.
- Each row has `status = recorded`.
- Each row has `eligible = true` and `reason = eligible`.
- `effective_article_setting` may be `inherit` or `enabled`; `inherit` is valid
  when the author has explicitly opted in and the article follows the author
  default. `disabled` must still fail.
- `decision_report.decisions[0]` is present and agrees with the stored row.
- Normal publish/edit remains successful even if audit recording is non-critical.
- No Lambda, S3, IPNS, or ActivityPub delivery is invoked by `matters-server`.

## Non-Delivery Evidence

The code contract for `record_only` is server-local audit only. To preserve
deployment evidence, record:

- The `matters-server` deploy run URL.
- The fresh staging article URL.
- The SQL result for `federation_export_event`.
- Any available Lambda invocation dashboard showing no new export invocation
  caused by the publish/edit action.
- A note that no gateway `outbox/create` call was made during this validation.

## Stop Conditions

Stop and roll back the environment variable to `off` if:

- private, paywalled, archived, or otherwise non-public content becomes
  eligible;
- publish/edit fails because the audit write failed;
- the server attempts to invoke Lambda, S3, IPNS, or ActivityPub delivery from
  the main backend;
- the change touches production instead of `matters.icu` develop.
