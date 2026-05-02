# Article Display Compatibility Probe 20260502

## Summary

- Status: `pass-with-limits`
- Scope: W4a Article display follow-up after W3 Misskey public interop
- Gateway: `https://staging-gateway.matters.town`
- Actor: `alice`
- Misskey instance: `https://gyutte.site`
- Misskey operator account: `https://gyutte.site/@mashbean`
- GoToSocial: skipped by current product decision

This report records what can be concluded from the current public Misskey run and the follow-up public staging `Create` probes.

## Probe Automation

`gateway-core/scripts/run-misskey-article-display-probe.mjs` now provides guarded display probes for this exact gap.

- Default mode is dry-run: it checks gateway followers, resolves the remote actor in Misskey, reads `users/notes`, and prints the public `Create` payload that would be sent.
- Public sending requires both `--send` and `--confirm-public-create`.
- Token values are read from `MISSKEY_ACCESS_TOKEN` or `--token-file` and are not printed in the JSON report.
- `--fixture text` checks text-only long-form `Article` behavior.
- `--fixture media` checks external image and IPFS-normalized image attachments.
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

## Public Media Attachment Result

After the user authorized continuing without step-by-step confirmation, the guarded display probe sent a second public staging `Article` using `--fixture media`.

Command:

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
  --fixture media \
  --now 2026-05-02T21:00:00.000Z \
  --slug w4a-misskey-media-probe-20260502 \
  --send \
  --confirm-public-create
```

| Probe | Result |
|---|---|
| Gateway `outbox/create` | 202, `status: queued` |
| Recipient count | 1 gyutte.site follower |
| Delivery status | `delivered` |
| Misskey `users/notes` after delivery | 1 matched media note |
| Matched note URI | `https://staging-gateway.matters.town/articles/w4a-misskey-media-probe-20260502` |
| Misskey files count | 2 |
| File 1 | `image/png`, copied from external PNG fixture into gyutte.site media storage |
| File 2 | `image/jpeg`, copied from IPFS gateway fixture into gyutte.site media storage |
| File sensitivity | both `false` |
| Thumbnails | both files exposed `thumbnailUrl` |

Media fixture inputs:

| Fixture | Input URL | Expected normalized URL |
|---|---|---|
| External PNG | `https://www.w3.org/assets/logos/w3c-2025-transitional/w3c-72x48.png` | same URL |
| IPFS JPEG | `ipfs://bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom` | `https://ipfs.io/ipfs/bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom` |

Misskey copies remote attachment files into its own media storage, so the final `files[].url` values are gyutte.site media URLs rather than the original source URLs. The important compatibility signal is that both attachments survived delivery, were typed as images, and produced thumbnails.

## Compatibility Matrix

| Implementation | Discovery | Follow relation | Article object visible in remote notes/timeline | Notes |
|---|---:|---:|---:|---|
| Mastodon | pass | pending/requested in recorded run | not verified in that run | 2026-03-21 report checked discoverability and follow loop only |
| Misskey | pass | pass | pass | Fresh public staging `Create` appears in `users/notes`; HTML is flattened, summary maps to `cw`; external and IPFS-normalized image attachments appear as Misskey files |
| GoToSocial | skipped | skipped | skipped | user decision: skip for now |

## W4a Implications

- Current W4a normalization remains appropriate for gateway-served Article objects: `Article`, `name`, `summary`, `content`, canonical `url`, and original-link preservation are visible at the gateway boundary.
- Misskey compatibility for freshly delivered `Article` is now verified at API level for text, summary, canonical URL, external image attachment, and IPFS-normalized image attachment.
- Misskey flattens Article HTML into note text and maps `summary` to `cw`; this is acceptable for API-level interop but not equivalent to full long-form layout preservation.
- Misskey stores remote attachments under gyutte.site media URLs, so evidence should compare file count/type/thumbnail presence rather than expecting original attachment URLs to remain visible.
- Manual UI presentation quality still needs human visual review before launch, but it no longer blocks W4a engineering acceptance.

## Text Public Probe Payload

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
- Guarded text/media display probe: `gateway-core/scripts/run-misskey-article-display-probe.mjs`
- IPFS sample CID source: `https://docs.ipfs.tech/quickstart/retrieve/`

## Next Decision Point

W4a engineering acceptance can proceed for Misskey API-level compatibility. The remaining decision is launch/readiness policy: whether a human visual review of the Misskey UI is required before claiming public UX parity, or whether API evidence is sufficient for this engineering milestone.
