# Static Outbox Adapter Contract

## Goal

定義 gateway 讀取 `ipns-site-generator` 靜態 ActivityPub outbox 時，最小且安全的 adapter contract。

## Upstream Findings

- `external/ipns-site-generator/src/makeHomepage/index.ts` 會輸出三個 ActivityPub 相關靜態檔案  
  `.well-known/webfinger`  
  `about.jsonld`  
  `outbox.jsonld`
- `outbox.jsonld` 是唯一穩定且直接適合給 gateway 當 read-facing source 的檔案
- collection 內的 item 目前是 `Create` activity
- `Create.object.type` 目前固定是 `Note`，不是 `Article`
- legacy actor URL 目前是 `https://<webfDomain>/about.jsonld`
- `Create.cc` 目前會指向 `https://<webfDomain>/followers.jsonld`

## Minimal Required Fields

gateway 只應依賴這些欄位

- top-level  
  `@context`  
  `type`  
  `orderedItems`
- per item  
  `type`  
  `published`  
  `object`
- per object  
  `id`  
  `type`  
  `published`  
  `url`  
  `content` 或 `summary`  
  `tag`

## Rewrite Rules

gateway 對外回應 canonical actor outbox 時，必須重寫這些欄位

- collection `id`  
  改成 `https://<instance-domain>/users/<handle>/outbox`
- item `actor`  
  改成 `https://<instance-domain>/users/<handle>`
- item `cc`  
  改成 `https://<instance-domain>/users/<handle>/followers`
- object `attributedTo`  
  改成 `https://<instance-domain>/users/<handle>`

## Non-Dependencies

第一版 adapter 不應依賴這些欄位

- `about.jsonld` 的 legacy actor identity
- `publicKey`
- `inbox.jsonld`
- `followers.jsonld` 的靜態存在與否

## Safety Notes

- upstream 目前輸出 `Note`，所以 gateway 不能假設 long-form object 已經是 `Article`
- 若 `outbox.jsonld` 缺失或格式不合法，gateway 應視為 upstream static publisher 不可用，而不是自行猜測文章清單
- `paid`、`private`、`encrypted` 內容不得透過這個 adapter 暴露給外部
