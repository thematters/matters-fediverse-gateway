# Handoff

## 交付來源

- 階段  
  `stage02_upstream_inventory`
- 代理人  
  `codex-local`
- 日期  
  `2026-03-20`

## 交付內容摘要

- 已把 `ipns-site-generator` 的實際輸出、型別限制與測試覆蓋補進 upstream inventory
- 已確認這條實作線目前屬於靜態 publisher，不是完整 federation server
- 已確認幾個高價值缺口  
  outbox `id` 使用 actor URL  
  `publicKey` 沒有真實 key material  
  tests 只驗 WebFinger  
  `followers.jsonld` 只被引用，未被生成

## 已確認事項

- WebFinger subject 與 aliases 的實際形狀
- actor、outbox、article object 的核心欄位
- `webfDomain` 與 `ipnsKey` 在型別上是 optional
- `Note` + `title<br>summary` 是目前文章輸出策略

## 待處理事項

- 驗證 `inbox.jsonld` 是否在別的服務層被真正接住
- 釐清 canonical actor URL 與 alias rule
- 決定 `Note` 是否要改成 `Article` 或混合策略
- 把這些發現轉成更精確的互通測試案例

## 推薦下一手

- 建議接手代理人  
  `protocol_gap_analyst`
- 建議優先處理順序  
  先把 stage02 發現同步到 stage03 matrix  
  再規劃最小 interoperability test
