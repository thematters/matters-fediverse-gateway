# Article Display Compatibility Probe 20260502

## Summary

- Status: `pass-with-limits`
- Scope: W4a Article display follow-up after W3 Misskey public interop
- Gateway: `https://staging-gateway.matters.town`
- Actor: `alice`
- Misskey instance: `https://gyutte.site`
- Misskey operator account: `https://gyutte.site/@mashbean`
- GoToSocial: skipped by current product decision

This report records what can be concluded from the current public Misskey run and the follow-up public staging `Create`.

## Probe Automation

`gateway-core/scripts/run-misskey-article-display-probe.mjs` now provides a guarded display probe for this exact gap.

- Default mode is dry-run: it checks gateway followers, resolves the remote actor in Misskey, reads `users/notes`, and prints the public `Create` payload that would be sent.
- Public sending requires both `--send` and `--confirm-public-create`.
- Token values are read from `MISSKEY_ACCESS_TOKEN` or `--token-file` and are not printed in the JSON report.
- The package shortcut is `npm run check:misskey-display`.

Staging dry-run command used for this report:

```sh
MISSKEY_BASE_URL=https://gyutte.site \
GATEWAY_PUBLIC_BASE_URL=https://staging-gateway.matters.town \
GATEWAY_PROBE_BASE_URL=https://staging-gateway.matters.town \
GATEWAY_POST_BASE_URL=http://127.0.0.1:8787 \
GATEWAY_HANDLE=alice \
runtime/tools/node-local scripts/run-misskey-article-display-probe.mjs \
  --token-file runtime/secrets/misskey-access-token \
  --now 2026-05-02T20:45:00.000Z \
  --slug w4a-misskey-display-probe-20260502
```

Public send command used after human confirmation:

```sh
MISSKEY_BASE_URL=https://gyutte.site \
GATEWAY_PUBLIC_BASE_URL=https://staging-gateway.matters.town \
GATEWAY_PROBE_BASE_URL=https://staging-gateway.matters.town \
GATEWAY_POST_BASE_URL=http://127.0.0.1:8787 \
GATEWAY_HANDLE=alice \
MISSKEY_DISPLAY_POLL_ATTEMPTS=10 \
MISSKEY_DISPLAY_POLL_INTERVAL_MS=3000 \
runtime/tools/node-local scripts/run-misskey-article-display-probe.mjs \
  --token-file runtime/secrets/misskey-access-token \
  --now 2026-05-02T20:45:00.000Z \
  --slug w4a-misskey-display-probe-20260502 \
  --send \
  --confirm-public-create
```

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
| Gateway followers collection | 200, `totalItems: 1` |
| SQLite followers table | one accepted follower for `https://gyutte.site/users/...` |

Interpretation before the public `Create`: this Misskey run proved actor discovery and follow state, but it did not prove Misskey timeline rendering for the existing outbox Articles. gyutte.site did not backfill historical outbox items into `users/notes` during this follow probe.

## Public Staging Create Result

After human confirmation, the guarded display probe sent the prepared public staging `Article` through `POST /users/alice/outbox/create`.

| Probe | Result |
|---|---|
| Gateway `outbox/create` | 202, `status: queued` |
| Recipient count | 1 gyutte.site follower |
| Delivery status | `delivered` |
| Misskey `users/notes` after delivery | 1 matched note |
| Matched note URI | `https://staging-gateway.matters.town/articles/w4a-misskey-display-probe-20260502` |
| Matched note content warning | `Staging-only public ActivityPub Article used to verify Misskey display behavior.` |

Misskey rendered the incoming `Article` as a note-like surface with:

- the `Article.name` folded into the note text as a bracketed title
- `Article.summary` mapped to `cw`
- HTML paragraphs and list text flattened into note text
- canonical staging URL preserved

This validates Misskey API-level display for a freshly delivered staging `Article`. It does not yet validate image attachments or manual UI presentation quality.

## Compatibility Matrix

| Implementation | Discovery | Follow relation | Article object visible in remote notes/timeline | Notes |
|---|---:|---:|---:|---|
| Mastodon | pass | pending/requested in recorded run | not verified in that run | 2026-03-21 report checked discoverability and follow loop only |
| Misskey | pass | pass | pass with limits | Fresh public staging `Create` appears in `users/notes`; HTML is flattened, summary maps to `cw`, attachments still untested |
| GoToSocial | skipped | skipped | skipped | user decision: skip for now |

## W4a Implications

- Current W4a normalization remains appropriate for gateway-served Article objects: `Article`, `name`, `summary`, `content`, canonical `url`, and original-link preservation are visible at the gateway boundary.
- Misskey compatibility for freshly delivered text-only `Article` is now verified at API level.
- Misskey compatibility still needs attachment-specific coverage before claiming image display parity.
- Attachment display still needs a fixture with at least one external image and one IPFS-normalized image; the current staging actor has no attachments to inspect in Misskey.

## Public Probe Payload

The public staging Article sent to Misskey used this payload shape:

| Field | Value |
|---|---|
| Endpoint | `http://127.0.0.1:8787/users/alice/outbox/create` |
| Object ID | `https://staging-gateway.matters.town/articles/w4a-misskey-display-probe-20260502` |
| Type | `Article` |
| Title | `[STAGING] Matters Gateway W4a Misskey Article display probe w4a-misskey-display-probe-20260502` |
| Summary | `Staging-only public ActivityPub Article used to verify Misskey display behavior.` |
| Audience | ActivityStreams Public + accepted followers |
| Current recipient set | one gyutte.site follower |

The body is explicitly labeled as staging-only and says it contains no token, private data, or formal announcement.

## Evidence

- Misskey public interop report: `research/matters-fediverse-compat/03-ops/misskey-public-run-20260502T152117Z.md`
- Runtime-only Misskey display probe: `gateway-core/runtime/interop/misskey-article-display-probe-20260502.json`
- Runtime-only gateway surface capture: `gateway-core/runtime/interop/staging-article-surface-20260502.json`
- Runtime-only local admin probe: `gateway-core/runtime/interop/admin--admin-local-content-actorHandle-alice.json`
- Dry-run display probe: `gateway-core/scripts/run-misskey-article-display-probe.mjs`

## Next Decision Point

Decide whether W4a should add a dedicated attachment fixture and public attachment display probe now, or defer image/IPFS display parity to the broader content-media task. The text-only Misskey Article display path is no longer blocked.
