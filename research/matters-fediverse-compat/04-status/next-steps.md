# Next Steps

Updated: 2026-05-18

## Done Baseline

- `gateway-core` minimum follow / signature / followers / dead-letter runtime is implemented.
- Identity discovery hardening is implemented for the staging actor surface.
- Mastodon-compatible discovery and delivery have staging evidence.
- Misskey discovery, follow, Article display, reply probes, and delivery evidence have staging evidence.
- G2-B product controls are merged and deployed on `matters.icu` develop.
- Pilot-owned public article `23525` passed strict-gate Lambda generation and public gateway probes.
- PR #29 actor discovery hints are merged and deployed to the local staging gateway.
- A staging outbound `Update` for article `23525` delivered to g0v.social and gyutte.site, and the queue returned to 0 pending / 0 dead letters.
- A g0v.social Mastodon read-back application has been created with read-only scopes only, and API read-back can resolve `mashbeanmatters@matters.town`.
- `check:mastodon-readback` is implemented and verified with the saved
  read-only token; it can resolve the staging actor and inspect recent remote
  statuses without writing the token to reports.
- A bounded staging `Delete` proof passed on
  `staging-delete-proof-20260515T120541Z`: `Create` and `Delete` delivered to
  g0v.social and gyutte.site, and g0v.social returned `404` for the deleted
  status after deletion.
- `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` is enabled on
  `matters-server-develop`, and fresh staging article `23534`
  (`https://matters.icu/a/hwj8ajpbc048`) produced both `publish_article` and
  `revise_article` audit rows with `record_only`, `recorded`, and
  `eligible=true`. Both rows used article setting `inherit`, which is valid for
  the current author opt-in default.
- Cloudflare custom rule `skip-fediverse-meta-crawlers` is enabled for both
  `staging-gateway.matters.town` and the narrow canonical `matters.town`
  federation paths. `check:threads-discovery` now defaults to the canonical
  `matters.town` surface and returns `ok: true` for default,
  `facebookexternalua`, `facebookexternalhit`, and `meta-externalagent` probes
  against WebFinger, `/ap/users/<handle>`, outbox, and NodeInfo.
- Logged-in Threads UI search can find the canonical pilot profile, but Threads
  follow still does not complete. This is tracked as a Threads Follow
  compatibility item, not as a launch blocker or backend regression.
- `POST /jobs/inbound-reconciliation` is implemented for scheduled
  reconciliation of known public remote Activity URLs. It reuses the manual
  `POST /admin/inbound/reconcile-activity` policy checks and writes trace/audit
  records. The route now requires a configured scheduler bearer token, and
  `npm run run:inbound-reconciliation` validates an explicit bounded source of
  public `https` Activity URLs before posting to the job endpoint.
- After PR #30 was merged, the Mac-hosted staging gateway was restarted on the
  merged code, configured with `inboundReconciliation.schedulerBearerTokenFile`,
  and connected to a 15-minute bounded reconciliation loop. The loop writes a
  no-op report when the operator-approved source file is empty.
- The scheduler path was exercised with the public g0v.social reply Activity
  `https://g0v.social/users/mashbean/statuses/116575631875488289/activity`.
  The activity was already present in SQLite from the earlier inbound reconcile
  pass, and a post-run consistency scan returned `totalDiffs=0`.
- Canonical pilot identity is live as `acct:mashbeanmatters@matters.town` for
  the approved pilot handle. The AWS `gateway-core` origin is active behind the
  Worker, Mastodon and Misskey canonical follows converge to persistent state,
  and a canonical pilot Article is visible on both Mastodon / g0v.social and
  Misskey / gyutte.site.
- Misskey reply, reaction/like, and renote return paths have been stored by
  gateway-core. Mastodon interaction return remains unproven only because the
  current g0v.social test token is read-only.
- Product approval now allows production preparation for `mashbean` in
  record-only / observation mode. Full production outbound delivery remains
  disabled.
- Production `matters-server-prod-new` now has
  `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. Elastic Beanstalk
  returned to Ready / Green / Ok after the setting change,
  `https://server.matters.town/health` returned 200, production GraphQL exposes
  `UserFeatures.fediverseBeta`, and the 2026-05-18
  `npm run check:production-record-only` preflight passed with
  `fullOutboundEnabled=false`, outbox `totalItems=0`, and followers
  `totalItems=2`. No production ActivityPub outbound delivery was enabled or
  sent.
- Production `mashbean` has visible Fediverse settings and author federation is
  enabled. The first real pilot article,
  `https://matters.town/a/3tmz0u0a42qx` (`article_id=1225211`), is `active`,
  `public`, owned by `mashbean`, and production GraphQL reports
  `federationEligibility.eligible=true` with effective article setting
  `inherit` in a 2026-05-18 production GraphQL check.
- The repeatable deployed-Lambda staging path is the `lambda-handlers` workflow
  `Invoke Federation Export Staging`. Run `26017383955` selected public article
  `23525`, skipped paywalled article `23522` as `article_not_public`, returned
  one eligible generated bundle, and kept `dryRun=true`. Direct Lambda
  `articleIds` invocation is not the validated path because the deployed Lambda
  environment does not include DB connection variables.
- The first production audit-row query attempt showed that the workflow cannot
  run from `develop`, because the GitHub `production` environment only allows
  `main` / `master` deployment branches. `matters-server` PR #4804 moves the
  same read-only query workflow onto `master` so audit-row verification can run
  without broadening production runtime behavior. Its pull-request and push
  build checks passed after rerun; it still requires review because the base
  branch is `master`.

## Immediate Engineering Work

1. Keep the staging reconciliation source file bounded and operator-curated.
   Add only known public Activity URLs; do not use crawler-style discovery or
   expose the job route without an internal token, Access, mTLS, or equivalent
   operator boundary.
2. Keep Threads as a separate compatibility investigation around Follow
   acceptance. Do not block Mastodon/Misskey pilot preparation on the current
   Threads Follow failure.
3. Wait for the production query workflow to be available from an allowed
   `master` / `main` branch, then query `federation_export_event` for production
   article `1225211`. The exact command and pass/fail criteria are in
   `03-ops/production-record-only-observation-runbook.md`.
4. Confirm the audit row reports `mode=record_only`, `status=recorded`, and
   `eligible=true`. Do not enable full outbound delivery.
5. Keep using `npm run check:production-record-only` after production
   configuration changes. This is read-only and must keep passing while the
   system remains in observation mode.
6. Keep using `check:mastodon-readback` after each pilot `Create`, `Update`,
   `Reply`, or `Delete` delivery run. Use a write-scoped Mastodon token or a
   browser-based manual action before claiming Mastodon interaction return.
7. Preserve the versioned key-id rule for production actors; do not reuse the
   earlier Worker demo `#main-key` with gateway-core key material.

## Human Gates Before Production

1. Confirm production gateway hosting, SQLite backup/restore path, scheduler
   boundary, monitoring, and direct-origin fallback outside Cloudflare.
2. Confirm production storage owner and S3 bucket/prefix policy.
3. Confirm production outbound delivery mode and rollback window after
   record-only observation, not before.
4. Confirm legal takedown owner, privacy notice text, and key
   exposure/rotation owner.
5. Confirm launch copy and whether the first rollout is silent beta,
   limited pilot, or public announcement.
