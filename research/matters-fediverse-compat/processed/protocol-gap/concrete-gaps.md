# Concrete Protocol Gaps

## Gap 1 — `followers.jsonld` 被引用但沒有生成

觀察

- `src/makeHomepage/index.ts` 會把每篇 `Create` activity 的 `cc` 指到 `https://<webfDomain>/followers.jsonld`
- 但 `makeActivityPubBundles` 實際只回傳三個 bundle  
  `.well-known/webfinger`  
  `about.jsonld`  
  `outbox.jsonld`

影響

- 遠端 instance 若依 `cc` 或 actor 關聯去抓 follower collection，會遇到缺漏路徑
- 這不只是「缺功能」，而是目前輸出的靜態物件已經引用了一個本 repo 不會生成的資源

最低補法

- 若要維持靜態 publisher 路線，至少要明確移除這個引用或由 bridge / external service 實際提供 collection endpoint

## Gap 2 — `publicKey` 沒有可驗章的 key material

觀察

- actor `publicKey` 目前只有 `id` 與 `owner`
- 沒有 `publicKeyPem` 或其他可被遠端直接拿來驗章的材料

影響

- 即使後續補了 outbound signing 或 inbound verification，actor representation 目前也不足以支援遠端驗章
- 這代表完整 federation 所需的 key lifecycle 不是「尚未接線」而已，而是 actor payload 本身也不完整

最低補法

- 定義 key material 來源與 rotation 規則
- 在 actor representation 補完整 public key payload，並和 signer 實作綁定

## Gap 3 — `published` 依賴 optional `createdAt`

觀察

- `HomepageArticleDigest` 把 `createdAt` 定義成 optional
- 但 `makeActivityPubBundles` 產生 `Create.published` 與 object `published` 時使用的是 `createdAt`，不是 `date`
- actor `published` 又依賴 outbox 第一筆 object 的 `published`，缺值時才退回 build 時間

影響

- 若上游只提供 `date` 沒提供 `createdAt`，ActivityPub 活動與物件的時間欄位會消失
- actor `published` 會退回 build 當下時間，這會讓遠端看到和文章真實發佈時間無關的 actor published 值

最低補法

- 在型別層把 `createdAt` 改成 ActivityPub path 的必填值，或在 builder 內對 `date` / `createdAt` 做一致化 fallback
- 補 timestamp validation，避免產生無時間戳的 activity

## Why These Three Matter First

- 它們都不是抽象的規格缺口，而是從現有 bundle 輸出就能直接觀察到的 concrete 問題
- 這三項先修，後續再談 bridge、signatures、followers state 與互動回流才有穩固基線
