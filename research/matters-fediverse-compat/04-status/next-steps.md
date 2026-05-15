# Next Steps

Updated: 2026-05-15

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

## Immediate Engineering Work

1. Get a temporary `matters.town` Cloudflare token or dashboard session with
   zone-level Rulesets/WAF edit permission, add a narrow bypass for Meta crawler
   user agents on the staging federation paths, then rerun
   `npm run check:threads-discovery`. The current cache-only token is not
   authorized for WAF entrypoints. The 2026-05-15 dashboard attempt prepared
   the rule but did not deploy it because the Cloudflare window became
   unavailable before placement and Deploy.
2. Keep Threads as a separate compatibility investigation after the Cloudflare
   blocker is cleared. Retest again after canonical identity or a production-like
   domain is available; do not block Mastodon/Misskey staging signoff on the
   current Threads discovery failure.
3. Keep using `check:mastodon-readback` after each staging `Create`, `Update`,
   `Reply`, or `Delete` delivery run.

## Human Gates Before Production

1. Approve canonical identity cutover from
   `acct:user@staging-gateway.matters.town` to `acct:user@matters.town`.
2. Confirm production storage owner and S3 bucket/prefix policy.
3. Confirm production outbound delivery mode and rollback window.
4. Confirm legal takedown owner, privacy notice text, and key
   exposure/rotation owner.
5. Confirm launch copy and whether the first rollout is silent beta,
   limited pilot, or public announcement.
