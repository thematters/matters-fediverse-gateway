# Article Display Compatibility Probe 20260502

## Summary

- Status: `partial`
- Scope: W4a Article display follow-up after W3 Misskey public interop
- Gateway: `https://staging-gateway.matters.town`
- Actor: `alice`
- Misskey instance: `https://gyutte.site`
- Misskey operator account: `https://gyutte.site/@mashbean`
- GoToSocial: skipped by current product decision

This report records what can be concluded from the current public Misskey run without publishing a new ActivityPub `Create`.

## Gateway Article Surface

The staging gateway exposes two public `Create` activities in Alice's outbox:

| Field | Observed |
|---|---|
| WebFinger subject | `acct:alice@staging-gateway.matters.town` |
| Actor ID | `https://staging-gateway.matters.town/users/alice` |
| Outbox ID | `https://staging-gateway.matters.town/users/alice/outbox` |
| Outbox total items | `2` |
| Object type | `Article` |
| `name` | present |
| `summary` | present |
| canonical `url` | present |
| `content` canonical link | present as `Original Matters link` |
| attachments | none in the current staging fixture |

The current staging fixtures verify `Article`, summary, canonical URL, and normalized content shape. They do not exercise image attachment display because neither staging fixture includes attachments.

## Misskey Observation

Misskey public interop passed for discovery and follow:

- `users/show` resolved `alice@staging-gateway.matters.town`
- `following/create` converged; a repeat run returned `ALREADY_FOLLOWING`, now treated as idempotent success
- `users/relation` reported `isFollowing: true`
- `ap/show` returned 400 for this actor, so the probe used `users/show` fallback

Follow-up API observation:

| Probe | Result |
|---|---|
| Misskey `users/show` for `alice@staging-gateway.matters.town` | 200 |
| Misskey `users/notes` for the resolved remote user | 200, empty list |
| Gateway local admin content projection | 200, empty `items` |

Interpretation: this Misskey run proves actor discovery and follow state, but it does not prove Misskey timeline rendering for the existing outbox Articles. gyutte.site did not backfill historical outbox items into `users/notes` during this follow probe.

## Compatibility Matrix

| Implementation | Discovery | Follow relation | Article object visible in remote notes/timeline | Notes |
|---|---:|---:|---:|---|
| Mastodon | pass | pending/requested in recorded run | not verified in that run | 2026-03-21 report checked discoverability and follow loop only |
| Misskey | pass | pass | not verified | gyutte.site resolves and follows actor, but `users/notes` is empty |
| GoToSocial | skipped | skipped | skipped | user decision: skip for now |

## W4a Implications

- Current W4a normalization remains appropriate for gateway-served Article objects: `Article`, `name`, `summary`, `content`, canonical `url`, and original-link preservation are visible at the gateway boundary.
- Misskey compatibility needs one additional display-specific probe before we can claim timeline rendering: deliver or publish a fresh public `Create` after the Misskey follow relationship exists, then inspect Misskey `users/notes` and UI display.
- That next probe would create externally visible test content on a public Fediverse instance. It requires human confirmation at action time.
- Attachment display still needs a fixture with at least one external image and one IPFS-normalized image; the current staging actor has no attachments to inspect in Misskey.

## Evidence

- Misskey public interop report: `research/matters-fediverse-compat/03-ops/misskey-public-run-20260502T152117Z.md`
- Runtime-only Misskey display probe: `gateway-core/runtime/interop/misskey-article-display-probe-20260502.json`
- Runtime-only gateway surface capture: `gateway-core/runtime/interop/staging-article-surface-20260502.json`
- Runtime-only local admin probe: `gateway-core/runtime/interop/admin--admin-local-content-actorHandle-alice.json`

## Next Decision Point

Decide whether to run a public display probe that sends a fresh staging `Create` to Misskey. If approved, use a clearly marked test Article, no private data, no user impersonation, and archive only sanitized output.
