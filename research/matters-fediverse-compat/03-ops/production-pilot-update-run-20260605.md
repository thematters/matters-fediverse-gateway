# Production Pilot Update Run

Date: 2026-06-05
Status: bounded `Update` delivered; broad production outbound remains disabled

This records the next bounded production ActivityPub `Update` pilot after the
decision to enter production pilot outbound.

Important boundary: `matters-server-prod-new` remained in
`MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. This run used the
gateway-core origin to send one public `Update` for the approved `mashbean`
pilot author. It did not enable server-triggered broad production outbound.

## Scope

- Pilot author: `mashbean`
- Actor: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Key id: `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`
- Article: `https://matters.town/a/n0wacr6zgyyq`
- Article id: `1228008`
- Title:
  `Matters2IPFS 又可以用了，讓文章指紋變成可分享的 IPFS 連結`
- Activity id:
  `https://matters.town/ap/activities/1780633856367-update-mashbeanmatters`
- Approved delivery targets:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`
  - `https://threads.net/ap/users/17841401579146452/`

## Preflight

Production record-only preflight:

- command: `npm run check:production-record-only`
- result: `ok=true`
- `triggerMode=record_only`
- `fullOutboundEnabled=false`
- health: `inboxMode=persistent`, `followReadiness=ready`,
  `storeDriver=sqlite`
- outbox before send: `totalItems=2`
- followers before send: `totalItems=3`
- actor key id matched `#gateway-core-20260517`

Public discovery:

- command: `npm run check:threads-discovery`
- first run briefly saw Cloudflare 429 challenge on some default-UA probes
  after a high-frequency probe burst.
- immediate manual curl and rerun passed.
- final result before send: `ok=true`, no failures, no warnings.

Production GraphQL article check:

- article global id: `QXJ0aWNsZToxMjI4MDA4`
- short hash: `n0wacr6zgyyq`
- state: `active`
- access: `public`
- author: `mashbean`
- `federationEligibility.eligible=true`
- `effectiveArticleSetting=inherit`

Fresh AWS-backed SQLite backup and consistency scan before send:

- SSM command: `91fc8ebe-9466-4592-86cf-f4012f6a2ddc`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-05-042756106Z-pre-outbound-pilot-20260605.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-05-042756106Z-pre-outbound-pilot-20260605.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-06-05-042756470Z-pre-outbound-pilot-20260605.md`
- result: `totalDiffs=8`, all `missing_in_file`; `missing_in_sqlite=0`,
  `value_mismatch=0`

The diffs are expected because SQLite is now the runtime source of truth and
legacy file state is no longer primary.

## Payload

The `Update` payload was built from production public GraphQL data for article
`n0wacr6zgyyq`.

The payload did not edit the Matters article itself. It re-sent the current
public Article object through gateway-core with a fresh ActivityPub `updated`
timestamp.

Temporary local evidence:

- payload file:
  `/tmp/matters-fediverse-production-update-1228008-20260605.json`
- response file:
  `/tmp/matters-fediverse-production-update-1228008-20260605-response.json`

The temp payload file contains the public article body and should not be copied
into the repo. The repo keeps only this operational summary.

## Send

Endpoint:

- `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/update`

Result:

- HTTP response: `202`
- activity id:
  `https://matters.town/ap/activities/1780633856367-update-mashbeanmatters`
- mapping: `update`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |
| Threads | delivered | HTTP 200 |

Delivery trace timestamps:

- `2026-06-05T04:30:56.650Z` to `https://g0v.social/users/mashbean`
- `2026-06-05T04:30:57.016Z` to
  `https://gyutte.site/users/819de678273e9b120fd654b5`
- `2026-06-05T04:30:57.402Z` to
  `https://threads.net/ap/users/17841401579146452/`

## Public ActivityPub Readback

The `Update` activity is publicly readable:

- type: `Update`
- actor: `https://matters.town/ap/users/mashbeanmatters`
- object type: `Article`
- object URL: `https://matters.town/a/n0wacr6zgyyq`
- object `updated`: `2026-06-05T04:30:46.054Z`
- `atomUri`: absent

The canonical Article object is also publicly readable as ActivityPub JSON:

- type: `Article`
- URL: `https://matters.town/a/n0wacr6zgyyq`
- title:
  `Matters2IPFS 又可以用了，讓文章指紋變成可分享的 IPFS 連結`
- published: `2026-05-20T06:26:39.773Z`
- updated: `2026-06-05T04:30:46.054Z`
- `atomUri`: absent

## Queue And Runtime State

Post-send queue summary:

- total: `60`
- pending: `1`
- processing: `0`
- delivered: `58`
- deadLetter: `1`
- retryPending: `1`

The new `Update` added three delivered items. The remaining pending /
retryPending / dead-letter items are older Threads compatibility test payloads:

- retryPending:
  `https://matters.town/ap/activities/1780588199379-create-note-companion-mashbeanmatters`
- dead-letter:
  `https://matters.town/ap/activities/1780527884912-create-mashbeanmatters`

They are not new regressions from this pilot update.

Fresh AWS-backed SQLite backup and consistency scan after send:

- SSM command: `66da53ec-ccd2-4ea4-9b3d-36a072040a70`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-05-043134752Z-post-outbound-pilot-update-20260605.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-05-043134752Z-post-outbound-pilot-update-20260605.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-06-05-043135113Z-post-outbound-pilot-update-20260605.md`
- result: `totalDiffs=8`, all `missing_in_file`; `missing_in_sqlite=0`,
  `value_mismatch=0`

## Receiver Readback

Threads:

- logged-in Threads profile still opens and shows the canonical remote profile.
- Threads already displays the previous companion Note / visibility probes.
- This run was an Article `Update`; Threads did not create a new visible
  top-level post during immediate UI readback.
- Gateway-side delivery to Threads passed with HTTP 200.
- Threads remote Reply / Share / single-post permalink remain receiver-side
  beta limitations, not gateway blockers.

Misskey:

- logged-in gyutte.site profile resolves as
  `@mashbeanmatters@matters.town`.
- profile shows the actor as followed and reports 8 posts.
- delivery to gyutte.site passed with HTTP 202.
- Immediate UI readback was limited to profile-level evidence because the
  browser automation did not reliably switch the Misskey profile to the notes
  tab during this run.

Mastodon:

- delivery to g0v.social passed with HTTP 202.
- automated Mastodon API readback was not available in this checkout because
  `gateway-core/runtime/secrets/g0v-mastodon-readback-token` was missing.

## Result

The bounded production pilot `Update` passed preflight, AWS backup/scan,
gateway delivery, queue inspection, and public ActivityPub readback. Broad
server-triggered production outbound remains disabled.

Remaining work before broader rollout:

- restore or re-create the Mastodon readback token for repeatable post-send API
  verification;
- perform a manual Misskey notes-tab visual check after UI automation becomes
  stable;
- keep Threads receiver-visible limitations tracked separately;
- decide separately when to enable server-triggered outbound beyond bounded
  pilot sends.
