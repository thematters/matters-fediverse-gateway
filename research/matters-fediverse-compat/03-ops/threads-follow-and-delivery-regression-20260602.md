# Threads Follow And Delivery Regression

Date: 2026-06-02
Status: gateway-side pass; Threads profile/feed display, account search, and Like return confirmed; permalink and reply remain receiver limitations or follow-up checks

## Scope

This records the Threads compatibility regression for the canonical pilot actor:

- Account: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Threads remote actor: `https://threads.net/ap/users/17841401579146452/`
- Gateway origin: AWS `gateway-core` behind the narrow Cloudflare Worker `/ap/*` routes
- ActivityPub API only; no Threads API fallback

## What Changed

Threads Follow originally reached `gateway-core`, but the follow request stayed
pending in the Threads UI because the gateway's outbound `Accept` delivery was
rejected by Threads with HTTP 500.

The compatibility fix is:

- `Accept.object` and `Reject.object` now embed the original `Follow` activity
  object when the inbound activity is available.
- String object fallback remains for callers that only provide a Follow id.
- Existing pending Threads `Accept` queue items were rewritten to the embedded
  Follow-object form and replayed.

PR:

- `https://github.com/thematters/matters-fediverse-gateway/pull/90`

Deployed gateway-core origin commit:

- `8db7477`

## Verification

Local gateway-core tests:

```bash
cd gateway-core
node --check src/lib/activitypub.mjs
node --check test/gateway-core.test.mjs
npm test
```

Result:

- `139/139` tests passed.

Live health:

- `https://gateway-core-origin.matters.town/healthz`: ok
- `https://matters.town/ap/healthz`: ok

Live follower snapshot after replay:

| Receiver | Remote actor | Status | Shared inbox |
| --- | --- | --- | --- |
| Mastodon / g0v.social | `https://g0v.social/users/mashbean` | `accepted` | `https://g0v.social/inbox` |
| Misskey / gyutte.site | `https://gyutte.site/users/819de678273e9b120fd654b5` | `accepted` | `https://gyutte.site/inbox` |
| Threads | `https://threads.net/ap/users/17841401579146452/` | `accepted` | `https://threads.net/ap/inbox/` |

Live queue snapshot after replay and bounded Article delivery:

- `pending=0`
- `processing=0`
- `deadLetter=0`

Latest public `Create` activity delivered to Threads:

- Activity: `https://matters.town/ap/activities/1780361487400-create-mashbeanmatters`
- Object: `https://matters.town/1228008-matters2-ipfs-又可以用了-讓文章指紋變成可分享的-ipfs-連結/`
- Target inbox: `https://threads.net/ap/inbox/`
- Status: `delivered`
- Attempts: `0`

## Interpretation

The prior failure was not WebFinger, actor discovery, profile URL, key
ownership, Cloudflare routing, or gateway health. Threads needed stricter
Follow-response context than the gateway was sending.

After `Accept.object` included the full original `Follow` activity, Threads
accepted the replayed `Accept` deliveries, and the latest public Article
`Create` also delivered to the Threads shared inbox.

## Receiver-Visible Checks

Manual Threads UI readback on 2026-06-04 confirmed:

- Threads opens the remote profile page for `mashbeanmatters@matters.town`.
- The profile shows `mashbeanmatters@matters.town` with the `following` state.
- The profile feed shows delivered posts from the remote actor, including
  `Threads visibility test for Matters Fediverse Gateway:
  matters.town/a/n0w...`.
- Threads displays a beta notice saying users can like posts from other
  servers but cannot reply yet; reply return should therefore be tracked as a
  Threads-side product limitation unless the UI changes.
- The shown remote posts did not expose a single-post permalink or copyable
  Threads URL.
- Threads exact-handle search later found the account on 2026-06-04; see
  `threads-receiver-visible-regression-20260604.md`.

Gateway readback after the Threads Like action confirmed inbound Like return
for the visible `Create(Note)` probe:

- Notification content id:
  `https://matters.town/ap/notes/1780526263869-threads-note-visibility-mashbeanmatters`
- Threads Like activity id:
  `https://threads.net/ap/users/17841401579146452/#likes/869695086184604`
- Remote actor:
  `https://threads.net/ap/users/17841401579146452/`
- `GET /admin/local-notifications?actorHandle=mashbeanmatters&category=like`
  returned the Threads Like notification.
- `GET /admin/local-content?actorHandle=mashbeanmatters&contentId=<note-id>`
  returned `metrics.likes=1` and `actionMatrix.inbound.like=1`.

Mastodon and Misskey remain in the passed baseline. Threads is now split into
specific receiver gates:

- Profile/follow display: passed.
- Feed post display: passed without permalink proof.
- Like return: passed for the visible Note probe.
- Article delivery and ActivityPub dereference: passed gateway-side.
- Account search indexing: passed for exact handle
  `@mashbeanmatters@matters.town`.
- Single-post permalink: unavailable in current Threads UI for this remote
  post.
- Reply return: blocked by current Threads UI notice.

## Article-vs-Note Visibility Probe

The gateway canonical long-form object remains ActivityPub `Article`. Do not
change the main Matters article pipeline just to satisfy one receiver.

To diagnose whether Threads accepts delivery but only renders short-form
`Note` objects in its UI, use the bounded probe script in dry-run mode first:

```bash
cd gateway-core
npm run check:threads-note-visibility -- \
  --config /etc/matters-gateway/staging.instance.json
```

Dry-run mode only validates the accepted Threads follower, builds the public
`Create(Note)` payload, and prints the selected shared inbox. It does not
enqueue or deliver anything.

Sending the probe is a public ActivityPub `Create` to Threads. It must be an
explicit human-approved test and requires both flags:

```bash
cd gateway-core
npm run check:threads-note-visibility -- \
  --config /etc/matters-gateway/staging.instance.json \
  --send \
  --confirm-public-create
```

If the `Note` appears in Threads while the canonical `Article` does not, treat
that as receiver-specific display behavior. The next implementation should be a
documented compatibility projection for Threads delivery, not a replacement of
the canonical Matters `Article` model.

The 2026-06-03 probe delivered a public `Create(Note)` to the accepted Threads
shared inbox with HTTP 200, but the probe was not observed in the Threads
profile, fediverse feed, or exact-text search immediately after delivery. See
`threads-note-visibility-probe-20260603.md`. This means the current
receiver-visible gap is not explained by `Article` vs `Note` alone. A follow-up
Worker fix in PR #95 also made public `matters.town/ap/notes/*` object
dereferencing proxy to `gateway-core`; the probe `Note` URL now returns HTTP
200 publicly instead of the earlier Worker 404.

Follow-up Article routing check: the latest public Article `Create` activity is
publicly dereferenceable, but its embedded `Article.object.id` is still the
ordinary Matters article page URL. Fetching that URL with
`Accept: application/activity+json` follows the main-site path and returns HTML,
not ActivityPub JSON. PR #98 prepared the Worker side by proxying non-demo
`/ap/articles/*` reads to `gateway-core`, while keeping the static demo article
served by the Worker. PR #100 then moved future gateway-origin outbound
`Article` object ids to canonical `/ap/articles/*` URLs while preserving the
Matters article URL in `object.url` so Update/Delete can still target the same
article through the Lambda/sourceUri short URL. The AWS origin was deployed to
commit `fe3d155`. A first canonical Article probe with missing
`published`/`updated`/`mediaType` fields and an injected `atomUri` delivered to
Mastodon and Misskey but stayed pending for Threads with HTTP 500. A full
canonical Article probe with `published`, `updated`, `mediaType: "text/html"`,
canonical `object.id`, and no `atomUri` delivered to Threads. PR #102 then
removed the `atomUri` injection and deployed AWS origin commit `3f2acc8`.
A dry builder check before that final cleanup returned
`objectId=https://matters.town/ap/articles/1228008-test-article`,
`objectUrl=https://matters.town/a/n0wacr6zgyyq`, and
`atomUri=https://matters.town/1228008-test-article/`. Existing already-queued
outbox items keep their old ids; this affects new Create/Update activities.

Post-PR #102 live proof: SSM command
`e647462a-bd45-4898-b54a-b2bccd4b7e93` sent a bounded public Article probe
through the gateway-origin `outbox/create` endpoint using a non-canonical
Matters article-page `id`. The gateway canonicalized it to
`https://matters.town/ap/articles/1228008-threads-article-atomuri-cleanup-20260603T232529Z`,
preserved `https://matters.town/a/n0wacr6zgyyq` as `object.url`, kept
`published`, `updated`, and `mediaType: "text/html"`, and omitted public
`atomUri`. The `Create` activity
`https://matters.town/ap/activities/1780529129484-create-mashbeanmatters`
reported delivered delivery rows for g0v.social, gyutte.site, and Threads.
The public Article object returns HTTP 200 with `application/activity+json`
and `cache-control: no-store`. The delivery job also moved the earlier
missing-fields/atomUri Threads test item to dead-letter after its final
HTTP 500 retry; the live queue then reported `pending=0`, `retryPending=0`,
`delivered=48`, and `deadLetter=1`.
