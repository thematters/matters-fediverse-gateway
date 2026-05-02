# Misskey Interop Run 20260502

## Summary

- Status: `passed`
- Implementation: `Misskey`
- Instance: https://gyutte.site
- Operator account URL: https://gyutte.site/@mashbean
- Gateway public URL: https://staging-gateway.matters.town
- Gateway actor: acct:charlesmungerai@staging-gateway.matters.town
- Gateway commit: `2581f86`
- Started at: 2026-05-02T22:47:43.716Z
- Completed at: 2026-05-02T22:47:43Z

## Safety Record

- Token values are not included in this report.
- Raw probe output is stored outside tracked files unless an operator explicitly archives a sanitized copy.
- The first phase covered resolve / follow / relationship checks only.
- A follow-up public staging delivery was sent after the operator authorized continuing without step-by-step decisions. It published one already-public Matters Article through the staging gateway; it did not reply, like, boost, send private messages, or expose token values.

## Result

- Probe result: `passed`
- WebFinger subject: acct:charlesmungerai@staging-gateway.matters.town
- Actor ID: https://staging-gateway.matters.town/users/charlesmungerai
- Outbox ID: https://staging-gateway.matters.town/users/charlesmungerai/outbox
- Outbox total items: `3`
- Remote resolved account ID: 819deadf89cdd644e21be202
- Remote resolved account URL: https://staging-gateway.matters.town/@charlesmungerai
- Follow response: `{"id":"819deadf89cdd644e21be202","alreadyFollowing":false,"username":"charlesmungerai","host":"staging-gateway.matters.town"}`
- Relationship state: `{"id":"819deadf89cdd644e21be202","following":null,"isFollowing":false,"isFollowed":false,"hasPendingFollowRequestFromYou":true,"hasPendingFollowRequestToYou":false,"isBlocking":false,"isBlocked":false,"isMuted":false,"isRenoteMuted":false}`
- Gateway followers collection after the follow request: `totalItems: 1`
- Misskey `users/notes` before fresh delivery: `0` matching notes

## Failures

- none

## Public Matters Article Delivery Follow-up

The staging gateway was switched locally to the generated `charlesmungerai` public API bundle and served through `staging-gateway.matters.town`. A follow-up run sent the first generated public Matters `Article` through `POST /users/charlesmungerai/outbox/create`.

| Field | Result |
|---|---|
| Source Matters article ID | `1182465` |
| ActivityPub object | `https://staging-gateway.matters.town/1182465-我的人生帳本-7-賭一把或求穩健-背後是哪一種人格底色/` |
| Title | `我的人生帳本 7｜賭一把或求穩健，背後是哪一種人格底色` |
| Gateway `outbox/create` | 202, `status: queued` |
| Activity ID | `https://staging-gateway.matters.town/activities/1777762227686-create-charlesmungerai` |
| Recipient count | 1 gyutte.site follower |
| Delivery status | `delivered` |
| Misskey `users/notes` after delivery | 1 matched note |
| Matched Misskey note ID | `819d5dff5b28d238b7ea5d9c` |
| Matched note URI | same as the ActivityPub object URL |
| Matched note content warning | Article summary mapped to `cw` |
| Matched note files | 2 `image/jpeg` entries with gyutte.site media URLs and thumbnails |

Interpretation: discovery, follow-state capture, and a fresh public `Article` delivery all passed for `charlesmungerai@staging-gateway.matters.town`. Misskey did not backfill existing generated outbox items into `users/notes`; the Article became visible after the gateway sent a fresh `Create`.

## Evidence

- Raw probe output file: `/Users/mashbean/Documents/Codex/2026-04-30/files-mentioned-by-the-user-matters/repos/matters-fediverse-gateway/gateway-core/runtime/interop/misskey-raw-20260502T224649Z-charlesmungerai.json`
- Raw probe output SHA-256: `18cc6422068f35ec938c7eaebce9b9e11cede2de7a1e9fed6bd510b7e5106b1c`
- Runtime-only delivery report: `/Users/mashbean/Documents/Codex/2026-04-30/files-mentioned-by-the-user-matters/repos/matters-fediverse-gateway/gateway-core/runtime/interop/misskey-article-delivery-charlesmungerai-20260502T225026Z.json`

## Sanitized Payload

```json
{
  "ok": true,
  "failures": [],
  "report": {
    "discovery": {
      "subject": "acct:charlesmungerai@staging-gateway.matters.town",
      "actorHref": "https://staging-gateway.matters.town/users/charlesmungerai",
      "actorId": "https://staging-gateway.matters.town/users/charlesmungerai",
      "followers": "https://staging-gateway.matters.town/users/charlesmungerai/followers",
      "outboxId": "https://staging-gateway.matters.town/users/charlesmungerai/outbox",
      "outboxTotalItems": 3,
      "outboxFirstActor": "https://staging-gateway.matters.town/users/charlesmungerai"
    },
    "misskey": {
      "baseUrl": "https://gyutte.site",
      "operatorProfileUrl": "https://gyutte.site/@mashbean",
      "resolveMethod": "users/show-after-ap-show-error",
      "apShowError": "POST https://gyutte.site/api/ap/show failed with 400 {\"error\":{\"message\":\"Request failed.\",\"code\":\"REQUEST_FAILED\",\"id\":\"81b539cf-4f57-4b29-bc98-032c33c0792e\",\"kind\":\"client\"}}",
      "resolvedUserId": "819deadf89cdd644e21be202",
      "resolvedUsername": "charlesmungerai",
      "resolvedHost": "staging-gateway.matters.town",
      "resolvedUrl": "https://staging-gateway.matters.town/@charlesmungerai",
      "followResponse": {
        "id": "819deadf89cdd644e21be202",
        "alreadyFollowing": false,
        "username": "charlesmungerai",
        "host": "staging-gateway.matters.town"
      },
      "relation": {
        "id": "819deadf89cdd644e21be202",
        "following": null,
        "isFollowing": false,
        "isFollowed": false,
        "hasPendingFollowRequestFromYou": true,
        "hasPendingFollowRequestToYou": false,
        "isBlocking": false,
        "isBlocked": false,
        "isMuted": false,
        "isRenoteMuted": false
      }
    }
  }
}
```

## Next Steps

- Keep GoToSocial deferred by current decision.
- Before production rollout, replace the staging host with the approved canonical identity plan and complete author opt-in / legal gates.
