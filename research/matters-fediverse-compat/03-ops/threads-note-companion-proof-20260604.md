# Threads Note Companion Proof

Date: 2026-06-04
Status: bounded gateway-side delivery passed

## Scope

This records the bounded production pilot proof for the disabled-by-default
Threads `Note` companion adapter.

The canonical Matters object remains ActivityPub `Article`. The companion
adapter creates an additional short-form `Note` only for configured pilot
actors and configured receiver domains. This proof used the approved pilot
actor `acct:mashbeanmatters@matters.town` and the accepted Threads follower.

## Configuration

The AWS gateway-core origin was deployed from `main` after PR #108:

- PR: `https://github.com/thematters/matters-fediverse-gateway/pull/108`
- Deployed commit: `641ee10`
- SSM deploy command id: `ab74cd32-886b-45b0-a825-d54664189889`
- Gateway health after deploy: `ok=true`
- Public Worker health after deploy: `ok=true`

Live compatibility config:

```json
{
  "compatibility": {
    "noteCompanion": {
      "enabled": true,
      "actorAllowlist": ["mashbeanmatters"],
      "receiverDomainAllowlist": ["threads.net"],
      "maxSummaryChars": 240
    }
  }
}
```

## Failed First Attempt

The first companion attempt delivered the main `Article` to Mastodon, Misskey,
and Threads, but the companion `Note` failed at Threads with HTTP 500:

- Main activity:
  `https://matters.town/ap/activities/1780588198093-create-mashbeanmatters`
- Companion activity:
  `https://matters.town/ap/activities/1780588199379-create-note-companion-mashbeanmatters`
- Companion object:
  `https://matters.town/ap/notes/ap-articles-1228008-threads-note-companion-proof-20260604T154957Z-note-companion`
- Threads delivery status: `retryPending`
- Last error: `Delivery failed with status 500`

The failed companion object used richer Article-derived fields and HTML
content. PR #108 changed the companion payload to match the earlier successful
Threads `Note` visibility probe more closely:

- plain-text `content`;
- `published` timestamp;
- no `name`;
- no `summary`;
- Activity/object `cc` limited to the local followers collection.

## Successful Proof

A second bounded proof was sent through the gateway-core origin after PR #108
was merged and deployed.

- Endpoint:
  `https://gateway-core-origin.matters.town/users/mashbeanmatters/outbox/create`
- Main activity:
  `https://matters.town/ap/activities/1780588587140-create-mashbeanmatters`
- Companion activity:
  `https://matters.town/ap/activities/1780588588874-create-note-companion-mashbeanmatters`
- Companion object:
  `https://matters.town/ap/notes/ap-articles-threads-note-companion-proof-20260604T155626Z-note-companion`
- Linked Matters article:
  `https://matters.town/a/3tmz0u0a42qx`

Delivery results:

| Target | Main Article | Companion Note |
| --- | --- | --- |
| g0v.social / Mastodon | delivered | not selected |
| gyutte.site / Misskey | delivered | not selected |
| Threads | delivered | delivered |

Public dereference checks after delivery:

- The companion `Create` activity returned ActivityPub JSON through
  `matters.town`.
- The companion `Note` object returned ActivityPub JSON through `matters.town`.
- The companion `Note` is plain text, has `published`, and does not include
  `name` or `summary`.

The outbound queue still contained the prior failed companion retry item and
one older dead-letter item from an earlier bad test payload. No new stuck item
was created by the successful proof.

## Interpretation

Gateway-side Threads delivery now passes for both:

- canonical public `Article` delivery; and
- receiver-scoped companion `Note` delivery.

This does not close all Threads receiver-visible gates. The remaining Threads
checks are:

- whether the new companion post appears consistently in the Threads profile or
  fediverse feed;
- whether Threads search indexes `mashbeanmatters@matters.town`;
- whether Threads exposes a single-post permalink for remote ActivityPub
  posts;
- whether reply return becomes possible after Threads enables remote replies in
  its UI.

Do not enable broad production outbound based only on this proof. Keep the
adapter pilot-scoped and receiver-scoped until receiver-visible regression is
complete.
