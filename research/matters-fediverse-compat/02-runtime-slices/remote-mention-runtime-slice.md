# Remote Mention Runtime Slice

## Scope

把 `Stage 04` 再往前推到最小 remote acct mention resolution。這一輪的目標，是讓 outbox create / engagement 不只會處理本地 mention，也能把 `@user@remote-domain` 透過 WebFinger 類型 lookup 轉成 canonical actor URL。

## Landed In This Slice

- `remote-actors` directory 現在支援 `resolveAccount()`
  會先做 remote account lookup
  再接 actor document resolution
- outbound `Create` 現在可從
  `payload.mentions`
  object `tag`
  object `content`
  收斂 remote acct mention
- outbound `Like` / `Announce` / generic `engagement`
  現在也能接受 remote acct mention 作為 target hint
- local conversation projection 現在補上 `engagementCounts`
  提供最小 conversation-level action matrix baseline

## Runtime Surfaces

- `resolveAccount()`
- `POST /users/<handle>/outbox/create`
- `POST /users/<handle>/outbox/like`
- `POST /users/<handle>/outbox/announce`
- `POST /users/<handle>/outbox/engagement`

## Verification

- `cd gateway-core && npm test`
  已覆蓋
  remote acct mention lookup
  remote mention tag rewrite
  conversation engagement count
- `cd gateway-core && npm run check:local-sandbox`
  既有 discoverability 與 `Follow -> Accept` 鏈路仍正常

## Remaining Gaps

- remote acct mention 目前主要用於 outbound surface，inbound 歷史資料仍不會主動補做 remote mention discovery
- remote mention resolution 還沒有 retry policy、cache policy 指標與 error taxonomy
- conversation-level action matrix 目前只有 like / announce count，還沒有更細的 domain model mapping
