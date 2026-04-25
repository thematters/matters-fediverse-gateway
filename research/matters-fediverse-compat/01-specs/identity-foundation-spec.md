# Identity Foundation Spec

## Goal

把 Matters 的 fediverse 身分規則固定成一個可實作、可驗證、可 handoff 的工程基線，避免 actor URL、WebFinger subject、aliases、followers collection 與 key material 的責任邊界繼續漂移。

## Why This Task Comes First

- 現有 research 已確認 actor ID 與 object URL 都偏向 `webfDomain`
- WebFinger 已同時暴露 `webfDomain`、`matters.town/@user`、IPNS URL 三條路徑
- `webfDomain` 在型別上是 optional，但 ActivityPub 輸出時被直接拿來組 URL
- 若 canonical identity 沒先固定，後面的 followers collection、key material、inbox bridge 都會建立在不穩定基底上

## Decisions

### Canonical actor URL

- canonical actor URL 固定為 `https://<webfDomain>/about.jsonld`
- 這個值是唯一 actor ID
- `https://<webfDomain>/outbox.jsonld` 必須是 outbox ID，不能再沿用 actor URL

### WebFinger subject

- WebFinger subject 固定為 `acct:<userName>@<webfDomain>`
- `userName` 與 `webfDomain` 都必須存在，否則不生成 ActivityPub bundle

### Alias policy

- `https://<webfDomain>` 是 canonical profile page
- `https://matters.town/@<userName>` 只能作為 alias
- `https://<ipnsKey>.ipns.cf-ipfs.com` 只能作為 alias
- IPNS URL 不可直接作為 canonical actor URL

### Followers collection

- followers collection URL 固定為 `https://<webfDomain>/followers.jsonld`
- 若這個 collection 尚未被真正提供，就不能宣稱 federation-ready

### Key material

- actor `publicKey` 不可只有 `id` 與 `owner`
- 真正可驗章的 key material 必須由 bridge 或等價服務提供
- 若 key material 缺失，actor 只能視為 discoverable publisher，不能視為完整 federated actor

## Validation Rules

- `webfDomain` 必填，且不可為空字串
- `userName` 必填，且不可含會破壞 `acct:` subject 的字元
- `outbox.id` 必須等於 `https://<webfDomain>/outbox.jsonld`
- `about.jsonld.id` 與 `outbox.id` 不可相同
- `followers.jsonld` 若被引用，就必須有實際對應輸出或服務端 endpoint
- aliases 只允許 profile / fallback URL，不得新增第二個 primary actor ID

## Non-Goals

- 這個 task 不負責完整 inbox implementation
- 這個 task 不負責 reply / like / announce 映射
- 這個 task 不處理加密 / 付費內容如何進 federation，該議題維持上一輪研究結論  
  加密 / 付費 / 私密內容不直接 federation

## Acceptance

- 有一份明確 identity spec 可供工程 agent 直接照做
- task note 與 current pointer 都指向這個工程 task
- 後續工程 task 可以直接從這份 spec 拆出  
  followers collection  
  key material  
  inbox bridge  
  object mapping testbed
