# matters.icu Staging E2E Check

Date: 2026-05-11
Status: server, web, generator, and lambda staging pieces are merged to their develop/main tracks; `matters.icu` server/web develop deploys passed; `federation-export-dev` is updated to `lambda-handlers` `v0.14.1`; real deployed-Lambda staging bundles have passed gateway, NodeInfo, SQLite consistency, and Misskey verification without admin mutations. G2-B UI validation is waiting for staging pilot/admin permission.

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
- `mashbean@matters.town` is the intended staging pilot/admin test account, but
  it does not yet have staging admin / `fediverseBeta` permission. UI opt-in
  validation must wait for that permission.
