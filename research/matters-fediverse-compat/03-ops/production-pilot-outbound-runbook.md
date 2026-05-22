# Production Pilot Outbound Runbook

Date: 2026-05-22
Status: prepared; do not execute until the release branch and final gates are
cleared

## Purpose

Move from production `record_only` observation to a narrow production outbound
pilot for the approved author `mashbean`.

This runbook is intentionally not a full rollout. It allows one pilot author,
one known public article sequence, and known accepted followers only. It must
not enable default-on federation, broad author rollout, crawler-style discovery,
or delivery for private, paid, encrypted, circle-only, archived, draft, or
message-like content.

## Branch And Release Policy

Follow `/Users/mashbean/Documents/AI-Agent/docs/ops/matters-release-branch-policy.md`.

- Normal release path: `develop -> master`.
- Do not open a parallel direct `master` PR for normal release work.
- Direct `master` PRs are hotfix-only and must be back-merged or cherry-picked
  to `develop`.
- For the v5.23.0 release batch, the completed path was:
  1. merge conflict-resolution PRs into `develop`;
  2. close the stale #4806 release PR unmerged;
  3. merge `matters-server` #4814 from `develop` to `master`;
  4. merge follow-up sync PR #4811 back to `develop`.

## Current Cleared Evidence

| Gate | Evidence |
| --- | --- |
| Production record-only backend setting | `matters-server-prod-new` has `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. |
| Gateway production preflight | `npm run check:production-record-only` returned `ok=true`, `fullOutboundEnabled=false`, outbox `totalItems=0`, followers `totalItems=2` on 2026-05-22. |
| Pilot article eligibility | `https://matters.town/a/3tmz0u0a42qx` / article `1225211` is active, public, owned by `mashbean`, and eligible with effective article setting `inherit`. |
| Production audit row | Workflow run `26079277083` returned `trigger=publish_article`, `mode=record_only`, `status=recorded`, `eligible=true`, `reason=eligible`, `author_setting=enabled`, and `effective_article_setting=inherit`. |
| Production audit repeat query | Workflow run `26269962135` passed on 2026-05-22 with `include_decision_report=false` and returned row `id=399` for article `1225211` with redacted `decision_report`. |
| Canonical actor runtime | `acct:mashbeanmatters@matters.town` resolves through `gateway-core` with versioned key id `#gateway-core-20260517`. |
| Mastodon / Misskey follow baseline | g0v.social and gyutte.site follow state converge through the AWS `gateway-core` origin. |
| Misskey interaction return | Reply, like/reaction, and renote returned to `gateway-core` and persisted in SQLite. |

## Still Required Before Executing

Do not start outbound until these are true:

- `matters-server` v5.23.0 release is on `master` through PR #4814.
- Production record-only audit repeat query works with
  `include_decision_report=false` after the v5.23.0 release.
- Private production S3 bundle bucket/prefix, IAM role, lifecycle, access logs,
  and retention are confirmed.
- Lambda and gateway ingestion secret owners are named, with a rotation path.
- Rollback owner and rollback window are named.
- Legal takedown owner and response path are named.
- Privacy notice / external persistence copy has product/legal approval.
- Key exposure / rotation owner is named.
- Gateway operator confirms latest backup and SQLite consistency scan.

## Non-Goals

- Do not turn federation on by default for all users.
- Do not expand beyond `mashbean` in this runbook.
- Do not deliver old backfill content in bulk.
- Do not deliver paid/private/encrypted/circle-only content.
- Do not change root Matters site routing.
- Do not publish credentials, actor private keys, tokens, or DB output that
  contains private payloads.

## Preflight Commands

Run before any outbound change:

```bash
cd gateway-core
export PRODUCTION_GATEWAY_CONFIG=/path/to/production.instance.json
npm run check:production-record-only
node scripts/backup-sqlite.mjs \
  --config "$PRODUCTION_GATEWAY_CONFIG" \
  --label pre-outbound-pilot
node scripts/scan-consistency.mjs \
  --config "$PRODUCTION_GATEWAY_CONFIG" \
  --label pre-outbound-pilot
```

Expected:

- `check:production-record-only` reports `ok=true`.
- outbox is still `totalItems=0` before the pilot send.
- backup artifact exists and can be read.
- consistency scan has no unexplained diff.

Repeat production audit query:

```bash
gh workflow run query-production-federation-export-event.yml \
  --repo thematters/matters-server \
  --ref master \
  -f article_id=1225211 \
  -f limit=10 \
  -f include_decision_report=false
```

Expected row:

- `mode=record_only`
- `status=recorded`
- `eligible=true`
- `trigger=publish_article`

## Pilot Outbound Scope

Approved pilot author:

- `mashbean`

Approved actor:

- `acct:mashbeanmatters@matters.town`

Approved target article:

- `https://matters.town/a/3tmz0u0a42qx`
- article id `1225211`

Approved first remote platforms:

- Mastodon / g0v.social
- Misskey / gyutte.site

Threads remains a compatibility track and is not a blocker.

## Execution Sequence

1. Freeze author/pilot scope.
2. Confirm the article is still public and eligible through production GraphQL.
3. Generate or fetch the production bundle through the approved async export
   worker path.
4. Store generated bundle output in the approved private S3 location.
5. Ingest the generated bundle into `gateway-core` without sending delivery.
6. Verify WebFinger, actor, outbox, NodeInfo, manifest, and SQLite consistency.
7. Confirm exactly the accepted pilot followers are targeted.
8. Send one public `Create` for the pilot article.
9. Run Mastodon read-back and Misskey notes read-back.
10. Confirm queue returns to no pending / no dead-letter state.
11. Edit the article with a small public update only after the Create evidence is
    archived.
12. Send one public `Update`.
13. Run read-back again.
14. Archive all evidence.

## Pass Criteria

- One production `Create` is visible on Mastodon and Misskey.
- One production `Update` is visible or otherwise confirmed as accepted by both
  platforms.
- `gateway-core` queue has no unexplained pending or dead-letter items.
- No private, paid, encrypted, circle-only, archived, draft, or message-like
  content appears in any bundle or remote object.
- Production outbox contains only the approved pilot article sequence.
- No unexpected author or article is selected.

## Stop Conditions

Stop immediately and keep outbound disabled if:

- production preflight fails;
- audit query no longer reports the pilot article as eligible;
- the generated bundle includes non-public content;
- S3 writes to a public bucket/prefix unexpectedly;
- follower target set includes unexpected domains or actors;
- delivery creates broad queue growth;
- Mastodon or Misskey rejects all deliveries with signature/key errors;
- privacy/legal/takedown owner is not confirmed before execution;
- rollback owner cannot be reached during the pilot window.

## Rollback

Fast rollback:

1. Set production export trigger mode back to `record_only` or `off`.
2. Disable `mashbean` author federation setting through the approved admin/API
   path.
3. Preserve gateway SQLite, queue, traces, and delivery logs.
4. Stop outbound queue processing.
5. If a remote object must be withdrawn, send a bounded `Delete` only after the
   rollback owner approves.
6. If routing must be disabled, preserve evidence first and then remove the
   narrow federation route.

Do not delete evidence or rotate keys before preserving logs and SQLite backup.

## Evidence To Archive

- Release PR and commit hashes.
- Production preflight JSON.
- Production audit query output.
- S3 bundle location and retention policy summary.
- Gateway ingestion report.
- Queue status before and after delivery.
- Mastodon read-back output.
- Misskey notes read-back output.
- Any remote reply/like/boost return evidence.
- Rollback owner and go/no-go timestamp.

## Next Step After Pilot Passes

If the pilot Create and Update pass:

1. keep production in pilot mode for observation;
2. do not open all authors automatically;
3. prepare a separate expansion decision for broader opt-in availability;
4. keep Threads follow debugging separate from Mastodon/Misskey launch readiness.
