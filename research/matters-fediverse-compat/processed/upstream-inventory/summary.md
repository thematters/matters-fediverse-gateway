# Upstream Inventory Summary

## Current Reading

- `external/ipns-site-generator/README.md`
- `external/ipns-site-generator/src/makeHomepage/index.ts`
- `external/ipns-site-generator/src/types.ts`
- `external/ipns-site-generator/src/render/mock.ts`
- `external/ipns-site-generator/src/__tests__/makeHomepage.test.ts`
- `external/ipns-site-generator/src/__tests__/__snapshots__/makeHomepage.test.js.snap`
- Matters Lab 的 Meson 文章

## Confirmed Capabilities

- `ipns-site-generator` 會產生 `.well-known/webfinger`
- actor profile 會輸出到 `about.jsonld`
- outbox 會輸出到 `outbox.jsonld`
- 每篇文章目前被包成 `Create` activity，object 使用 `Note`
- actor payload 已宣告 `inbox`、`outbox` 與 `publicKey`
- actor ID、profile page 與 article object URL 都由 `webfDomain` 組出
- WebFinger alias 已包含 `https://<webfDomain>`、IPNS gateway URL 與 `https://matters.town/@<user>`

## Current Interpretation

- 這條實作線已經跨進 fediverse discoverability 與只讀發佈的範圍
- 這條實作線尚不足以支撐完整 federation
- canonical identity 目前更偏向 `webfDomain`，不是 `matters.town/@user`
- `matters.town/@user` 與 IPNS URL 比較像 alias 與 fallback 路徑
- 現階段最適合把它視為靜態發佈層，再評估是否需要 bridge 或完整動態 federation layer
- 目前靜態輸出本身也有幾個 concrete gap  
  `followers.jsonld` 被引用但未生成  
  `publicKey` 沒有 key material  
  `published` 依賴 optional `createdAt`

## Open Questions

- `inbox.jsonld` 是否由外部 service 處理
- `webfDomain` 與 `matters.town/@username`、IPNS 網址的 canonical 規則是什麼
- `Note` 是否足以承載長文與後續刪改傳播需求
- 為什麼 outbox 會引用 `followers.jsonld`，但 bundle 並沒有產出對應 collection
