# Production Pilot Delete / Withdrawal Run

Date: 2026-05-28
Status: partial pass; Mastodon withdrew, Misskey accepted delivery but still
shows the remote note

This records the bounded production withdrawal rehearsal for the approved
`mashbean` pilot slice.

Important boundary: `matters-server-prod-new` remained in
`MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. The sends were bounded
gateway-origin `Delete` activities for one public article and the two already
accepted pilot followers. This did not edit or delete the Matters article
itself and did not enable broad server-triggered production outbound delivery.

## Scope

- Pilot author: `mashbean`
- Actor: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Key id: `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`
- Article: `https://matters.town/a/3tmz0u0a42qx`
- Article id: `1225211`
- Object id used by Create / Update:
  `https://matters.town/1225211-matters-守望相助隊幕後-猩猩-打掃-強大/`
- Canonical article URL:
  `https://matters.town/a/3tmz0u0a42qx`
- Approved delivery targets:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`

## Preflight

Gateway preflight immediately before withdrawal:

- command: `npm run check:production-record-only`
- result: `ok=true`
- `triggerMode=record_only`
- `fullOutboundEnabled=false`
- `outbox.totalItems=0`
- `followers.totalItems=2`
- actor key id matched `#gateway-core-20260517`

Queue state before withdrawal:

- total: `23`
- pending: `0`
- processing: `0`
- delivered: `23`
- deadLetter: `0`
- retryPending: `0`

Pre-delete SQLite backup and consistency scan:

- SSM command: `a0769384-da5f-40ff-aabe-dc5618ec62bb`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135243646Z-pre-delete-pilot-20260528.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135243646Z-pre-delete-pilot-20260528.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-05-28-135243980Z-pre-delete-pilot-20260528.md`
- `totalDiffs=5`
- `missing_in_sqlite=0`
- `value_mismatch=0`
- all diffs were `missing_in_file`, matching the SQLite-primary runtime
  direction.

## Delete Attempt 1: ActivityPub Object Id

Endpoint:

- `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/delete`

Payload object id:

- `https://matters.town/1225211-matters-守望相助隊幕後-猩猩-打掃-強大/`

Result:

- HTTP response: `202`
- activity id:
  `https://matters.town/ap/activities/1779976408559-delete-mashbeanmatters`
- mapping: `delete`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |

Delivery trace timestamps:

- `2026-05-28T13:53:28.878Z` to `https://g0v.social/users/mashbean`
- `2026-05-28T13:53:29.262Z` to
  `https://gyutte.site/users/819de678273e9b120fd654b5`

Post-attempt queue:

- total: `25`
- pending: `0`
- delivered: `25`
- deadLetter: `0`

Mastodon result:

- `npm run check:mastodon-readback` no longer returned the real article status.
- Direct status lookup for g0v.social status `116617368455156456` returned
  `Not Found`.

Misskey result:

- Safari visual check still showed
  `https://gyutte.site/notes/819e3a978d76f0c651155240`.
- The note page still displayed the real article preview and the origin link
  `https://matters.town/a/3tmz0u0a42qx`.

Post-attempt SQLite backup and consistency scan:

- SSM command: `16ccdb6b-23f4-4cfe-af0a-cf074de371f4`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135355951Z-post-delete-pilot-20260528.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135355951Z-post-delete-pilot-20260528.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-05-28-135356273Z-post-delete-pilot-20260528.md`
- `totalDiffs=5`
- `missing_in_sqlite=0`
- `value_mismatch=0`

## Delete Attempt 2: Canonical Article URL

Because Misskey still showed the note after attempt 1, a second bounded Delete
was sent using the canonical article URL as the object id. This tested whether
gyutte.site had stored the remote note identity using the Article `url` rather
than the ActivityPub object `id`.

Endpoint:

- `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/delete`

Payload object id:

- `https://matters.town/a/3tmz0u0a42qx`

Result:

- HTTP response: `202`
- activity id:
  `https://matters.town/ap/activities/1779976594905-delete-mashbeanmatters`
- mapping: `delete`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |

Delivery trace timestamps:

- `2026-05-28T13:56:35.174Z` to `https://g0v.social/users/mashbean`
- `2026-05-28T13:56:35.557Z` to
  `https://gyutte.site/users/819de678273e9b120fd654b5`

Post-attempt queue:

- total: `27`
- pending: `0`
- delivered: `27`
- deadLetter: `0`

Mastodon result:

- `npm run check:mastodon-readback` still did not return the real article
  status.

Misskey result:

- Safari visual check still showed
  `https://gyutte.site/notes/819e3a978d76f0c651155240`.
- This means gyutte.site accepted both Delete activities but did not withdraw
  the remote note from the visible UI during the test window.

Final SQLite backup and consistency scan:

- SSM command: `e216b4b3-39f4-4c20-a903-4befeb0312a2`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135816588Z-post-delete-url-pilot-20260528.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-28-135816588Z-post-delete-url-pilot-20260528.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-05-28-135816923Z-post-delete-url-pilot-20260528.md`
- `totalDiffs=5`
- `missing_in_sqlite=0`
- `value_mismatch=0`

## Result

Pass:

- bounded Delete delivery to both accepted pilot followers returned HTTP 202;
- Mastodon withdrew the real article status;
- direct Mastodon status lookup returned `Not Found`;
- gateway outbound queue stayed healthy with `pending=0` and `deadLetter=0`;
- pre/post/final SQLite backups succeeded;
- consistency scans had no SQLite omissions or value mismatches.

Open:

- Misskey / gyutte.site still showed the remote note after both Delete variants.
- This is a withdrawal-compatibility gap, not a queue or signature delivery
  failure.

## Follow-Up

Before broader rollout, add a Misskey-specific withdrawal fix or compatibility
path. Likely investigation points:

- whether Misskey requires `Delete.object` to be an embedded object or
  Tombstone-like object rather than a plain string id;
- whether Misskey stored a different canonical URI for the imported Article;
- whether Misskey handles Article deletes differently from Note deletes;
- whether gateway-core should persist remote platform object mappings after
  Create so Delete can target the exact remote-stored URI per platform.
