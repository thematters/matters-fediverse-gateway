# Canonical Identity Cutover Plan

Date: 2026-06-02
Status: canonical pilot identity and Mastodon/Misskey/Threads follow proof complete; production outbound delivery remains gated

This note plans the cutover from the staging test account
`acct:mashbeanmatters@staging-gateway.matters.town` to the canonical Matters
identity `acct:mashbeanmatters@matters.town`.

## Current State

- Staging identity remains available as
  `acct:mashbeanmatters@staging-gateway.matters.town` for historical staging
  evidence, but the current pilot identity is
  `acct:mashbeanmatters@matters.town`.
- The staging gateway has passed WebFinger, actor, outbox, NodeInfo,
  Mastodon/Misskey delivery, Mastodon read-back, bounded Delete, and scheduled
  inbound reconciliation checks.
- The canonical `matters.town` Worker surface now includes the pilot handle
  `mashbeanmatters` through `CANONICAL_PILOT_HANDLES`.
- Worker deploy `c48024e3-c249-4402-824b-7d199ace5a7f` exposed the canonical
  read surface for WebFinger, actor, NodeInfo, and `/ap/*` paths only.
- Cloudflare custom rule `skip-fediverse-meta-crawlers` now lets
  `facebookexternalua`, `facebookexternalhit`, and `meta-externalagent` reach
  the narrow staging and canonical federation paths.
- Live probes for `acct:mashbeanmatters@matters.town` now return `200` for
  default and Meta-style user agents.
- Threads can now discover the canonical profile, signed Follow reaches
  gateway-core, embedded-Follow Accept delivery succeeds, and the Threads UI
  shows the canonical profile as followed. The remaining Threads checks are
  receiver-visible Article display plus reply / like return. See
  `research/matters-fediverse-compat/03-ops/threads-follow-and-delivery-regression-20260602.md`.
- Read-only remote discovery works from g0v.social Mastodon and gyutte.site
  Misskey for `mashbeanmatters@matters.town`; visible follow proof now also
  converges on both platforms.
- Worker deploy `b002f589-f9d3-4cf3-b389-0e137e36efc9` added live follow
  readiness reporting. The current `https://matters.town/ap/healthz` path now
  reports the AWS `gateway-core` origin through the Worker proxy with
  persistent inbox state and `followReadiness=ready`.
- Worker deploy `7f9077c0-5dc8-4164-8793-83d437508758` fixed canonical
  proxy pathing so future `/ap/users/<handle>/inbox` requests are forwarded to
  gateway-core as `/users/<handle>/inbox`.
- Worker deploy `7096c2e3-4e03-4133-9b0d-3ac7547be482` added an origin health
  contract. Future follow readiness will remain blocked unless
  `GATEWAY_CORE_ORIGIN/healthz` returns `component=gateway-core`.
- This cutover did not change production DNS, production backend settings,
  production delivery, or formal Matters article/user data.
- Misskey initially kept the canonical follow pending because gyutte.site had
  cached the earlier Worker demo actor key under `#main-key`. The staging
  gateway actor now uses key id
  `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517`,
  after which gyutte.site remote-user refresh plus cancel/re-follow converged
  to `isFollowing=true`.
- A canonical pilot Article was delivered to g0v.social and gyutte.site.
  Mastodon and Misskey readback both found it. Misskey reply, reaction/like,
  and renote returned to gateway-core and were persisted. Mastodon interaction
  return still needs a write-scoped token or browser-based manual action.
- Product approval now allows production preparation for `mashbean` in
  record-only / observation mode. Full outbound delivery remains disabled.

## Identity Contract

The cutover should expose exactly one primary public ActivityPub identity for
the pilot author.

| Field | Planned value |
| --- | --- |
| WebFinger subject | `acct:mashbeanmatters@matters.town` |
| Primary actor id | `https://matters.town/ap/users/mashbeanmatters` |
| Human profile alias | `https://matters.town/@mashbeanmatters` |
| Inbox | `https://matters.town/ap/users/mashbeanmatters/inbox` |
| Outbox | `https://matters.town/ap/users/mashbeanmatters/outbox` |
| Followers | `https://matters.town/ap/users/mashbeanmatters/followers` |
| Following | `https://matters.town/ap/users/mashbeanmatters/following` |
| Public key id | `https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517` for the current staging pilot; production should use a fresh, versioned gateway-core key id instead of reusing the old Worker demo `#main-key` |

Use the `/ap/users/<handle>` actor path for the first cutover because the
current `matters.town` Worker route already owns the narrow `/ap/*` namespace.
Keep `https://matters.town/@mashbeanmatters` and the old staging actor as
aliases or historical references only. Do not expose two followable primary
actors for the same author.

## Cutover Phases

1. **Planning and read-only diagnostics**
   - Keep using staging for real delivery.
   - Run `npm run check:threads-discovery` against staging.
   - Run the same diagnostic with `--canonical-base-url https://matters.town`
     and expect failure until the canonical route is intentionally opened.

2. **Implementation PR**
   - Add explicit pilot handle support for `mashbeanmatters` on the
     `matters.town` Worker surface through `CANONICAL_PILOT_HANDLES`.
   - Preserve demo handles while avoiding catch-all account discovery.
   - Add config-driven handle allowlisting before adding more authors.
   - Status: completed and merged.

3. **Record-only canonical read surface**
   - Enable canonical WebFinger, actor, outbox, NodeInfo, and public key reads
     for the pilot handle.
   - Keep production outbound `Create`, `Update`, and `Delete` disabled.
   - Keep Matters backend trigger mode in audit-only or disabled state for
     production until rollout approval.
   - Status: deployed for the pilot handle; outbound delivery remains disabled.

4. **Discovery smoke test**
   - Verify WebFinger returns 200 for default, `facebookexternalua`,
     `facebookexternalhit`, and `meta-externalagent` user agents.
   - Verify actor JSON has `id`, `inbox`, `outbox`, `followers`, and
     `publicKey.owner` matching the canonical actor id.
   - Search `mashbeanmatters@matters.town` from Mastodon and Misskey.
   - Search from Threads after the canonical surface is visible and no longer
     challenged by Cloudflare.
   - Status: machine probes pass; Mastodon, Misskey, and Threads discovery and
     follow proof pass. Threads receiver-visible Article display and
     interaction return are still open compatibility checks.

5. **Staging follower boundary**
   - Treat existing `staging-gateway.matters.town` followers as test-only.
   - Do not attempt automatic cross-instance follower migration for staging
     followers.
   - Keep staging identity reachable for diagnostics, but stop describing it as
     the production identity.

6. **Production delivery cutover**
   - Enable production outbound delivery only after legal/privacy, rollback,
     key owner, storage, monitoring, and launch-owner approvals are recorded.
   - First production delivery should be a small pilot Create/Update sequence
     with queue, dead-letter, read-back, and remote UI checks.

7. **Canonical follow proof**
   - Status: completed for g0v.social Mastodon and gyutte.site Misskey.
   - Keep `npm run check:follow-readiness -- --base-url https://matters.town --handle mashbeanmatters`
     as the preflight before any future canonical follow retest.
   - If remote instances cache old actor key material, use a fresh versioned
     key id and refresh or recreate the remote follow instead of reusing
     `#main-key`.

8. **Production record-only pilot**
   - Start with author `mashbean` only.
   - Keep production trigger behavior record-only / observation before any real
     public delivery.
   - Preserve queue, trace, SQLite, Lambda, and S3 audit evidence for the pilot.
   - Do not expand to all authors until legal/privacy, rollback, and launch
     gates are closed.

## Cloudflare Requirements

- The canonical WebFinger route must allow
  `/.well-known/webfinger?resource=acct:mashbeanmatters@matters.town`.
- `CANONICAL_PILOT_HANDLES` remains unset in the repo default and was set
  explicitly during deployment for `mashbeanmatters`.
- The canonical actor, outbox, inbox, followers, and following routes must pass
  through without conflicting with the existing Matters application.
- Cloudflare cache and WAF rules must not challenge WebFinger, actor, outbox,
  NodeInfo, or public Article reads for known federation crawlers, including
  Meta crawler user agents.
- Do not bypass protection for admin or webhook routes.
- Keep route changes narrow to `/.well-known/*`, `/nodeinfo/*`, and `/ap/*`.
- Do not treat Worker `edge-demo` inbox 202 responses as production follow
  success. Production follow proof requires `GATEWAY_CORE_ORIGIN` and
  `followReadiness=ready`.

## Main-Site Impact Assessment

Merging the implementation PR should not affect the Matters main site by
itself. The pilot handle is closed unless `CANONICAL_PILOT_HANDLES` is set
during a Worker deployment.

The approved production change should remain low-risk if Cloudflare changes
stay inside these boundaries:

- Route only `matters.town/.well-known/webfinger*`,
  `matters.town/.well-known/host-meta`, `matters.town/.well-known/nodeinfo`,
  `matters.town/nodeinfo/*`, and `matters.town/ap/*` to the Worker.
- Do not route `matters.town/`, article pages, user profile pages, GraphQL,
  auth, payment, or editor paths to the Worker.
- Apply cache/WAF bypass only to public federation discovery and ActivityPub
  paths. Do not disable WAF or cache globally for `matters.town`.
- Do not apply this rule to `server.matters.town`, `matters.icu`, or other
  backend/admin hostnames.
- Keep WebFinger and actor responses `no-store` or explicitly cache-bounded for
  federation compatibility.

The main risk is not the Worker code path; it is an overly broad Cloudflare
route, cache rule, or WAF skip rule. If the rule accidentally matches ordinary
main-site pages, it could bypass protection or change caching for the main app.
The rollout should therefore be reviewed as Cloudflare rule scope first, then
ActivityPub behavior second.

## Verification Checklist

- `npm run check:threads-discovery` passes against the canonical
  `matters.town` pilot surface.
- `npm run check:threads-discovery -- --base-url https://staging-gateway.matters.town --canonical-base-url https://matters.town`
  remains available when comparing the old staging surface with canonical
  WebFinger.
- `curl https://matters.town/.well-known/webfinger?resource=acct:mashbeanmatters@matters.town`
  returns `200`, subject `acct:mashbeanmatters@matters.town`, profile-page
  `https://matters.town/@mashbeanmatters`, and self
  `https://matters.town/ap/users/mashbeanmatters`.
- The same WebFinger URL returns `200` for `facebookexternalua`,
  `facebookexternalhit`, and `meta-externalagent`.
- `https://matters.town/ap/users/mashbeanmatters` returns a `Person` whose
  actor id, inbox, outbox, followers, following, and public key owner all use
  the canonical `matters.town` actor path.
- Mastodon resolves `mashbeanmatters@matters.town` through read-only API.
- Misskey resolves `mashbeanmatters@matters.town` through read-only API.
- Mastodon and Misskey canonical follow proof should show persistent state:
  Mastodon writes an accepted SQLite follower row on the gateway side, and
  gyutte.site Misskey `users/relation` returns `isFollowing=true`.
- A canonical pilot Article is visible on Mastodon and Misskey.
- Misskey reply / like / renote interactions return to gateway-core and
  persist in SQLite.
- Mastodon interaction return is pending a write-scoped token or browser
  action; the current read-only token is enough only for visibility checks.
- When moving from Worker demo to gateway-core for an existing actor id, do not
  reuse the same public key id with different key material. Use a new key id
  fragment and refresh or recreate the remote follow if an instance has cached
  the demo key.
- `npm run check:follow-readiness -- --base-url https://matters.town --handle mashbeanmatters`
  returns `ok: true` before any canonical follow proof is attempted.
- Threads can discover the canonical pilot profile and Follow now completes
  after embedded-Follow Accept delivery. Record Threads Article visibility and
  interaction return separately from gateway-side Follow/delivery health.
- SQLite consistency scan returns `totalDiffs=0`.
- Delivery queue returns to zero pending and zero dead letters after the first
  approved pilot delivery.

## Rollback Strategy

Before public discovery:

- Remove or disable the pilot handle from the canonical Worker allowlist.
- Keep staging gateway untouched.
- Re-run the canonical diagnostic and confirm it fails closed.

After public discovery but before outbound delivery:

- Keep canonical WebFinger and actor reads stable to avoid identity churn.
- Pause outbound delivery and disable new follows if needed.
- Preserve audit evidence and explain that the pilot identity is paused.

After outbound delivery:

- Do not delete the canonical actor or rotate the actor id as the first move.
- Disable author opt-in or production trigger.
- Stop delivery workers.
- Keep actor reads and public key available while investigating.
- Use the legal takedown or key-rotation runbook only if the incident requires
  content withdrawal or key replacement.

## Human Approval Gates

- CTO / infra approves any `matters.town` Worker route or WAF/cache change.
- Product approves first pilot handle and user-facing wording.
- Security approves key owner, backup, and rotation path.
- Legal / policy approves privacy notice and takedown handling.
- Launch owner approves the first production outbound `Create`, `Update`, or
  `Delete`.

## Next Engineering Step

Prepare production record-only / observation for the `mashbean` pilot author,
keep canonical identity stable, and continue Threads receiver-visible Article
plus Mastodon write-scope interaction checks as compatibility work. For Threads,
the next useful test is a bounded Article-vs-Note visibility diagnosis after
gateway-core confirms Article delivery to the accepted Threads follower. Do not
enable production full outbound delivery until the remaining production gates
are closed and launch approval is recorded.
