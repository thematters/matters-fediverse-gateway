# Threads Follow Compatibility Check

Date: 2026-05-28
Status: discovery passes; Follow remains unresolved and non-blocking

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

## What Still Fails

Threads can discover the canonical pilot profile, but the Threads UI Follow
flow still does not complete.

Current interpretation:

- This is not a direct WebFinger, actor, NodeInfo, outbox, Cloudflare WAF, or
  gateway health failure.
- Threads federation remains a beta surface with product-side constraints and
  platform-specific indexing / eligibility behavior.
- The current project should keep Threads as a compatibility track, not a
  launch blocker for the Mastodon / Misskey pilot.

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

These constraints are consistent with the current evidence: Matters' public
ActivityPub surface is reachable, but Threads has not completed the Follow.

## Fixability Assessment

Likely fixable from the Matters side if a concrete failing precondition is
identified:

- missing actor profile field that Threads requires;
- Threads cannot dereference a specific activity, actor, image, or profile URL;
- Threads sends a signed Follow that gateway-core rejects;
- Cloudflare blocks a Threads POST to the inbox;
- Threads requires prior interaction with a federated Threads profile and the
  gateway actor has not performed one.

Not directly fixable from the Matters side without Threads feedback:

- Threads UI suppresses Follow for a beta eligibility rule;
- Threads has a cached stale actor/key state;
- Threads only surfaces certain remote server/software classes;
- Threads accepts discovery but silently blocks Follow for policy or ranking
  reasons.

## Next Practical Tests

1. Use a Threads account with fediverse sharing enabled.
2. Search the exact handle `@mashbeanmatters@matters.town`.
3. If a profile appears but Follow cannot be pressed, record:
   - screenshot;
   - whether the profile has a fediverse icon;
   - whether the UI says unavailable, pending, or no action.
4. From the gateway side, watch for inbound POSTs to
   `https://matters.town/ap/users/mashbeanmatters/inbox`.
5. If no inbound Follow reaches gateway-core, the blocker is upstream in
   Threads UI / eligibility / cache.
6. If a Follow reaches gateway-core and is rejected, inspect the signature and
   actor resolution path.
7. If Threads requires prior interaction, test a bounded gateway-origin
   interaction with a fediverse-enabled Threads actor only after the target
   Threads profile and action are explicitly approved.

## Launch Decision

Threads Follow remains non-blocking.

Mastodon and Misskey already prove the core canonical path:

- discovery;
- follow;
- public Article visibility;
- Misskey reply / like / renote return;
- Mastodon withdrawal;
- gateway queue health;
- SQLite backup and consistency.

Broader rollout should not wait for Threads unless product decides Threads is a
launch-critical distribution channel.
