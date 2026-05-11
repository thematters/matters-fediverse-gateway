# matters.icu Staging E2E Check

Date: 2026-05-11
Status: server and generator PRs are merged, `matters.icu` develop deploy passed, `federation-export-dev` is updated to `lambda-handlers` `v0.14.1`, and the first real deployed-Lambda staging bundle has passed gateway and Misskey verification

## Goal

Run one bounded staging pass from real selected public Matters article IDs to a staging Fediverse actor:

```text
matters.icu selected public article IDs
-> federation-export-dev Lambda
-> generated ActivityPub seed bundle
-> gateway-core staging config
-> WebFinger / actor / outbox probe
-> optional Misskey delivery check
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
- Optional Misskey delivery displays the selected public Article in gyutte.site.

## Failure Boundaries

- If Lambda cannot read staging DB credentials, stop at Lambda setup; do not copy production credentials into repo files.
- If selected articles are skipped by the strict opt-in gate, record the decision report and either seed staging setting rows or rerun without `--enforce-federation-gate` for public-only preflight.
- If gateway probes fail but bundle validation passes, treat it as a gateway runtime/config issue, not a `matters-server` backend issue.
- If Misskey delivery fails after gateway outbox passes, treat it as interop/delivery debugging and preserve the generated bundle plus `staging-check-report.json`.
- If Cloudflare serves a stale 404 for WebFinger, confirm the origin with a cache-busting query and purge the Cloudflare cache when the operator token has cache-purge permission. Do not treat this as a gateway runtime failure if the origin and uncached route pass.

## 2026-05-11 Deployed-Lambda Result

- Workflow run: `thematters/lambda-handlers` `Invoke Federation Export Staging`, run `25653127777`.
- Inputs: `short_hashes=ej8tf2513uky,zne4qktk3xk0`.
- Lambda result: `statusCode=200`, `selected=2`, `eligible=1`, `skipped=1`.
- Decision report: article `23520` was `eligible`; article `23522` was skipped as `article_not_public`.
- Bundle actor: `zeckagent3@staging-gateway.matters.town`.
- Bundle files: `.well-known/webfinger`, `about.jsonld`, `activitypub-manifest.json`, `feed.json`, `index.html`, `outbox.jsonld`, `rss.xml`.
- Local gateway probe: WebFinger resolved `acct:zeckagent3@staging-gateway.matters.town`, actor type was `Person`, and outbox item count was `1`.
- Public delivery: gyutte.site Misskey resolved and followed `zeckagent3@staging-gateway.matters.town`; the generated article `23520` was delivered with status `delivered`, and Misskey `users/notes` matched the generated Article URL.
