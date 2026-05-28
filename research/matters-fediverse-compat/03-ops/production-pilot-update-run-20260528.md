# Production Pilot Update Run

Date: 2026-05-28
Status: bounded `Update` delivered; broad production outbound remains disabled

This records the bounded production ActivityPub `Update` pilot for the already
approved `mashbean` slice.

Important boundary: `matters-server-prod-new` remained in
`MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. The send was a bounded
gateway-origin `Update` for one public article and the two already accepted
pilot followers. It did not enable broad server-triggered production outbound
delivery.

## Scope

- Pilot author: `mashbean`
- Actor: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Key id: `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`
- Article: `https://matters.town/a/3tmz0u0a42qx`
- Article id: `1225211`
- Object id:
  `https://matters.town/1225211-matters-守望相助隊幕後-猩猩-打掃-強大/`
- Approved delivery targets:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`

## Preflight

Gateway preflight immediately before send:

- command: `npm run check:production-record-only`
- result: `ok=true`
- `triggerMode=record_only`
- `fullOutboundEnabled=false`
- `outbox.totalItems=0`
- `followers.totalItems=2`
- actor key id matched `#gateway-core-20260517`

Queue state before send:

- total: `21`
- pending: `0`
- processing: `0`
- delivered: `21`
- deadLetter: `0`
- retryPending: `0`

Public GraphQL article check before payload construction:

- article global id: `QXJ0aWNsZToxMjI1MjEx`
- short hash: `3tmz0u0a42qx`
- title: `Matters 守望相助隊幕後—猩猩，打掃，強大！`
- state: `active`
- access: `public`
- author: `mashbean`
- `federationEligibility.eligible=true`
- `effectiveArticleSetting=inherit`

## Payload

The `Update` payload was built from production public GraphQL data for article
`3tmz0u0a42qx`.

The payload did not edit the Matters article itself. It re-sent the current
public Article object through gateway-core with a fresh ActivityPub `updated`
timestamp.

Temporary local evidence:

- payload file:
  `/tmp/matters-fediverse-production-update-1225211-20260528.json`
- response file:
  `/tmp/matters-fediverse-production-update-1225211-20260528-response.json`

The temp payload file contains the public article body and should not be copied
into the repo. The repo keeps only this operational summary.

## Send

Endpoint:

- `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/update`

Result:

- HTTP response: `202`
- activity id:
  `https://matters.town/ap/activities/1779975201732-update-mashbeanmatters`
- mapping: `update`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |

Delivery trace timestamps:

- `2026-05-28T13:33:22.060Z` to `https://g0v.social/users/mashbean`
- `2026-05-28T13:33:22.483Z` to
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
- notes tab still shows the Matters Fediverse article content.
- caveat: Misskey sorts by the ActivityPub object's original published time, so
  the updated object remains in the original article position rather than
  appearing as a fresh top-of-timeline item.

Misskey unauthenticated `ap/show` returned 401, so the post-send Misskey
readback is visual/UI evidence rather than API evidence.

## Queue And Runtime State

Post-send queue summary:

- total: `23`
- pending: `0`
- processing: `0`
- delivered: `23`
- deadLetter: `0`
- retryPending: `0`

AWS session state:

- AWS CLI session had expired before this run.
- S3 bundle readback and SSM SQLite backup/scan were not run in this pass.
- Non-AWS evidence still confirms preflight, bounded delivery, queue health,
  Mastodon readback, and Misskey visual readback.

## Result

The bounded production pilot `Update` passed for delivery acceptance on Mastodon
and Misskey, with Mastodon API readback and Misskey UI readback.

This does not mean broad production outbound is enabled. The next production
decision is whether to keep observing the `Create` / `Update` pilot, run a
fresh AWS-backed backup/consistency scan after AWS reauthentication, or prepare
the next bounded pilot action such as `Delete` / withdrawal rehearsal.
