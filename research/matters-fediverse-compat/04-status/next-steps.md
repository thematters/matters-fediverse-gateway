# Next Steps

Updated: 2026-05-16

## Done Baseline

- `gateway-core` minimum follow / signature / followers / dead-letter runtime is implemented.
- Identity discovery hardening is implemented for the staging actor surface.
- Mastodon-compatible discovery and delivery have staging evidence.
- Misskey discovery, follow, Article display, reply probes, and delivery evidence have staging evidence.
- G2-B product controls are merged and deployed on `matters.icu` develop.
- Pilot-owned public article `23525` passed strict-gate Lambda generation and public gateway probes.
- PR #29 actor discovery hints are merged and deployed to the local staging gateway.
- A staging outbound `Update` for article `23525` delivered to g0v.social and gyutte.site, and the queue returned to 0 pending / 0 dead letters.
- A g0v.social Mastodon read-back application has been created with read-only scopes only, and API read-back can resolve `mashbeanmatters@staging-gateway.matters.town`.
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
- Cloudflare custom rule `skip-staging-fediverse-meta-crawlers` is enabled for
  `staging-gateway.matters.town` federation paths only. `check:threads-discovery`
  now returns `ok: true` for default, `facebookexternalua`,
  `facebookexternalhit`, and `meta-externalagent` probes against staging
  WebFinger, actor, outbox, and NodeInfo.
- Logged-in Threads UI search still returns no profile result for
  `mashbeanmatters@staging-gateway.matters.town`; this is now tracked as
  Threads indexing or canonical identity compatibility, not as a Cloudflare
  403 or gateway WebFinger failure.
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
- Canonical identity cutover planning has started. The planned pilot identity
  is `acct:mashbeanmatters@matters.town`; the current canonical Worker surface
  still only accepts the demo handles `matters` and `mattersprobe02`, so the
  pilot identity is intentionally not public yet.

## Immediate Engineering Work

1. Keep the staging reconciliation source file bounded and operator-curated.
   Add only known public Activity URLs; do not use crawler-style discovery or
   expose the job route without an internal token, Access, mTLS, or equivalent
   operator boundary.
2. Keep Threads as a separate compatibility investigation around platform
   indexing, federation-sharing account settings, and canonical identity. Do
   not block Mastodon/Misskey staging signoff on the current Threads UI
   discovery result.
3. Prepare an implementation PR for config-driven canonical pilot handle
   support on `matters.town`, but do not deploy it until CTO / infra approves
   the route and Cloudflare cache/WAF changes.
4. Retest Threads again after canonical identity or a production-like domain is
   available and `meta-externalagent` can reach the canonical WebFinger route.
5. Keep using `check:mastodon-readback` after each staging `Create`, `Update`,
   `Reply`, or `Delete` delivery run.

## Human Gates Before Production

1. Approve canonical identity cutover from
   `acct:user@staging-gateway.matters.town` to `acct:user@matters.town`.
2. Confirm production gateway hosting, SQLite backup/restore path, scheduler
   boundary, monitoring, and direct-origin fallback outside Cloudflare.
3. Confirm production storage owner and S3 bucket/prefix policy.
4. Confirm production outbound delivery mode and rollback window.
5. Confirm legal takedown owner, privacy notice text, and key
   exposure/rotation owner.
6. Confirm launch copy and whether the first rollout is silent beta,
   limited pilot, or public announcement.
