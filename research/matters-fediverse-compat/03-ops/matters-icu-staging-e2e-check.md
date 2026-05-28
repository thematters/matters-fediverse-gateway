# matters.icu Staging E2E Check

Date: 2026-05-11
Status: server, web, generator, and lambda staging pieces are merged to their develop/main tracks; `matters.icu` server/web develop deploys passed; `federation-export-dev` is updated to `lambda-handlers` `v0.14.1`; real deployed-Lambda staging bundles have passed gateway, NodeInfo, SQLite consistency, and Misskey verification. G2-B pilot API and browser UI validation passed for `mashbean@matters.town`; production remains disabled.

## Goal

Run one bounded staging pass from real selected public Matters article IDs to a staging Fediverse actor:

```text
matters.icu selected public article IDs
-> federation-export-dev Lambda
-> generated ActivityPub seed bundle
-> gateway-core staging config
-> WebFinger / actor / outbox / NodeInfo probe
-> SQLite consistency scan
-> optional Misskey delivery or read-only check
```

This check is not a production rollout. It does not mutate production data, enable federation for all users, or publish canonical `acct:user@matters.town` identities.

## Prerequisites

- `ipns-site-generator` PR #161 merged to `main`.
- `matters-server` PR #4761 merged to `develop` and deployed to `matters.icu`.
- `lambda-handlers` PR #223 merged, so generated bundles contain only one canonical `activitypub-manifest.json`.
- `lambda-handlers` image tag `v0.14.1` is available in ECR and deployed to `federation-export-dev`.
- `federation-export-dev` exists. If it does not, run the `Provision Federation Export Dev Lambda` workflow in `thematters/lambda-handlers`.
- Staging gateway host is available, normally `https://staging-gateway.matters.town`.
- Staging gateway private/public key files exist locally and are not committed.

## Recommended Command

From `gateway-core`:

```bash
node scripts/run-matters-icu-staging-check.mjs \
  --article-id 1182465 \
  --article-id 1181808 \
  --article-id 1181797 \
  --site-domain matters.icu \
  --webf-domain staging-gateway.matters.town \
  --lambda-function federation-export-dev \
  --gateway-url https://staging-gateway.matters.town
```

For the first pass, do not use `--enforce-federation-gate` unless staging has explicit federation setting rows for the pilot author and articles. Without that flag, the check verifies the current public-only export boundary.

## Outputs

The script writes:

```text
gateway-core/runtime/matters-icu-staging/
  bundle/
    index.html
    rss.xml
    feed.json
    .well-known/webfinger
    about.jsonld
    outbox.jsonld
    activitypub-manifest.json
  gateway.instance.json
  staging-check-report.json
```

`gateway.instance.json` can be used to start `gateway-core` against the generated bundle:

```bash
node src/server.mjs --config ./runtime/matters-icu-staging/gateway.instance.json
```

## Pass Criteria

- Lambda returns a 2xx response.
- The returned bundle contains file contents, not only S3 keys.
- `activitypub-manifest.json` declares `version: 1`.
- `visibility.federatedPublicOnly` is `true`.
- Every manifest article has `visibility: public`.
- Every manifest article source URL points at `matters.icu`.
- WebFinger resolves `acct:<handle>@staging-gateway.matters.town`.
- Actor endpoint returns a valid ActivityPub actor.
- Outbox returns at least one ActivityPub Article.
- NodeInfo discovery advertises `/nodeinfo/2.1`.
- NodeInfo 2.1 advertises `activitypub`.
- Optional Misskey delivery displays the selected public Article in gyutte.site.

## Failure Boundaries

- If Lambda cannot read staging DB credentials, stop at Lambda setup; do not copy production credentials into repo files.
- If selected articles are skipped by the strict opt-in gate, record the decision report and either seed staging setting rows or rerun without `--enforce-federation-gate` for public-only preflight.
- If gateway probes fail but bundle validation passes, treat it as a gateway runtime/config issue, not a `matters-server` backend issue.
- If Misskey delivery fails after gateway outbox passes, treat it as interop/delivery debugging and preserve the generated bundle plus `staging-check-report.json`.
- If Cloudflare serves a stale 404 for WebFinger, confirm the origin with a cache-busting query and purge the Cloudflare cache when the operator token has cache-purge permission. Do not treat this as a gateway runtime failure if the origin and uncached route pass.

## 2026-05-11 Latest Public-Only Deployed-Lambda Result

- Workflow run: `thematters/lambda-handlers` `Invoke Federation Export Staging`, run `25695506631`.
- Inputs: `short_hashes=ej8tf2513uky,zne4qktk3xk0`.
- Lambda result: `statusCode=200`, `selected=2`, `eligible=1`, `skipped=1`.
- Decision report: article `23520` was `eligible`; article `23522` was skipped as `article_not_public`.
- Bundle actor: `zeckagent3@staging-gateway.matters.town`.
- Bundle files: `.well-known/webfinger`, `about.jsonld`, `activitypub-manifest.json`, `feed.json`, `index.html`, `outbox.jsonld`, `rss.xml`.
- Local gateway probe: WebFinger resolved `acct:zeckagent3@staging-gateway.matters.town`, actor type was `Person`, outbox item count was `1`, NodeInfo discovery advertised `/nodeinfo/2.1`, and NodeInfo 2.1 advertised `activitypub`.
- SQLite consistency scan: total diffs `0`.
- Misskey read-only probe: gyutte.site resolved `zeckagent3@staging-gateway.matters.town`, followers collection had `1` recipient, and no new public `Create` was sent.

## 2026-05-11 Strict Gate Result

- Workflow run: `thematters/lambda-handlers` `Invoke Federation Export Staging`, run `25680894969`.
- Inputs: `short_hashes=ej8tf2513uky,zne4qktk3xk0`, `enforce_federation_gate=true`, `author_federation_setting=enabled`, `article_federation_setting=inherit`.
- Lambda result: `statusCode=200`, `selected=2`, `eligible=1`, `skipped=1`.
- Decision report: article `23520` was `eligible`; article `23522` was still skipped as `article_not_public`.
- This verifies that strict gate payloads can pass through `federation-export-dev` while preserving the public-only boundary. It is still a staging row-level payload test, not a production settings rollout.

## 2026-05-11 G2-B Develop Deploy And Permission Gate

- `matters-server` PR #4773 merged to `develop`; deploy run `25699693933`
  passed.
- `matters-web` PR #5883 merged to `develop`; deploy run `25699702018`
  passed.
- `server.matters.icu` schema exposes the expected G2-B fields and mutations:
  `User.federationSetting`, `Article.federationSetting`,
  `Article.federationEligibility`, `setViewerFederationSetting`,
  `setArticleFederationSetting`, and `UserFeatureFlagType.fediverseBeta`.
- Read-only gate check:
  - public article `23520` is currently blocked as `author_not_opted_in`
    because the author has no federation setting row yet.
  - paywalled article `23522` is blocked as `article_not_public`.
- Fresh Lambda public-only run `25700094845` passed with `selected=2`,
  `eligible=1`, and `skipped=1`.
- Fresh Lambda strict-gate row-level run `25700094876` passed with
  `authorFederationSetting=enabled`, `articleFederationSetting=inherit`,
  public article `23520` eligible, and paywalled article `23522` still blocked.
- This was the last pre-permission state. The permission gate was cleared on
  2026-05-12 for API validation.

## 2026-05-12 G2-B Staging API Validation

- `mashbean@matters.town` authenticated on `matters.icu` as staging admin.
- `fediverseBeta` was added to the test account and account-level federation
  was set to `enabled`.
- Public article `23520` (`ej8tf2513uky`) is now `eligible` after author
  opt-in.
- Paywalled article `23522` (`zne4qktk3xk0`) remains blocked as
  `article_not_public`.
- Deployed-Lambda strict-gate run
  <https://github.com/thematters/lambda-handlers/actions/runs/25712528545>
  passed with `selected=2`, `eligible=1`, and `skipped=1`.
- The returned bundle contains the expected seven files:
  `.well-known/webfinger`, `about.jsonld`, `activitypub-manifest.json`,
  `feed.json`, `index.html`, `outbox.jsonld`, and `rss.xml`.
- `gateway-core` ingested the bundle locally, WebFinger / actor / outbox /
  NodeInfo probes passed, and SQLite consistency scan returned `totalDiffs=0`.
- Public `https://staging-gateway.matters.town` probes also passed for
  `acct:zeckagent3@staging-gateway.matters.town`.
## 2026-05-12 G2-B Pilot-Owned Article Validation

- Created pilot-owned public staging article `23525` (`ckl5le599uwc`) through
  the `matters.icu` browser UI under `mashbean@matters.town`.
- Browser UI QA passed for the account settings Fediverse row: the row is
  visible and account federation is enabled.
- Browser UI QA passed for the article edit settings panel: the Fediverse
  control is visible and defaults to `Follow author setting`; the panel copy
  states that only public articles can be exported while private or paywalled
  articles stay blocked by the server.
- GraphQL gate check returned `eligible=true`, reason `eligible`,
  author setting `enabled`, public access, and effective article setting
  `inherit`.
- Deployed-Lambda strict-gate run
  <https://github.com/thematters/lambda-handlers/actions/runs/25713858021>
  passed with `selected=1`, `eligible=1`, and `skipped=0`.
- The returned bundle exports actor
  `acct:mashbeanmatters@staging-gateway.matters.town` and contains the expected
  seven files.
- `gateway-core` ingested the bundle into
  `runtime/matters-icu-staging-g2b-25713858021`; `npm test` passed 117/117,
  `scan-consistency` returned `totalDiffs=0`, and `check-secret-layout` passed.
- Public `https://staging-gateway.matters.town` probes passed for encoded
  WebFinger, actor, outbox, NodeInfo discovery, and NodeInfo 2.1.
- gyutte.site Misskey read-side probe resolved
  `mashbeanmatters@staging-gateway.matters.town` through `users/show`; no public
  Misskey `Create` was sent in this pass.

## 2026-05-13 Record-Only Trigger Scaffold Deploy

- `matters-server` PR
  [#4774](https://github.com/thematters/matters-server/pull/4774) merged to
  `develop`.
- Deploy run
  [25768243309](https://github.com/thematters/matters-server/actions/runs/25768243309)
  passed build, develop DB migration, Elastic Beanstalk deploy, develop Lambda
  deploy, and Slack notification.
- Production deploy, production Lambda deploy, and production DB migration jobs
  were skipped in that run.
- `server.matters.icu` GraphQL responded after deploy.
- `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` is now configured on
  `matters.icu` develop.
- Fresh pilot public article `23534`
  (`https://matters.icu/a/hwj8ajpbc048`) was published and then revised on
  2026-05-15. The staging database recorded both `publish_article` and
  `revise_article` rows in `federation_export_event`.
- Both rows have `mode=record_only`, `status=recorded`, `eligible=true`, and
  `reason=eligible`. Both rows use `effective_article_setting=inherit`, which
  is valid for the current product rule because the author has explicitly opted
  in and the article follows the author default.
- Expected result is now confirmed: strict eligibility is recorded, normal
  publish/edit remains unblocked, and no Lambda, S3, IPNS, or ActivityPub
  delivery is invoked from `matters-server`.

## 2026-05-13 Pre-EB-Access Regression

- Prepared
  [`record-only-trigger-validation-runbook.md`](record-only-trigger-validation-runbook.md)
  and `gateway-core/scripts/check-record-only-trigger-report.mjs` so the
  publish/edit audit-row evidence can be checked immediately after the develop
  EB environment variable is enabled.
- Local sample check for the record-only evidence checker passed with both
  `publish_article` and `revise_article` rows.
- `gateway-core` automated tests passed: 117/117.
- Existing `mashbeanmatters` staging runtime consistency scan passed with
  `totalDiffs=0`.
- Existing `mashbeanmatters` staging secret layout check passed.
- Public `https://staging-gateway.matters.town` read-side probes still pass for
  WebFinger, actor, outbox, NodeInfo discovery, and NodeInfo 2.1.
- This pass does not invoke Lambda, change EB settings, write S3, publish IPNS,
  send ActivityPub delivery, or touch production.

## 2026-05-15 Post-PR29 Staging Outbound Delivery

- `matters-fediverse-gateway` PR
  [#29](https://github.com/thematters/matters-fediverse-gateway/pull/29)
  merged to `main` and was applied to the local staging gateway runtime.
- Public actor
  `https://staging-gateway.matters.town/users/mashbeanmatters` now serves
  ActivityPub discovery hints including `discoverable: true`, `indexable: true`,
  and the Mastodon `toot` JSON-LD context.
- Public actor and WebFinger checks remain uncached at the Cloudflare edge:
  `cache-control: no-store` and `cf-cache-status: DYNAMIC`.
- Staging `Update` delivery was sent for existing pilot article `23525` through
  `https://staging-gateway.matters.town/users/mashbeanmatters/outbox/update`.
- Delivery result: 2 recipients, both delivered:
  - `https://g0v.social/users/mashbean`
  - `https://gyutte.site/users/819de678273e9b120fd654b5`
- Delivery queue after the run: `outboundPending=0`, `outboundProcessing=0`,
  `deadLetters=0`.
- Content delivery summary after the run: 11 activities delivered, 20
  recipient deliveries delivered, 0 pending, 0 dead letters.
- SQLite / file mirror consistency scan returned `totalDiffs=0` after the
  outbound update.
- Evidence files:
  - `gateway-core/runtime/interop/staging-outbound-update-post-pr29-20260515T084502Z.json`
  - `gateway-core/runtime/matters-icu-staging-g2b-25713858021/consistency-scans/consistency-scan-2026-05-15-084520550Z-post-outbound-update.json`
- Misskey API can still resolve
  `mashbeanmatters@staging-gateway.matters.town`; the latest visible notes in
  gyutte.site remain previous staging `Article` / reply probes, so the delivered
  `Update` is counted as delivery-level proof rather than a fresh UI display
  proof.
- This historical staging-domain Threads result is superseded by the canonical
  `matters.town` pilot checks: Threads can now discover the canonical profile,
  while Follow still remains a non-blocking compatibility issue.
- Local AWS CLI is not configured with a usable profile, region, or credentials
  on this Mac, so fresh `federation-export-dev` invocation from the local
  staging script is blocked until AWS CLI access is configured. Existing
  deployed-Lambda run `25713858021` remains the current valid bundle source for
  article `23525`.

## 2026-05-15 Mastodon Read-Back Token

- Created a g0v.social developer application named `Matters Fediverse Gateway
  Staging Readback`.
- Scopes are read-only: `read:accounts`, `read:search`, `read:statuses`, and
  `profile`. No write or admin scopes were granted.
- The access token is stored only in ignored local runtime secrets:
  `gateway-core/runtime/secrets/g0v-mastodon-readback-token`.
- API verification passed:
  - `verify_credentials` returns the logged-in g0v.social account.
  - authenticated search resolves
    `mashbeanmatters@staging-gateway.matters.town`.
  - status read-back returns recent staging gateway objects.
- Evidence files:
  - `gateway-core/runtime/interop/g0v-verify-credentials-20260515T093401Z.json`
  - `gateway-core/runtime/interop/g0v-search-staging-actor-20260515T093401Z.json`
  - `gateway-core/runtime/interop/g0v-staging-actor-statuses-20260515T093401Z.json`

## 2026-05-15 Repeatable Mastodon Read-Back And Delete Proof

Added `gateway-core/scripts/run-mastodon-readback.mjs` and npm script
`check:mastodon-readback` so staging delivery can be verified through the
read-only g0v.social API token without manual UI inspection.

Validation:

- `npm test` passed: 122/122.
- `node scripts/run-mastodon-readback.mjs --token-file
  ./runtime/secrets/g0v-mastodon-readback-token --acct
  mashbeanmatters@staging-gateway.matters.town` returned `ok: true`.
- Evidence:
  `gateway-core/runtime/interop/g0v-readback-20260515T120449Z.json`.

Bounded staging Delete proof:

- Created staging-only object:
  `https://staging-gateway.matters.town/articles/staging-delete-proof-20260515T120541Z`.
- `outbox/create` delivered to both accepted followers:
  `https://g0v.social/users/mashbean` and
  `https://gyutte.site/users/819de678273e9b120fd654b5`.
- Mastodon read-back found g0v.social status `116578500092043130`.
- `outbox/delete` delivered to both accepted followers.
- g0v.social `GET /api/v1/statuses/116578500092043130` returned `404` after
  the Delete, which is the expected bounded deletion result.
- Evidence files:
  - `gateway-core/runtime/interop/staging-delete-proof-create-20260515T120541Z.json`
  - `gateway-core/runtime/interop/g0v-delete-proof-readback-20260515T120541Z.json`
  - `gateway-core/runtime/interop/staging-delete-proof-delete-20260515T120541Z.json`
  - `gateway-core/runtime/interop/g0v-delete-proof-status-after-delete-20260515T120541Z.json`

## 2026-05-15 AWS Access Attempt

- AWS CLI is installed, but no local profile, access key, secret key, or region
  is configured for this Mac.
- ChatGPT Atlas can reach AWS Console and showed account `Matters
  (903380195283)`, but Computer Use could not keep the Atlas window stable long
  enough to safely change Elastic Beanstalk settings.
- Safari can open the AWS Elastic Beanstalk URL but reaches AWS Sign-In instead
  of an authenticated console session.
- No Elastic Beanstalk setting was changed. Production was not touched.
- Next safe path: open an authenticated AWS Console window directly on the
  `ap-southeast-1` Elastic Beanstalk environment list, or configure a local
  least-privilege AWS profile, then set
  `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` only on the
  `matters.icu` develop environment.

## 2026-05-15 Threads Discovery Diagnostic

Added `gateway-core/scripts/run-threads-discovery-diagnostics.mjs` and npm
script `check:threads-discovery` to separate gateway correctness from Threads
indexing behavior.

Initial staging command:

```bash
node scripts/run-threads-discovery-diagnostics.mjs \
  --base-url https://staging-gateway.matters.town \
  --handle mashbeanmatters \
  --canonical-domain matters.town \
  --output-file runtime/interop/threads-discovery-diagnostics-20260515T091300Z.json
```

Staging rerun:

```bash
node scripts/run-threads-discovery-diagnostics.mjs \
  --output-file runtime/interop/threads-discovery-diagnostics-20260515T120607Z.json
```

Post-Cloudflare-rule canonical rerun:

```bash
npm run check:threads-discovery -- \
  --output-file ./runtime/interop/threads-discovery-canonical-latest.json
```

Result:

- default user-agent, `facebookexternalua`, and `facebookexternalhit` all
  received 200 for staging WebFinger, actor, outbox, and NodeInfo discovery.
- Before the Cloudflare rule was added, `meta-externalagent/1.1` received
  Cloudflare 403 HTML responses for staging WebFinger, actor, outbox, NodeInfo
  discovery, and the canonical-resource probe.
- After adding the staging-only Cloudflare custom rule
  `skip-staging-fediverse-meta-crawlers`, default user-agent,
  `facebookexternalua`, `facebookexternalhit`, and `meta-externalagent/1.1`
  all receive 200 for staging WebFinger, actor, outbox, and NodeInfo
  discovery. The diagnostic now returns `ok: true`.
- `acct:mashbeanmatters@matters.town` is now the canonical pilot identity.
  `check:threads-discovery` defaults to `https://matters.town` with the `/ap`
  actor path. Use `--base-url https://staging-gateway.matters.town` only when
  intentionally comparing historical staging behavior.

Current Threads hypothesis:

1. Cloudflare WAF/Bot blocking for `meta-externalagent` on staging federation
   paths is cleared.
2. Threads can discover the canonical pilot profile but Follow still fails,
   likely because of platform-specific Follow / actor-key / inbox behavior or
   cached remote actor state.
3. This does not invalidate Mastodon/Misskey evidence because those paths
   already pass discovery and delivery.

Next Threads action: keep the exact canonical profile search and Follow attempt
as a compatibility track, but do not block production record-only / `mashbean`
pilot preparation on Threads.

2026-05-28 canonical live rerun:

- Command: `npm run check:threads-discovery -- --base-url https://matters.town --canonical-domain matters.town --canonical-base-url https://matters.town --actor-path-prefix /ap`
- Report: `research/matters-fediverse-compat/03-ops/threads-discovery-live-20260528.json`
- Result: `ok=true`, no failures, no warnings.
- WebFinger, actor, outbox, NodeInfo, and canonical WebFinger all returned
  HTTP 200 for default, `facebookexternalua`, `facebookexternalhit`, and
  `meta-externalagent` user agents.
- Current interpretation: Threads discovery prerequisites pass on the
  canonical public surface. The remaining Threads failure is the UI Follow
  flow or Threads-side compatibility/cache behavior, not a direct Cloudflare
  crawler block on these endpoints.

Follow-up permission check:

- The available Cloudflare token verifies successfully and can read cache rules.
- The same token cannot read WAF/custom firewall entrypoints; Cloudflare API
  returns `request is not authorized` for `http_request_firewall_custom`,
  `http_request_firewall_managed`, and `http_ratelimit`.
- Required next credential: a temporary token scoped to the `matters.town` zone
  with Rulesets/WAF edit permission, or a dashboard user session that can create
  the staging-only custom rule.

Dashboard rule status:

- The staging-only custom rule is now deployed in Cloudflare dashboard with
  rule name `skip-staging-fediverse-meta-crawlers`, action `Skip`, and the Meta
  crawler expression listed in the Cloudflare tunnel runbook.
- The rule is first in custom-rule order and only matches
  `staging-gateway.matters.town` federation paths. It does not cover
  `matters.town` production backend routes, `staging-admin.matters.town`, or
  `staging-hooks.matters.town`.
- The verification rerun
  `threads-discovery-after-cf-bypass-20260515T142954Z.json` passed with
  `ok: true`.
