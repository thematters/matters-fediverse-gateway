# Misskey Interop Run 20260502

## Summary

- Status: `passed`
- Implementation: `Misskey`
- Instance: https://gyutte.site
- Operator account URL: https://gyutte.site/@mashbean
- Gateway public URL: https://staging-gateway.matters.town
- Gateway actor: alice
- Gateway commit: `e6f3b27`
- Started at: 2026-05-02T15:21:17Z
- Completed at: 2026-05-02T15:21:20Z

## Safety Record

- Token values are not included in this report.
- Raw probe output is stored outside tracked files unless an operator explicitly archives a sanitized copy.
- This run covers resolve / follow / relationship checks only; it does not post, reply, like, boost, or send private messages.

## Result

- Probe result: `passed`
- WebFinger subject: acct:alice@staging-gateway.matters.town
- Actor ID: https://staging-gateway.matters.town/users/alice
- Outbox ID: https://staging-gateway.matters.town/users/alice/outbox
- Outbox total items: `2`
- Remote resolved account ID: 819de942919635b36b66e65d
- Remote resolved account URL: https://staging-gateway.matters.town/@alice
- Follow response: `{"id":"819de942919635b36b66e65d","alreadyFollowing":true,"username":null,"host":null}`
- Relationship state: `{"id":"819de942919635b36b66e65d","following":{"id":"819de946585a5fbe713552b4","followeeId":"819de942919635b36b66e65d","followerId":"819de678273e9b120fd654b5","isFollowerHibernated":false,"withReplies":false,"notify":null,"followerHost":null,"followerInbox":null,"followerSharedInbox":null,"followeeHost":"staging-gateway.matters.town","followeeInbox":"https://staging-gateway.matters.town/users/alice/inbox","followeeSharedInbox":"https://staging-gateway.matters.town/inbox"},"isFollowing":true,"isFollowed":false,"hasPendingFollowRequestFromYou":false,"hasPendingFollowRequestToYou":false,"isBlocking":false,"isBlocked":false,"isMuted":false,"isRenoteMuted":false}`

## Failures

- none

## Evidence

- Raw probe output file: `/Users/mashbean/Documents/Codex/2026-04-30/files-mentioned-by-the-user-matters/repos/matters-fediverse-gateway/gateway-core/runtime/interop/misskey-raw-20260502T152117Z.json`
- Raw probe output SHA-256: `2330e19cbbfc0bbfb477562816e7d3214a01fc0f6d8352776bf5c1e94d0e9eb2`

## Sanitized Payload

```json
{
  "ok": true,
  "failures": [],
  "report": {
    "discovery": {
      "subject": "acct:alice@staging-gateway.matters.town",
      "actorHref": "https://staging-gateway.matters.town/users/alice",
      "actorId": "https://staging-gateway.matters.town/users/alice",
      "followers": "https://staging-gateway.matters.town/users/alice/followers",
      "outboxId": "https://staging-gateway.matters.town/users/alice/outbox",
      "outboxTotalItems": 2,
      "outboxFirstActor": "https://staging-gateway.matters.town/users/alice"
    },
    "misskey": {
      "baseUrl": "https://gyutte.site",
      "operatorProfileUrl": "https://gyutte.site/@mashbean",
      "resolveMethod": "users/show-after-ap-show-error",
      "apShowError": "POST https://gyutte.site/api/ap/show failed with 400 {\"error\":{\"message\":\"Request failed.\",\"code\":\"REQUEST_FAILED\",\"id\":\"81b539cf-4f57-4b29-bc98-032c33c0792e\",\"kind\":\"client\"}}",
      "resolvedUserId": "819de942919635b36b66e65d",
      "resolvedUsername": "alice",
      "resolvedHost": "staging-gateway.matters.town",
      "resolvedUrl": "https://staging-gateway.matters.town/@alice",
      "followResponse": {
        "id": "819de942919635b36b66e65d",
        "alreadyFollowing": true,
        "username": null,
        "host": null
      },
      "relation": {
        "id": "819de942919635b36b66e65d",
        "following": {
          "id": "819de946585a5fbe713552b4",
          "followeeId": "819de942919635b36b66e65d",
          "followerId": "819de678273e9b120fd654b5",
          "isFollowerHibernated": false,
          "withReplies": false,
          "notify": null,
          "followerHost": null,
          "followerInbox": null,
          "followerSharedInbox": null,
          "followeeHost": "staging-gateway.matters.town",
          "followeeInbox": "https://staging-gateway.matters.town/users/alice/inbox",
          "followeeSharedInbox": "https://staging-gateway.matters.town/inbox"
        },
        "isFollowing": true,
        "isFollowed": false,
        "hasPendingFollowRequestFromYou": false,
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

- Complete display checks manually only if public screenshots are approved.
- Use a separate GoToSocial account/token before running GoToSocial public interop.
