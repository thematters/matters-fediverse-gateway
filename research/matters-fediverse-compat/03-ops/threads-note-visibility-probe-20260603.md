# Threads Note Visibility Probe

Date: 2026-06-03
Status: gateway-side delivery passed; receiver-visible Threads UI display not
observed

## Scope

This probe checks whether Threads accepts a public ActivityPub `Create` whose
object is `Note`, after the canonical `Article` delivery was accepted but not
visible in the Threads UI.

This is a receiver-compatibility diagnosis only. It does not change the
canonical Matters long-form model, which remains ActivityPub `Article`.

## Target

- Local actor: `acct:mashbeanmatters@matters.town`
- Local actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Threads actor: `https://threads.net/ap/users/17841401579146452/`
- Threads selected inbox: `https://threads.net/ap/inbox/`
- Linked Matters article: `https://matters.town/a/n0wacr6zgyyq`

## Activity

- Activity id:
  `https://matters.town/ap/activities/1780458898924-threads-note-visibility-mashbeanmatters`
- Object id:
  `https://matters.town/ap/notes/1780458898924-threads-note-visibility-mashbeanmatters`
- Object type: `Note`
- Content:
  `Threads visibility test for Matters Fediverse Gateway: https://matters.town/a/n0wacr6zgyyq`

## Delivery Result

The probe was sent from the AWS gateway-core origin through:

```bash
cd /opt/matters-gateway/repo/gateway-core
npm run check:threads-note-visibility -- \
  --config /etc/matters-gateway/staging.instance.json \
  --send \
  --confirm-public-create
```

Result:

- dryRun: `false`
- queue item status: `delivered`
- attempts: `0`
- lastStatusCode: `200`
- targetInbox: `https://threads.net/ap/inbox/`

## Receiver-Visible Readback

Manual browser readback was attempted through Threads web UI:

- `https://www.threads.com/fediverse_profile/@mashbeanmatters@matters.town`
- `https://www.threads.com/fediverse_feed/`
- `https://www.threads.com/search?q=Threads%20visibility%20test%20for%20Matters%20Fediverse%20Gateway`

Observed result:

- The fediverse feed still showed older g0v.social content, not the Matters
  probe.
- The direct fediverse profile tab remained blank in Safari during the check.
- Search for the exact probe text returned unrelated fediverse / Threads
  results, not the Matters probe.

## Interpretation

The gateway can deliver both canonical `Article` and probe `Note` activities to
Threads with successful HTTP responses. The `Note` probe did not immediately
appear in Threads UI, so the current failure is not explained by `Article` vs
`Note` alone.

Follow-up routing check: immediately after the probe, the AWS
`gateway-core-origin` could dereference both the `Create` activity and embedded
`Note` object, but the public `matters.town/ap/notes/*` route returned 404
because the Cloudflare Worker only proxied `/ap/activities/*` to `gateway-core`.
PR #95 added the narrow `/ap/notes/*` proxy route and was deployed to
Cloudflare Worker version `14739dc4-4405-431a-a44c-c351b132e7b0`. After
deployment, the public object URL returned HTTP 200 with `type: "Note"` and
`cache-control: no-store`.

Keep the next investigation focused on Threads receiver behavior:

- delayed remote-post indexing or feed refresh behavior;
- whether Threads had already cached the earlier public 404 for the `Note`
  object;
- whether Threads only displays inbound posts from a narrower set of supported
  remote software profiles;
- whether Threads requires additional object or actor fields beyond successful
  ActivityPub inbox delivery;
- whether reply/like return can be tested only after a Threads-visible object
  exists.

Do not replace canonical Matters `Article` delivery with `Note` delivery based
on this probe.
