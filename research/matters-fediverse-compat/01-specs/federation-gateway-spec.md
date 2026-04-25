# Federation Gateway Spec

## Goal

定義 Matters federation gateway 的責任邊界，讓外部互通、簽章、收件、投遞、followers state 與錯誤處理有單一 owner。

## Responsibilities

- 提供 `/.well-known/webfinger`
- 提供 actor、outbox、inbox、sharedInbox、followers、following、NodeInfo、host-meta
- 驗證 inbound HTTP signatures，簽發 outbound requests
- 維護 followers state、delivery queue、retry、dead letter
- 執行 content negotiation 與 representation routing
- 維護 actor key material、rotation policy、signature audit trail

## Non-Responsibilities

- 不直接承擔長文靜態輸出生成
- 不處理 paid、private、encrypted 內容授權
- 不替代完整 CMS 或寫作後台

## Interface Decisions

- actor canonical ID 依 `identity-discovery-spec.md`
- outbox 為 read-facing collection，inbox/sharedInbox 為 write-facing dynamic endpoint
- followers/following 由 gateway 管理實際 state 與對外 collection
- publicKey 與 key rotation policy 由 gateway 或其等價 signer service 提供
- queue、retry、dead letter 需有可觀測欄位與 audit path

## Endpoint Surface

- `GET /.well-known/webfinger`
- `GET /users/<handle>`
- `GET /users/<handle>/outbox`
- `POST /users/<handle>/inbox`
- `GET /users/<handle>/followers`
- `GET /users/<handle>/following`
- `POST /inbox`
- `GET /.well-known/nodeinfo`
- `GET /nodeinfo/2.1`

## Queue And State Model

- inbound queue
  收件、驗章、去重、事件分類
- outbound queue
  delivery fan-out、retry、dead letter、manual replay
- follower state
  follow relationship、sharedInbox target、last delivery status
- signature state
  active key、rotation history、verification failure log

## Failure Model

- 簽章驗證失敗要拒絕並記錄來源與原因
- delivery 失敗要區分暫時性與永久性
- replay 與重複 event 要可去重
- downstream unavailable 時可退化成 discoverable publisher，但不得偽裝成 fully federated actor

## Minimum Implementation Slice

- 可接收 `Follow`
- 可驗證 HTTP Signatures
- 可回 `Accept` 或 `Reject`
- 可寫入 followers state
- 可對單一公開 actor 進行 outbound delivery

## Acceptance

- gateway endpoint surface 有單一責任圖
- inbox、sharedInbox、followers、key material owner 明確
- reviewer 可依這份 spec 建立最小 follow flow 驗收
- ops reviewer 可依這份 spec 檢查 retry、dead letter、audit log 基線
