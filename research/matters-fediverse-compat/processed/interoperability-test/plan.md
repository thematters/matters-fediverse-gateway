# Interoperability Test Plan

## Goals

- 驗證 Matters 官方 instance 對真實 fediverse software 的 discovery、social loop 與 moderation readiness
- 驗證 gateway 補上後，Matters 是否能從 discoverable publisher 升級為可互動 federated actor

## Test Groups

1. Discovery
   WebFinger、actor、NodeInfo、host-meta、一致性與 alias 行為
2. Identity
   actor ID、outbox ID、followers/following URL、publicKey、canonical profile URL
3. Inbox Core
   Follow、Accept、Reject、簽章驗證、重放防護、錯誤處理
4. Followers State
   follow / undo / unfollow 後 collection 與內部 state 是否一致
5. Social Loop
   reply、mention、like、announce、undo、update、delete 的雙向映射
6. Moderation
   domain block、account suspend、rate limit、dead letter、legal takedown
7. Boundary
   paid、private、encrypted 內容不對外 discover、不進 outbox、不被遠端互動

## Validation Focus

- content negotiation
- canonical identity consistency
- key material availability
- HTTP signatures inbound verification and outbound signing
- follower state persistence
- event delivery retry 與 dead letter observability
- Mastodon 黑箱接受度
- 非公開內容邊界
