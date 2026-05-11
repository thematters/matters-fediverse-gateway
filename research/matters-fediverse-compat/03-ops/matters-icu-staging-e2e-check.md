# matters.icu Staging E2E Check

Date: 2026-05-11
Status: server and generator PRs are merged and `matters.icu` develop deploy passed; next run should wait for `lambda-handlers` PR #223 or use the current dev Lambda only with awareness that it emits duplicate manifest paths

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
- `lambda-handlers` PR #223 merged or otherwise accounted for, so generated bundles contain only one canonical `activitypub-manifest.json`.
- A fresh `lambda-handlers` image tag is available in ECR.
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
