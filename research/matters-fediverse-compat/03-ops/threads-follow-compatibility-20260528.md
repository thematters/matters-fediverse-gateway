# Threads Follow Compatibility Check

Date: 2026-05-28
Updated: 2026-06-02
Status: discovery passes; Follow now completes after embedded-Follow Accept compatibility fix

## Scope

This records the current state of Threads compatibility for the canonical pilot
actor:

- Account: `acct:mashbeanmatters@matters.town`
- Actor URL: `https://matters.town/ap/users/mashbeanmatters`
- Gateway origin: AWS `gateway-core` behind the narrow Cloudflare Worker
  `/ap/*` routes
- Production backend: still `record_only`; broad outbound delivery remains
  disabled

## What Passed

The current public discovery surface passes:

- WebFinger returns `subject=acct:mashbeanmatters@matters.town`.
- WebFinger advertises the ActivityPub actor self link.
- Actor document returns `type=Person`, canonical `id`, `inbox`, `outbox`,
  `followers`, `following`, and matching `publicKey.owner`.
- Outbox and NodeInfo return 200.
- Default, `facebookexternalua`, `facebookexternalhit`, and
  `meta-externalagent` probes all pass without Cloudflare challenge.

Latest diagnostic:

```bash
node scripts/run-threads-discovery-diagnostics.mjs \
  --base-url https://matters.town \
  --canonical-domain matters.town \
  --canonical-base-url https://matters.town \
  --actor-path-prefix /ap
```

Result: `ok=true`, no failures, no warnings.

Archived report:

- `research/matters-fediverse-compat/03-ops/threads-discovery-live-20260528.json`

## 2026-06-02 Follow Update

Threads can discover the canonical pilot profile, send signed Follow activities
to gateway-core, and receive delivered Accept responses after PR #90.

The failure mode changed:

- Before PR #90, Threads Follow reached gateway-core, but outbound Accept
  delivery to Threads returned HTTP 500.
- PR #90 changed Follow responses so `Accept.object` / `Reject.object` embed
  the original Follow object when available.
- Existing pending Threads Accept queue items were replayed with the embedded
  Follow object and all delivered.
- The latest public Article Create also delivered to the Threads shared inbox.

Updated evidence:

- `research/matters-fediverse-compat/03-ops/threads-follow-and-delivery-regression-20260602.md`

Remaining work is receiver-visible UI validation: confirm the follow state,
Article visibility, reply return, and like return from Threads.

## External Context

Relevant public Threads federation notes:

- Meta's 2025 update says Threads users who turn on fediverse sharing can
  search for fediverse users directly and view posts from followed federated
  accounts in a dedicated feed:
  `https://about.fb.com/news/2025/06/its-now-easier-see-more-fediverse-content-threads/`
- Earlier 2024 coverage of Threads following external fediverse accounts
  described limitations: users needed fediverse sharing enabled, and early
  discovery/follow paths were tied to accounts that had already interacted
  with Threads federated profiles:
  `https://techcrunch.com/2024/12/04/threads-users-can-now-follow-profiles-from-other-fediverse-servers/`
- Engadget's 2024 report also noted that Threads' fediverse support remained
  beta and that some posts from other servers might not be visible:
  `https://www.engadget.com/social-media/threads-now-allows-users-to-follow-accounts-from-mastodon-and-other-fediverse-services-directly-in-threads-183517197.html/`

These constraints were useful during debugging, but the current evidence shows
the concrete gateway-side incompatibility was the Follow response object shape.
Threads accepted the replayed Accept once the full Follow object was embedded.

## Fixability Assessment

The concrete gateway-side Follow blocker was fixed from the Matters side:

- signed Threads Follow reaches gateway-core;
- remote actor/key discovery succeeds;
- gateway-core accepts the follower;
- outbound Accept delivers when it embeds the full Follow object;
- latest public Article Create delivers to Threads shared inbox.

Still not directly verifiable from gateway logs alone:

- whether Threads UI surfaces the delivered Article immediately;
- whether Threads replies / likes are returned to gateway-core;
- whether Threads caches stale remote Article state.

## Next Practical Tests

1. Confirm Threads UI follow state is no longer pending.
2. Confirm the latest delivered public Article appears in Threads.
3. Reply to the Article from Threads and check gateway-core inbound traces.
4. Like the Article from Threads and check gateway-core inbound traces.
5. If either interaction does not return, inspect inbound POST traces before
   changing payload shape.

## Launch Decision

Threads Follow is no longer a gateway-side blocker.

Mastodon and Misskey already prove the core canonical path:

- discovery;
- follow;
- public Article visibility;
- Misskey reply / like / renote return;
- Mastodon withdrawal;
- gateway queue health;
- SQLite backup and consistency.

Broader rollout still should not depend solely on Threads until receiver-visible
Article, reply, and like checks pass. Mastodon and Misskey remain the primary
passed interop baseline.
