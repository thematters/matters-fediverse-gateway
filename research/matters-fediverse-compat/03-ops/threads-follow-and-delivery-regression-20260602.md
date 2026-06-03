# Threads Follow And Delivery Regression

Date: 2026-06-02
Status: gateway-side pass; receiver-visible UI readback still needs manual confirmation

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

## Remaining Receiver-Visible Checks

These checks require the Threads UI or a receiving account view:

1. Confirm the Threads UI shows `mashbeanmatters@matters.town` as followed
   rather than requested.
2. Confirm the delivered public Article is visible in Threads.
3. Reply to the federated Article from Threads and confirm `gateway-core`
   records an inbound public reply.
4. Like the federated Article from Threads and confirm `gateway-core` records
   an inbound like.

Mastodon and Misskey should remain in the passed baseline while these Threads
checks continue.

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
