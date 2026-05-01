# Mastodon Exact Discovery Run 2026-05-01

## Summary

We tested exact Mastodon discovery for the Cloudflare Worker ActivityPub surface after moving the demo onto Matters-controlled domains.

`g0v.social` successfully resolved the Worker actors, including the canonical `acct:matters@matters.town` actor. After explicit action-time confirmation, the tester account followed the canonical actor from the g0v.social web UI, and Cloudflare tail confirmed an inbound POST to the canonical actor inbox. `mastodon.social` did not return an exact remote account for the same surface during this run.

## Runtime Context

- Mastodon instance: `https://mastodon.social`
- Mastodon version observed in web UI: `4.6.0-nightly.2026-04-30`
- Secondary Mastodon instance: `https://g0v.social`
- Secondary Mastodon version observed in web UI: `4.5.9`
- Canonical actor: `acct:matters@matters.town`
- Diagnostic actor on canonical domain: `acct:mattersprobe02@matters.town`
- Diagnostic actor on isolated Worker custom domain: `acct:mattersprobe02@gateway-probe.matters.town`
- Worker deployment version after hardening: `6c0adfb1-974e-429a-95d8-1bd016aae94e`

## Worker Surface Verified

- `https://matters.town/.well-known/webfinger?resource=acct:mattersprobe02@matters.town`
- `https://matters.town/ap/users/mattersprobe02`
- `https://matters.town/ap/users/mattersprobe02/inbox`
- `https://gateway-probe.matters.town/.well-known/webfinger?resource=acct:mattersprobe02@gateway-probe.matters.town`
- `https://gateway-probe.matters.town/users/mattersprobe02`

The live actor JSON was hardened to match a minimal Mastodon-compatible shape:

- `@context`: ActivityStreams + security only
- `type`: `Person`
- no SVG `icon`
- no actor-level FEP `webfinger` extension
- `preferredUsername`, `inbox`, `outbox`, `followers`, `following`, `publicKey`, and `sharedInbox` present
- `Cache-Control: no-store` on Worker responses during interoperability testing

## Mastodon Results

### g0v.social

Authenticated web UI checks:

- `@mattersprobe02@gateway-probe.matters.town`: exact profile result returned as `Matters Interop`
- `@mattersprobe02@matters.town`: exact profile result returned as `Matters Interop`
- `@matters@matters.town`: exact profile result returned as `Matters`

Cloudflare tail showed `g0v.social` fetching the expected gateway resources:

- `/.well-known/webfinger`
- actor document
- actor outbox
- actor following collection
- actor followers collection

After explicit tester confirmation, the `@matters@matters.town` result was followed from the g0v.social web UI. The UI changed from `Follow` to `Unfollow`, and Cloudflare tail observed the delivery:

- `POST https://matters.town/ap/users/matters/inbox - Ok @ 2026-04-30 21:49:26 EDT`

This confirms that the hardened Worker ActivityPub surface can be discovered, ingested, and addressed by Mastodon 4.5.9 for inbound follow delivery. It does not yet prove a production-complete follow relationship because the current Worker edge demo accepts the inbox POST at the edge and does not yet run the full `gateway-core` signed inbox processing and outbound `Accept` response.

### mastodon.social

Authenticated API checks:

- `GET /api/v1/accounts/verify_credentials`: token valid, account resolved as `mashbean`
- `GET /api/v2/search?q=@matters@matters.town&type=accounts&resolve=true`: no exact account
- `GET /api/v2/search?q=@mattersprobe02@matters.town&type=accounts&resolve=true`: no exact account
- `GET /api/v2/search?q=@mattersprobe02@gateway-probe.matters.town&type=accounts&resolve=true`: no exact account
- `GET /api/v1/accounts/lookup?acct=mattersprobe02@gateway-probe.matters.town`: `404 Record not found`

Web UI check:

- `https://mastodon.social/search?q=%40mattersprobe01%40matters.town`: `No results`
- `https://mastodon.social/authorize_interaction?uri=https%3A%2F%2Fgateway-probe.matters.town%2Fusers%2Fmattersprobe02`: Mastodon 404

Cloudflare tail confirmed our own endpoint probes. Earlier in the run, Mastodon fetched the canonical `matters@matters.town` WebFinger, actor, and outbox once, but the account was not persisted or returned by search. After that, fresh diagnostic search attempts did not produce new Worker hits, including on `gateway-probe.matters.town`.

## Interpretation

The current blocker is not basic WebFinger or actor endpoint availability. The live Worker surface is reachable, returns the expected ActivityPub content types, passes the source-level checks Mastodon performs before account processing, and is successfully ingested by `g0v.social`.

The remaining issue is specific to the `mastodon.social` exact discovery path: either the account processing failed after the initial fetch and Mastodon retained a short-lived negative state, or the current Mastodon.social nightly search/interaction path is not consistently invoking remote resolve for these queries. Because there is no admin access to Mastodon.social logs, the exact server-side rejection point is not observable from this client-side run.

## Next Checks

1. Wire the canonical Worker inbox route to `gateway-core` signed inbox handling so an inbound Follow can be verified, persisted, and answered with `Accept`.
2. Retry exact discovery on `mastodon.social` after negative caches expire.
3. Run the same endpoint against one additional Mastodon-compatible instance to broaden evidence beyond `g0v.social`.
4. If a controlled Mastodon test instance is available, inspect server logs around `ResolveAccountService`, `FetchRemoteActorService`, and `ProcessAccountService`.
