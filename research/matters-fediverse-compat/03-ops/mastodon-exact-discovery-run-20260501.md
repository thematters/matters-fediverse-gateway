# Mastodon Exact Discovery Run 2026-05-01

## Summary

We tested exact Mastodon discovery for the Cloudflare Worker ActivityPub surface after moving the demo onto Matters-controlled domains.

The Worker endpoints are live and internally consistent, but `mastodon.social` did not return an exact remote account for the tested handles. No follow was attempted because discovery did not produce a Mastodon account id.

## Runtime Context

- Mastodon instance: `https://mastodon.social`
- Mastodon version observed in web UI: `4.6.0-nightly.2026-04-30`
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

The current blocker is not basic WebFinger or actor endpoint availability. The live Worker surface is reachable, returns the expected ActivityPub content types, and passes the source-level checks Mastodon performs before account processing.

The remaining issue is on the Mastodon.social exact discovery path: either the account processing failed after the initial fetch and Mastodon retained a short-lived negative state, or the current Mastodon.social search/interaction path is not consistently invoking remote resolve for these queries. Because there is no admin access to Mastodon.social logs, the exact server-side rejection point is not observable from this client-side run.

## Next Checks

1. Retry exact discovery after Mastodon.social negative caches expire.
2. Run the same endpoint against a second Mastodon-compatible instance to separate Mastodon.social-specific state from protocol compatibility.
3. If a controlled Mastodon test instance is available, inspect server logs around `ResolveAccountService`, `FetchRemoteActorService`, and `ProcessAccountService`.
4. Only attempt the follow step after search or lookup returns a concrete remote account id.
