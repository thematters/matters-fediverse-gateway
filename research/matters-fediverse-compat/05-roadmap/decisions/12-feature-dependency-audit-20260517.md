# Feature Dependency Audit 2026-05-17

## Scope

This audit updates downstream assumptions after the canonical pilot feature
changed from staging-only proof to production preparation.

New baseline:

- Threads is not a launch blocker.
- Production preparation may start, but full production outbound delivery stays
  disabled.
- First production-facing pilot author: `mashbean`.
- First production mode: record-only / observation.
- Canonical identity: `acct:mashbeanmatters@matters.town`.
- Actor key strategy: use a fresh versioned gateway-core key id; do not reuse a
  Worker demo `#main-key` with new gateway-core key material.
- User-facing Fediverse UI eligibility now comes from
  `User.features.fediverseBeta`, not admin-only `User.oss.featureFlags`.

## Dependency Corrections

| Area | Previous assumption | Corrected assumption |
| --- | --- | --- |
| Threads | Threads discovery/follow could block launch readiness | Threads Follow remains a compatibility issue, but does not block Mastodon/Misskey pilot preparation |
| Identity | `staging-gateway.matters.town` was the active pilot identity | `matters.town` is the active canonical pilot identity; staging host is historical test evidence |
| Gateway origin | Canonical inbox persistence was not ready | AWS `gateway-core` origin is active behind the Worker and reports persistent follow readiness |
| Follow proof | Canonical follow was pending | Mastodon/g0v.social and Misskey/gyutte.site canonical follows have converged |
| Article visibility | Canonical Article visibility was unproven | Canonical pilot Article is visible on Mastodon and Misskey |
| Interaction return | Interaction return was unproven | Misskey reply / like / renote return is persisted; Mastodon interaction return still needs write scope |
| Production path | Production rollout was broadly gated | Production prep may proceed for `mashbean` record-only / observation; full outbound remains gated |
| Key id | `#main-key` was acceptable for demos | Real gateway-core actors must use versioned key ids to avoid remote public-key cache conflicts |
| Feature eligibility | Matters Web could gate controls with `viewer.oss.featureFlags` | Matters Web must gate public controls with `viewer.features.fediverseBeta`; `User.oss` stays admin-only |

## Files Updated

- `gateway-core/scripts/run-threads-discovery-diagnostics.mjs`
  - Default target is now canonical `https://matters.town`.
  - Actor paths default to `/ap/users/<handle>` on `matters.town`.
  - Historical staging checks remain available with `--base-url`.
- `gateway-core/scripts/run-mastodon-readback.mjs`
  - Default readback account is now `mashbeanmatters@matters.town`.
- `gateway-core/scripts/check-production-record-only-preflight.mjs`
  - Read-only preflight now checks the canonical pilot surface before
    production record-only / observation.
  - It verifies `record_only`, `mashbean`, full outbound disabled, gateway-core
    persistent health, WebFinger, actor URLs, outbox, followers, and versioned
    key id.
- `research/matters-fediverse-compat/04-status/next-steps.md`
  - Immediate work now starts from production record-only / `mashbean` pilot
    preparation.
- `research/matters-fediverse-compat/05-roadmap/decisions/10-production-gates-current.md`
  - Gate status now separates cleared pilot evidence from full production
    launch gates.
- `research/matters-fediverse-compat/05-roadmap/decisions/11-canonical-identity-cutover.md`
  - Canonical follow and Article visibility proof are recorded as complete for
    Mastodon and Misskey.
- `cloudflare-worker/README.md`
  - Pilot allowlist guidance now reflects the current record-only / observation
    path and versioned key-id rule.
- `research/matters-fediverse-compat/03-ops/matters-icu-staging-e2e-check.md`
  - Threads diagnostics now point to canonical defaults.
- `matters-server` PR #4798
  - Adds public-safe `User.features` with current-viewer scoped
    `fediverseBeta` and `communityWatch`.
- `matters-web` PR #5905 / #5906
  - Restores Fediverse controls through `viewer.features.fediverseBeta`; #5906
    removes the transient settings-row flash while eligibility loads.

## Still Intentionally Open

- Mastodon reply / favourite / boost return proof needs a write-scoped token or
  browser-based manual action.
- Threads Follow failure remains under compatibility investigation.
- Production private S3, Lambda secret owner, legal/privacy copy, takedown
  owner, rollback rehearsal, and launch owner are still full-rollout gates.
- Production branch/deploy parity still needs a final check: server and web
  deployments must both include the `User.features` contract before record-only
  pilot validation.
- Full production outbound `Create` / `Update` / `Delete` is not enabled.

## Operator Rule

Future checks should default to the canonical pilot surface unless the operator
explicitly says the test is about staging history:

```bash
cd gateway-core
npm run check:threads-discovery
npm run check:mastodon-readback -- --expected-url <canonical-article-url>
npm run check:production-record-only
```

Use staging hostnames only for archived staging proofs or pre-production
regression comparisons.
