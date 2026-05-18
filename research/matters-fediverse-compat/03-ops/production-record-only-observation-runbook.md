# Production Record-Only Observation Runbook

Date: 2026-05-18
Status: prepared; waiting for `matters-server` #4804 review / merge

## Purpose

Verify the first production `mashbean` federation pilot in `record_only` mode
without enabling ActivityPub outbound delivery.

This runbook is read-only from the gateway side. It must not send Create,
Update, Delete, Follow, Accept, or other ActivityPub activities from production.

## Current Pilot Inputs

| Item | Value |
| --- | --- |
| Pilot author | `mashbean` |
| Pilot actor | `acct:mashbeanmatters@matters.town` |
| Production article URL | `https://matters.town/a/3tmz0u0a42qx` |
| Production article id | `1225211` |
| Production article global id | `QXJ0aWNsZToxMjI1MjEx` |
| Expected trigger mode | `record_only` |
| Expected delivery mode | full outbound disabled |

## Preconditions

- `matters-server-prod-new` has
  `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`.
- `gateway-core` production preflight returns `ok=true`:

  ```bash
  cd gateway-core
  npm run check:production-record-only
  ```

- The preflight must show:
  - `fullOutboundEnabled=false`
  - actor `acct:mashbeanmatters@matters.town`
  - public key id ending in `#gateway-core-20260517`
  - outbox `totalItems=0`
  - followers collection readable
- Production GraphQL must report article `3tmz0u0a42qx` as active, public, and
  eligible:

  ```bash
  curl -sS https://server.matters.town/graphql \
    -H 'content-type: application/json' \
    --data '{"query":"query($shortHash:String!){ article(input:{shortHash:$shortHash}) { id shortHash title state access { type } author { userName } federationSetting { state } federationEligibility { eligible reason effectiveArticleSetting } } }","variables":{"shortHash":"3tmz0u0a42qx"}}'
  ```

## Workflow Gate

`matters-server` PR #4804 adds the read-only workflow on `master` because the
GitHub `production` environment rejects `develop` branch runs.

Do not broaden the GitHub production environment branch policy just for this
query. Keep the production environment restricted to `master` / `main`.

After #4804 is reviewed and merged, trigger:

```bash
gh workflow run query-production-federation-export-event.yml \
  --repo thematters/matters-server \
  --ref master \
  -f article_id=1225211 \
  -f limit=10 \
  -f include_decision_report=false
```

Watch the run:

```bash
gh run list \
  --repo thematters/matters-server \
  --workflow query-production-federation-export-event.yml \
  --limit 3

gh run watch RUN_ID --repo thematters/matters-server --interval 20
```

## Expected Audit Evidence

The selected row set should include at least one row for `article_id=1225211`
with:

| Field | Expected value |
| --- | --- |
| `mode` | `record_only` |
| `status` | `recorded` |
| `eligible` | `true` |
| `reason` | `eligible` |
| `author_setting` | `enabled` |
| `article_setting` | `inherit` or null if represented as default |
| `effective_article_setting` | `inherit` |

If the row is absent, do not enable outbound delivery. First confirm whether the
article was published or edited after production `record_only` became active.

## Stop Conditions

Stop and keep production outbound disabled if:

- the workflow cannot enter the GitHub `production` environment;
- VPN or DB connection fails;
- no row exists and there has been a qualifying publish/edit after
  `record_only` was enabled;
- the row exists but `mode` is not `record_only`;
- the row exists but `status` is not `recorded`;
- the row reports `eligible=false` for a public, active, opted-in pilot article;
- any production outbox item appears unexpectedly;
- any Lambda/S3/gateway delivery is triggered from the main server backend.

## Evidence To Archive

- #4804 merge commit and workflow run URL.
- Production preflight JSON output.
- Production article GraphQL JSON output.
- Production `federation_export_event` query output.
- A note that production outbox stayed at `totalItems=0`.
- The decision to remain in record-only or move toward pilot outbound.

## Next Gate After Pass

Passing this runbook only proves production audit recording. It does not approve
full production delivery.

Before enabling production outbound Create / Update / Delete, complete or
explicitly waive:

- private S3 bundle storage and retention;
- Lambda and gateway secret ownership / rotation;
- rollback rehearsal;
- legal takedown owner;
- privacy notice;
- key exposure / rotation owner;
- launch communication plan.
