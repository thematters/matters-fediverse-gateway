# matters.icu Public-Only Staging Rerun

Date: 2026-05-11
Status: public-only Lambda dry-run passed twice; no admin mutation was used

## Scope

This run intentionally avoided staging admin-only GraphQL mutations. It only used public `matters.icu` article reads, `federation-export-dev` dry-run generation, local bundle validation, and public staging gateway probes.

It did not write author federation settings, article federation settings, staging DB rows, S3 output, or production data.

## Inputs

The first attempted rerun used the older `@charlesmungerai` staging short hashes:

- `wdzgj6wllhrf`
- `mgbaikfdg7a9`
- `drxqcpmy0obk`

GitHub Actions run: https://github.com/thematters/lambda-handlers/actions/runs/25694498852

Result: failed before Lambda invocation because current `matters.icu` public GraphQL could not read `mgbaikfdg7a9`. A local follow-up check showed all three older `@charlesmungerai` staging hashes now return `null` from public GraphQL, so those fixtures should be treated as stale staging data.

The successful rerun used current readable staging articles:

- `ej8tf2513uky`: public article `23520`, author `zeckagent3`
- `zne4qktk3xk0`: paywalled article `23522`, expected to be skipped

GitHub Actions run: https://github.com/thematters/lambda-handlers/actions/runs/25694589292

The same public-only input was rerun again after adding NodeInfo gateway probes:

GitHub Actions run: https://github.com/thematters/lambda-handlers/actions/runs/25695506631

## Lambda Dry-Run Result

`Invoke Federation Export Staging` completed successfully. The latest successful
run is `25695506631`; the earlier successful run `25694589292` produced the same
public-only decision result.

- `statusCode`: `200`
- `enforceFederationGate`: `false`
- `selected`: `2`
- `eligible`: `1`
- `skipped`: `1`
- Eligible article: `23520`
- Skipped article: `23522`, reason `article_not_public`
- Generated actor: `zeckagent3@staging-gateway.matters.town`
- Generated files:
  - `.well-known/webfinger`
  - `about.jsonld`
  - `activitypub-manifest.json`
  - `feed.json`
  - `index.html`
  - `outbox.jsonld`
  - `rss.xml`

The workflow artifact was downloaded locally to:

```text
/tmp/federation-export-staging-25695506631/
```

## Gateway Validation

The downloaded Lambda response was validated with:

```bash
node scripts/run-matters-icu-staging-check.mjs \
  --lambda-response-file /tmp/federation-export-staging-25695506631/lambda-response.json \
  --site-domain matters.icu \
  --webf-domain staging-gateway.matters.town \
  --output-dir ./runtime/matters-icu-staging-20260511-public-only-latest \
  --gateway-url https://staging-gateway.matters.town
```

Result:

- `status`: `ok`
- Manifest `version`: `1`
- `visibility.federatedPublicOnly`: `true`
- Manifest article count: `1`
- Gateway WebFinger resolved `acct:zeckagent3@staging-gateway.matters.town`
- Actor endpoint returned `Person`
- Outbox returned `1` Article
- NodeInfo discovery returned `/nodeinfo/2.1`
- NodeInfo 2.1 returned `version=2.1`, `protocols=["activitypub"]`, and `software.name=matters-gateway-core`

Generated local runtime output:

```text
gateway-core/runtime/matters-icu-staging-20260511-public-only-latest/
  bundle/
  gateway.instance.json
  staging-check-report.json
  consistency-scans/
```

## Additional Checks

Public staging gateway probes:

- Encoded WebFinger request passed for `acct:zeckagent3@staging-gateway.matters.town`
- `/users/zeckagent3` returned a `Person` actor
- `/users/zeckagent3/outbox` returned one public Article
- `/.well-known/nodeinfo` advertised `/nodeinfo/2.1`
- `/nodeinfo/2.1` advertised `activitypub`, `matters-gateway-core`, and `users.total=1`

Runtime state consistency:

```text
totalDiffs: 0
missing_in_file: 0
missing_in_sqlite: 0
value_mismatch: 0
```

Gateway-core test suite:

```text
tests 117
pass 117
fail 0
```

Read-only Misskey interop dry-run:

- Mode: `dry-run`; no public `Create` was sent
- Target: `https://gyutte.site`
- Gateway actor: `acct:zeckagent3@staging-gateway.matters.town`
- Misskey resolve method: `users/show-after-ap-show-error`
- Followers collection: `1` recipient
- Misskey `users/notes` before send: `1` existing note
- Planned Create endpoint: `https://staging-gateway.matters.town/users/zeckagent3/outbox/create`
- Local report: `gateway-core/runtime/interop/misskey-public-readonly-zeckagent3-20260511T2045Z.json`

## Interpretation

The non-admin path is still healthy:

```text
public matters.icu GraphQL
-> federation-export-dev dry-run
-> ActivityPub seed bundle
-> gateway-core manifest validation and SQLite consistency scan
-> public staging WebFinger / actor / outbox / NodeInfo
-> read-only Misskey account and followers probe
```

The public-only boundary also still works: the paywalled staging article was selected as input but excluded from the generated federation bundle.

## Remaining Admin-Gated Step

The next blocked step is strict gate validation against real staging settings:

- write or confirm author federation setting
- write or confirm article federation setting
- rerun with `enforce_federation_gate=true`

That requires staging admin permission or another approved admin-side path. Until then, continue using public-only dry-run checks for regression coverage.
