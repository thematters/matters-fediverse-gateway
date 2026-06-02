# Production Pilot Create Run

Date: 2026-06-02
Status: bounded `Create` delivered for a fresh production article; broad
production outbound remains disabled

This records the second bounded production `Create` pilot for the approved
`mashbean` slice. It was run after the earlier withdrawal rehearsal marked the
old pilot article as deleted in gateway runtime state.

Important boundary: this was a gateway-origin bounded send to the two already
accepted pilot followers. It did not enable server-triggered broad production
outbound delivery.

## Scope

- Pilot author: `mashbean`
- Actor: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Key id: `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`
- Article: `https://matters.town/a/n0wacr6zgyyq`
- Article id: `1228008`
- Title:
  `Matters2IPFS 又可以用了，讓文章指紋變成可分享的 IPFS 連結`
- Object id:
  `https://matters.town/1228008-matters2-ipfs-又可以用了-讓文章指紋變成可分享的-ipfs-連結/`
- Approved delivery targets:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`

## Preflight

Gateway origin health:

- origin instance: `i-0a5bca704b0a14b53`
- origin service: `matters-gateway-core`
- origin config: `/etc/matters-gateway/staging.instance.json`
- origin store driver: `sqlite`
- Worker health: `ok=true`, `inboxMode=persistent`,
  `followReadiness=ready`

Fresh backup and consistency scan before the send:

- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-01-235257624Z-aws-readiness-20260601.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-01-235257624Z-aws-readiness-20260601.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-06-01-235257985Z-aws-readiness-20260601.md`
- result: `totalDiffs=5`, all `missing_in_file`; `missing_in_sqlite=0`,
  `value_mismatch=0`

The diffs are expected because SQLite is the runtime source of truth and legacy
file state is no longer primary.

## Send

The bounded send was executed against the gateway-core origin:

- endpoint:
  `http://127.0.0.1:8787/users/mashbeanmatters/outbox/create`
- result: `202`
- activity id:
  `https://matters.town/ap/activities/1780361487400-create-mashbeanmatters`
- object type: `Article`
- object URL: `https://matters.town/a/n0wacr6zgyyq`

Delivery results:

| Target | Result | Status |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | HTTP 202 |
| gyutte.site / Misskey | delivered | HTTP 202 |

Delivery trace ids:

- `157` delivered to `https://g0v.social/users/mashbean`
- `158` delivered to `https://gyutte.site/users/819de678273e9b120fd654b5`
- `159` recorded `create.fanned-out` with `deliveryCount=2`

## Public Discovery

Post-send public probe passed:

- WebFinger:
  `acct:mashbeanmatters@matters.town`
- actor:
  `https://matters.town/ap/users/mashbeanmatters`
- outbox:
  `https://matters.town/ap/users/mashbeanmatters/outbox`
- NodeInfo discovery:
  `https://matters.town/.well-known/nodeinfo`
- NodeInfo 2.1:
  `localPosts=1`

The actor outbox initially remained empty because it only bridged static outbox
fixtures. Gateway PR #81 added delivered runtime `Create` activities to the
actor outbox, then was deployed to the AWS origin.

Post-deploy outbox readback:

- totalItems: `1`
- first activity:
  `https://matters.town/ap/activities/1780361487400-create-mashbeanmatters`
- first object:
  `Article`
  `https://matters.town/1228008-matters2-ipfs-又可以用了-讓文章指紋變成可分享的-ipfs-連結/`
- first object URL:
  `https://matters.town/a/n0wacr6zgyyq`

Threads discovery diagnostics:

- report:
  `research/matters-fediverse-compat/03-ops/threads-dedicated-validation-20260602.json`
- result: `ok=true`
- warnings: none
- failures: none

The Threads diagnostic checks public discovery preconditions only. It does not
query Threads private APIs and does not prove Threads indexing or follow
completion.

## Readback

Remote delivery was accepted by both known recipients, but receiver-visible
readback is still split:

- Mastodon public HTML grep did not find the article text on
  `https://g0v.social/@mashbean`.
- Misskey public HTML grep did not find the article text on
  `https://gyutte.site/@mashbean`.
- Prior Mastodon API readback requires an access token; unauthenticated API
  search returns `401`.
- Prior Misskey ActivityPub readback requires an access token;
  unauthenticated `api/ap/show` returns `401`.

This means delivery acceptance is proven, but receiver UI visibility for this
specific 2026-06-02 article still needs logged-in browser or token-based
readback.

## Result

The 2026-06-02 bounded production `Create` passed gateway-side preflight,
delivery, public discovery, and public outbox readback.

## Post-Refresh Runtime Evidence

After PR #81 was deployed and PR #82 recorded the run, the AWS origin received a
fresh backup and consistency scan:

- SSM command: `f1e20136-373d-44ea-b5f8-3fc8c2ca63ce`
- backup:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-02-010624924Z-post-create-refresh-20260602.sqlite`
- manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-06-02-010624924Z-post-create-refresh-20260602.sqlite.json`
- consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-06-02-010625309Z-post-create-refresh-20260602.md`
- result: `totalDiffs=5`, all `missing_in_file`; `missing_in_sqlite=0`,
  `value_mismatch=0`
- outbound queue status: `delivered=33`; no `pending`, `processing`, or
  `deadLetter` rows

The remaining diffs are the known SQLite-primary migration deltas: followers,
one inbound object, and inbound engagements exist in SQLite but not legacy file
state.

Remaining work before broader outbound remains:

- confirm receiver-visible Mastodon and Misskey readback for the new article;
- continue Threads indexing/follow investigation;
- keep production server-triggered outbound disabled until a separate rollout
  decision.
