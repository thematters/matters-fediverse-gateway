# Misskey Public Run: zeckagent3 Real Lambda Bundle

Date: 2026-05-11
Environment: staging only

## Scope

This run verified the G2-A real-data path after `matters-server` PR #4761, `ipns-site-generator` PR #161, and `lambda-handlers` PR #223 were merged:

```text
matters.icu public rows
-> federation-export-dev
-> ipns-site-generator ActivityPub bundle
-> gateway-core staging runtime
-> gyutte.site Misskey
```

This was not a production rollout. It did not enable canonical `acct:user@matters.town` identity, production storage, or production export triggers.

## Lambda Result

- Workflow: `thematters/lambda-handlers` `Invoke Federation Export Staging`
- Run: `25653127777`
- Artifact: `6911326525`
- Inputs: `ej8tf2513uky,zne4qktk3xk0`
- Status: `200`
- Decision report:
  - Article `23520`: `eligible`
  - Article `23522`: `article_not_public`
- Actor: `zeckagent3@staging-gateway.matters.town`
- Generated files:
  - `.well-known/webfinger`
  - `about.jsonld`
  - `activitypub-manifest.json`
  - `feed.json`
  - `index.html`
  - `outbox.jsonld`
  - `rss.xml`

## Gateway Probe

- Local `gateway-core` config: `runtime/matters-icu-staging-real-lambda/gateway.instance.json`
- WebFinger: `acct:zeckagent3@staging-gateway.matters.town`
- Actor ID: `https://staging-gateway.matters.town/users/zeckagent3`
- Actor type: `Person`
- Outbox item count: `1`
- Article URL: `https://staging-gateway.matters.town/23520-最好的零件就是沒有零件-減法工程如何殺死你的競爭對手/`

## Misskey Result

- Misskey instance: `https://gyutte.site`
- Resolve method: `users/show-after-ap-show-error`
- Resolved account: `zeckagent3@staging-gateway.matters.town`
- Follow state: gateway followers collection includes `https://gyutte.site/users/819de678273e9b120fd654b5`
- Gateway create response:
  - Status: `queued`
  - Activity: `https://staging-gateway.matters.town/activities/1778479882528-create-zeckagent3`
  - Recipient count: `1`
  - Delivery status: `delivered`
- Misskey `users/notes` matched:
  - Note ID: `819d8a6b182f18bedac48cec`
  - URI: `https://staging-gateway.matters.town/23520-最好的零件就是沒有零件-減法工程如何殺死你的競爭對手/`
  - Created at: `2026-04-14T05:16:07.599Z`

## Notes

- Cloudflare briefly served a stale cached 404 for the exact WebFinger query after the actor switch. A cache-busting query confirmed the public route was healthy. The available Wrangler OAuth token did not have cache-purge permission, so cache purge was not performed.
- The staging gateway was switched from the earlier `charlesmungerai` bundle to the real deployed-Lambda `zeckagent3` bundle for this run.
