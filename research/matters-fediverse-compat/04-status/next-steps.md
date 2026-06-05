# Next Steps

Updated: 2026-05-22

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
- Logged-in Threads UI search can find the canonical pilot profile, Threads
  follow completes, remote profile/feed display is visible, and Threads-origin
  Likes return to gateway-core. Threads still blocks remote Reply and Share,
  and does not expose a Threads single-post permalink for remote posts; these
  are tracked as receiver-side beta limitations, not as gateway blockers.
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
- Product approval allowed a bounded production pilot for `mashbean` in
  record-only / observation mode. Broad production outbound delivery remains
  disabled.
- Production `matters-server-prod-new` now has
  `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. Elastic Beanstalk
  returned to Ready / Green / Ok after the setting change,
  `https://server.matters.town/health` returned 200, production GraphQL exposes
  `UserFeatures.fediverseBeta`, and the 2026-05-22
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
- Production record-only audit-row verification passed in read-only workflow
  run `26079277083`. The row for article `1225211` has
  `trigger=publish_article`, `mode=record_only`, `status=recorded`,
  `eligible=true`, `reason=eligible`, `author_setting=enabled`, and
  `effective_article_setting=inherit`.
- The repeatable deployed-Lambda staging path is the `lambda-handlers` workflow
  `Invoke Federation Export Staging`. Run `26017383955` selected public article
  `23525`, skipped paywalled article `23522` as `article_not_public`, returned
  one eligible generated bundle, and kept `dryRun=true`. Direct Lambda
  `articleIds` invocation is not the validated path because the deployed Lambda
  environment does not include DB connection variables.
- The `matters-server` release path for v5.23.0 has completed through PR
  [#4814](https://github.com/thematters/matters-server/pull/4814). The old
  #4806 release PR was closed unmerged; the redacted production audit query fix
  is now on `master`.
- A 2026-05-22 repeat production audit query passed as read-only workflow run
  [26269962135](https://github.com/thematters/matters-server/actions/runs/26269962135)
  with `include_decision_report=false`. It returned the same production
  `federation_export_event` row for article `1225211`: `id=399`,
  `trigger=publish_article`, `mode=record_only`, `status=recorded`,
  `eligible=true`, `reason=eligible`, `author_setting=enabled`,
  `effective_article_setting=inherit`, and redacted `decision_report`.
- A 2026-05-22 public discovery diagnostic returned `ok=true` for canonical
  `acct:mashbeanmatters@matters.town` WebFinger, actor, outbox, and NodeInfo
  probes across the default, `facebookexternalua`, `facebookexternalhit`, and
  `meta-externalagent` user agents. This does not prove Threads Follow, but it
  confirms the public crawler-facing prerequisites still pass.
- The first bounded production pilot `Create` ran during the approved
  2026-05-22 16:43-20:43 CST (+0800) window. `federation-export-dev` generated
  the production bundle into private S3 under
  `s3://matters-fediverse-prod-bundles/pilot/mashbean/1225211/2026-05-22T08-45-04-869Z`.
  The public Worker edge correctly rejected direct POST with 405, so the
  bounded send used the gateway-core origin
  `/users/mashbeanmatters/outbox/create`. g0v.social and gyutte.site accepted
  delivery with HTTP 202, the queue returned to `pending=0` and
  `deadLetter=0`, Mastodon readback found
  `https://matters.town/a/3tmz0u0a42qx`, and Misskey visual readback showed the
  canonical actor and Matters Fediverse article on gyutte.site.
- Post-send gateway-origin backup and scan completed through SSM command
  `58e14af3-becb-4626-8e52-f0656de548c4`. The scan reported
  `totalDiffs=5`, all `missing_in_file`, with `missing_in_sqlite=0` and
  `value_mismatch=0`, which matches the SQLite-primary runtime direction.
- On 2026-05-28, a bounded production pilot `Update` for the same public article
  delivered through gateway-core origin. Preflight still returned `ok=true`,
  `record_only`, `fullOutboundEnabled=false`, and `followers.totalItems=2`.
  The gateway-origin `Update` returned HTTP 202 and delivered to both accepted
  pilot followers. Queue health after send was `pending=0`, `deadLetter=0`.
  Mastodon readback still found `https://matters.town/a/3tmz0u0a42qx`, and
  Misskey UI readback still showed the canonical actor and Matters Fediverse
  article.
- On 2026-06-05, after the decision to enter production pilot outbound, a
  bounded gateway-origin `Update` for public article `n0wacr6zgyyq` delivered to
  g0v.social, gyutte.site, and Threads while production server-triggered
  outbound stayed disabled. Fresh pre/post AWS SQLite backups and consistency
  scans passed with only expected SQLite-primary `missing_in_file` diffs.
- Follow-up gateway-core PRs #118 and #119 added auditable resolve paths for
  known-bad dead-letter and retry-pending queue items. After deploying commit
  `9f58054`, the two obsolete Threads compatibility payloads were resolved
  without replay. Live queue health is now `pending=0`, `retryPending=0`, and
  `deadLetter=0`, with `resolved=2`.
- On 2026-05-28, the bounded production withdrawal rehearsal ran with pre/post
  AWS SSM SQLite backups and consistency scans. Two Delete variants were sent:
  the ActivityPub object id and the canonical article URL. Both delivered to
  g0v.social and gyutte.site with HTTP 202, and the gateway queue stayed at
  `pending=0` and `deadLetter=0`. Mastodon withdrew the real article status and
  direct status lookup returned `Not Found`. Misskey accepted delivery but still
  showed the remote note in Safari, so Misskey withdrawal remains an open
  compatibility gap.

## Immediate Engineering Work

1. Keep the staging reconciliation source file bounded and operator-curated.
   Add only known public Activity URLs; do not use crawler-style discovery or
   expose the job route without an internal token, Access, mTLS, or equivalent
   operator boundary.
2. Keep Threads as a separate receiver-visible compatibility investigation.
   Follow / Accept, profile/feed display, and Like return now have evidence.
   Exact-handle account search also passed on 2026-06-04.
   The latest companion Note also received a Threads-origin Like return.
   Use `03-ops/threads-receiver-visible-regression-runbook.md` after bounded
   proof sends or Cloudflare changes. Current public endpoint and Meta-like UA
   discovery checks pass; Threads permalink exposure, remote Share, and remote
   Reply are receiver-side beta limitations rather than gateway blockers.
3. Keep production audit queries on the redacted path by default
   (`include_decision_report=false`), using workflow run
   [26269962135](https://github.com/thematters/matters-server/actions/runs/26269962135)
   as the post-release proof.
4. Keep production in pilot observation after the first bounded `Create` and
   `Update`, and the bounded withdrawal rehearsal.
   The pilot outbound sequence is tracked in
   `03-ops/production-pilot-outbound-runbook.md`, and the first run evidence is
   archived in `03-ops/production-pilot-create-run-20260522.md` and
   `03-ops/production-pilot-update-run-20260528.md` and
   `03-ops/production-pilot-delete-run-20260528.md`. Do not expand beyond the
   `mashbean` pilot.
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
2. Treat Matters current General Manager as the decision owner for production
   storage, rollback, legal takedown, privacy notice, key exposure/rotation,
   and Lambda/gateway ingestion secrets. Infra, CTO/security, legal/policy, and
   gateway operator roles support execution and advice.
3. Fix or explicitly scope the Misskey withdrawal compatibility gap before any
   broader production rollout. Mastodon withdrawal passed; Misskey delivery
   accepted but visible note removal did not happen in the test window.
4. Confirm legal takedown response path, privacy notice text, and key
   exposure/rotation path under the General Manager owner model.
5. Confirm launch copy and whether the first rollout is silent beta,
   limited pilot, or public announcement.
