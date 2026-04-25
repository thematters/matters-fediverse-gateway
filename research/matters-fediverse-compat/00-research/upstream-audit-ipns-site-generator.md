# Upstream Audit Notes

## Repo Identity

- Repo  
  `external/ipns-site-generator/`
- Current local HEAD  
  `f860a4c`

## Confirmed From Code

- README 明確寫出此套件會產生文章頁、作者首頁與 static ActivityPub files，再上傳到 IPFS / IPNS
- `src/makeHomepage/index.ts` 會輸出三類關鍵檔案  
  `.well-known/webfinger`  
  `about.jsonld`  
  `outbox.jsonld`
- actor 類型是 `Person`
- outbox 目前是 `OrderedCollection`
- 每篇文章被包成 `Create` activity，object 類型是 `Note`
- actor payload 會宣告 `inbox` 與 `publicKey`，但在這個 repo 看不到實作接收、驗證與處理請求的動態 server 能力

## Early Interpretation

- 目前證據支持 Matters 已具備靜態發佈與 discoverability 的基線
- 目前證據不支持它已具備完整 federation
- 最需要追查的缺口是 inbound handling、followers state、signatures、content negotiation、互動回流與治理 hook

## Follow-up Questions

- `inbox.jsonld` 是否由別的 service 接住
- `webfDomain`、`ipnsKey`、`matters.town/@username` 之間的 canonical 規則是什麼
- `Note` 是否足以承載 Matters 長文、付費文、加密文與更新刪除需求
