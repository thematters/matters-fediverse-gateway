# Identity And Discovery Spec

## Goal

把 Matters 的 external identity 收斂成 instance-first、單一 canonical actor ID 的 discovery 規格，讓 gateway、reviewer 與外部 instance 不需要再猜哪個 URL 才是真正主身分。

## Canonical Identity

- actor canonical ID 固定為 `https://<instance-domain>/users/<handle>`
- profile page 固定為 `https://<instance-domain>/@<handle>`
- outbox 固定為 `https://<instance-domain>/users/<handle>/outbox`
- followers 固定為 `https://<instance-domain>/users/<handle>/followers`
- following 固定為 `https://<instance-domain>/users/<handle>/following`
- WebFinger subject 固定為 `acct:<handle>@<instance-domain>`

## Alias Policy

允許的 alias 類型如下

- `https://matters.town/@<handle>`
- `https://<webfDomain>`
- `https://<ipns-host>/<path>`

限制如下

- alias 只能出現在 `alsoKnownAs` 或 profile links
- alias 不得再被宣告為第二個 primary actor ID
- legacy `about.jsonld` 與 `outbox.jsonld` 若保留，必須回指 canonical actor，而非自稱主 actor

## Discovery Surface

- `/.well-known/webfinger` 由 gateway 提供
- actor document 由 gateway 提供
- profile page 可由前台或靜態頁面提供，但必須回指 canonical actor
- NodeInfo、host-meta 與 actor URL 必須落在同一個 instance domain

## Key Ownership

- actor `publicKey` 由 gateway 或 signer service 實際提供
- key rotation 由 gateway 管理
- key material 不可由 `ipns-site-generator` 以靜態檔案假裝存在

## Validation Rules

- `handle` 必填且在同一 instance 內唯一
- `instance-domain` 必填且為唯一 WebFinger host
- actor `id`、`inbox`、`outbox`、`followers`、`following` 必須全在同一 instance domain
- key material 缺失時，不得把該帳號標示成 fully federated actor
- followers collection 不存在時，不得宣稱支援完整 social follow loop

## Migration Rule

- 現有 `identity-foundation-spec.md` 作為研究與 transition artifact
- 正式對外 discoverability 一律以 instance-domain actor 為主
- migration 期間不得同時暴露兩個可 follow 的 primary actor

## Acceptance

- Mastodon 對 `acct:<handle>@<instance-domain>` 的查詢只會解析到單一 actor
- actor document、WebFinger、profile 頁與 followers URL 規則完全一致
