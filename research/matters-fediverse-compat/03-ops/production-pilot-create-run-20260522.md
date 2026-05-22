# Production Pilot Create Run

Date: 2026-05-22
Window: 2026-05-22 16:43-20:43 CST (+0800)
Status: bounded `Create` delivered; broad production outbound remains disabled

This records the first production ActivityPub delivery pilot for the approved
`mashbean` slice.

Important boundary: `matters-server-prod-new` remained in
`MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. The send was a bounded
gateway-origin pilot `Create` for one public article and the two already
accepted pilot followers. It did not enable broad server-triggered production
outbound delivery.

## Scope

- Pilot author: `mashbean`
- Actor: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Key id: `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`
- Article: `https://matters.town/a/3tmz0u0a42qx`
- Article id: `1225211`
- Object URL: `https://matters.town/a/3tmz0u0a42qx`
- Object id from generated bundle:
  `https://matters.town/1225211-matters-守望相助隊幕後-猩猩-打掃-強大/`
- Approved delivery targets:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`

## Preflight

Production public GraphQL check before generation:

- article `1225211`
- state `active`
- access `public`
- author `mashbean`
- author federation setting: `enabled`
- article federation setting: `inherit`

Gateway preflight immediately before send:

- command: `npm run check:production-record-only`
- result: `ok=true`
- `triggerMode=record_only`
- `fullOutboundEnabled=false`
- `outbox.totalItems=0`
- `followers.totalItems=2`
- actor key id matched `#gateway-core-20260517`

## Bundle Generation

The `federation-export-dev` Lambda generated a production bundle for the pilot
article and wrote the output to private S3 storage:

- bucket: `matters-fediverse-prod-bundles`
- prefix: `pilot/mashbean/1225211/2026-05-22T08-45-04-869Z`
- generated file count: 7
- `visibility.federatedPublicOnly=true`

The first S3 write failed because the Lambda execution role did not have scoped
write access. The role `sendmail-dev-role-3pec69pe` received an inline policy
limited to:

- `s3:ListBucket` on `arn:aws:s3:::matters-fediverse-prod-bundles` for
  `pilot/*`
- `s3:PutObject`, `s3:PutObjectTagging`, and `s3:GetObject` on
  `arn:aws:s3:::matters-fediverse-prod-bundles/pilot/*`

After this scoped fix, the Lambda run succeeded.

## Actor Mismatch Guard

The static Lambda bundle still used `acct:mashbean@matters.town` as its bundle
actor. The gateway pilot actor is `acct:mashbeanmatters@matters.town`.

Mitigation used for this run:

- do not send the static bundle actor as-is;
- take only the generated Article object;
- send through the gateway-core `mashbeanmatters` actor so the gateway signs and
  addresses the activity with the approved pilot identity.

## Send

The public Worker edge path rejected direct POST as expected:

- endpoint: `https://matters.town/ap/users/mashbeanmatters/outbox/create`
- result: `405 method_not_allowed`
- no ActivityPub delivery was sent from this failed edge POST.

The bounded send was then executed against the gateway-core origin:

- endpoint:
  `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/create`
- result: `202`
- activity id:
  `https://matters.town/ap/activities/1779439823202-create-mashbeanmatters`
- mapping: `create`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |

Delivery trace timestamps:

- `2026-05-22T08:50:23.654Z` to `https://g0v.social/users/mashbean`
- `2026-05-22T08:50:24.059Z` to
  `https://gyutte.site/users/819de678273e9b120fd654b5`

## Readback

Mastodon readback:

- command: `npm run check:mastodon-readback`
- result: `ok=true`
- remote account: `mashbeanmatters@matters.town`
- found status url: `https://matters.town/a/3tmz0u0a42qx`
- found status uri:
  `https://matters.town/1225211-matters-守望相助隊幕後-猩猩-打掃-強大/`

Misskey visual readback:

- URL checked: `https://gyutte.site/@mashbeanmatters@matters.town`
- result: profile resolves as `@mashbeanmatters@matters.town`
- the notes tab shows the Matters Fediverse article content.
- caveat: Misskey sorts by the ActivityPub object's original published time, so
  the visible note appears as an older item instead of a fresh timeline item.

## Queue And Runtime State

Post-send queue summary:

- total: `21`
- pending: `0`
- processing: `0`
- delivered: `21`
- deadLetter: `0`
- retryPending: `0`

Post-send SQLite backup and consistency scan:

- SSM command: `58e14af3-becb-4626-8e52-f0656de548c4`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-22-085633698Z-post-create-pilot-20260522.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-22-085633698Z-post-create-pilot-20260522.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-05-22-085634021Z-post-create-pilot-20260522.md`
- `totalDiffs=5`
- `missing_in_sqlite=0`
- `value_mismatch=0`
- all diffs are `missing_in_file`, matching the SQLite-primary runtime
  direction.

## Result

The first bounded production pilot `Create` passed for Mastodon and Misskey.

This does not mean broad production outbound is enabled. The next production
step is a separate decision: either keep observing this `Create`, or explicitly
approve a bounded `Update` pilot on the same public article.
