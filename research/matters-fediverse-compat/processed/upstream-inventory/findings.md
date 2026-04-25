# Upstream Inventory Findings

## 核心事實

- `external/ipns-site-generator/README.md` 明確寫出這個套件會為 `matters.town` 產生 HTML、作者首頁與 static ActivityPub files，再上傳到 IPFS / IPNS
- `external/ipns-site-generator/src/makeHomepage/index.ts` 已確認產出  
  `.well-known/webfinger`  
  `about.jsonld`  
  `outbox.jsonld`
- actor 類型是 `Person`
- outbox 類型是 `OrderedCollection`
- 每篇文章會被包成 `Create` activity，object 類型是 `Note`
- actor payload 內已宣告 `inbox`、`outbox`、`publicKey` 與 `alsoKnownAs` 相關欄位
- `makeActivityPubBundles` 實際只回傳三個 bundle path  
  `.well-known/webfinger`  
  `about.jsonld`  
  `outbox.jsonld`
- `outbox` 內會把 `cc` 指到 `https://<webfDomain>/followers.jsonld`，但 bundle 本身不會生成 `followers.jsonld`
- `publicKey` 只有 `id` 與 `owner`，沒有 `publicKeyPem` 或其他可驗章的 key material
- `HomepageContext` 的文章型別把 `createdAt` 設成 optional，但 `makeActivityPubBundles` 發布時間使用的是 `createdAt`，不是 `date`
- 本地 build 後直接生成 bundle 可確認  
  actor `id` 是 `https://example.eth.limo/about.jsonld`  
  outbox `id` 也被設成同一個 actor URL  
  object `type` 固定是 `Note`  
  object `content` 只包含 `title<br>summary`，不是全文內容

## 直接影響 ActivityPub 輸出的輸入欄位

- `byline.author.webfDomain`  
  用來決定 actor URL、文章 URL、WebFinger subject、aliases、inbox、outbox 與 followers collection 的主網域
- `byline.author.userName`  
  用在 WebFinger subject、`matters.town/@username` alias 與 `preferredUsername`
- `byline.author.displayName`  
  用在 actor `name`
- `byline.author.description`  
  用在 actor `summary`
- `byline.author.ipnsKey`  
  用在 WebFinger aliases 裡的 `*.ipns.cf-ipfs.com`
- `meta.image`  
  用在 actor `icon`
- `articles[].id`、`articles[].slug`、`articles[].title`  
  用來組文章 URL 與 outbox item
- `articles[].summary`  
  用在 object `summary` 與 `content`
- `articles[].createdAt`  
  用在 `Create.published` 與 object `published`
- `articles[].tags`  
  用在 object `tag`

## 對 ActivityPub 沒有直接作用的欄位

- `HomepageContext.meta.title`、`meta.description`、`meta.siteDomain`、`meta.authorName`  
  這些會影響首頁 HTML / feed，不直接進 ActivityPub bundle
- `byline.author.name`、`byline.author.uri`  
  型別上存在，但 ActivityPub bundle 內實際取的是 `displayName` 與 `webfDomain`
- `articles[].uri`、`articles[].sourceUri`  
  會進 JSON Feed，不會進目前的 ActivityPub outbox object

## 型別與實作落差

- `src/types.ts` 內的 `webfDomain` 與 `ipnsKey` 都是 optional
- 但 `src/makeHomepage/index.ts` 生成 ActivityPub bundle 時，`webfDomain` 其實被當成必填使用
- 這代表 ActivityPub 路徑目前缺少型別保護與顯式驗證，若 `webfDomain` 缺失，輸出會直接變成 `https://undefined/...`

## 測試覆蓋現況

- `src/__tests__/makeHomepage.test.ts` 有測 `makeActivityPubBundles`
- 但測試只把 `.well-known/webfinger` 拉出來做 snapshot
- 目前看不到 `about.jsonld` 或 `outbox.jsonld` 被直接 snapshot 或逐欄位斷言
- 因此 actor 與 outbox 的預期形狀主要仍是由實作檔保證，不是由測試明確鎖定

## repo 內沒有看到的線索

- repo-wide 搜尋沒有找到任何 `sharedInbox`、`following.jsonld`、`well-known/nodeinfo`、HTTP signature handling 或 follower state storage
- `inbox.jsonld` 與 `followers.jsonld` 只出現在 `src/makeHomepage/index.ts` 的字串輸出
- 目前沒有證據顯示 inbox、followers 或 signatures 在這個 repo 的其他檔案中被實作或委派

## 目前最重要的解讀

- Matters 已經有 fediverse discoverability 與 read-only 發佈的技術證據
- 目前沒有看到完整 federation 必要的動態處理能力
- 這條路線比較像靜態 publisher，而不是完整 instance 或 full ActivityPub server
- 現有輸出不只是缺動態能力，連靜態物件本身也有幾個會讓遠端 instance 卡住或降級處理的地方

## 已看見的正向訊號

- 有 WebFinger
- 有 actor profile
- 有公開 outbox
- 有 alias 與網址映射線索
- 有把內容發佈成可被遠端抓取的活動集合

## 關鍵缺口

- 沒有看見 inbox request handling
- 沒有看見 followers / following 的狀態儲存
- 沒有看見 HTTP Signatures 驗證流程
- 沒有看見 sharedInbox、NodeInfo、instance metadata
- 沒有看見 reply、mention、like、announce 的互動回流能力
- 沒有看見 delete / update propagation 的處理策略
- 沒有生成 `followers.jsonld`，卻已在 outbox 的 `cc` 中引用它
- `publicKey` 缺少實際 key material，遠端無法用它完成簽章驗證
- `outbox.id` 目前不是 `https://<webfDomain>/outbox.jsonld`，而是 actor URL
- 若上游呼叫端只提供 `date` 沒提供 `createdAt`，activity 與 object 的 `published` 會消失，actor `published` 會退回 build 時間
- 測試只 snapshot WebFinger，沒有對 `about.jsonld` 與 `outbox.jsonld` 做內容斷言

## 關鍵未解問題

- `inbox.jsonld` 只是宣告路徑，還是有外部 service 真正接住
- `webfDomain`、`ipnsKey`、`matters.town/@username` 之間的 canonical 規則是什麼
- 長文、付費文、加密文與刪改文如何映射到 ActivityStreams
- `followers.jsonld`、`following.jsonld` 是否由外部服務補出，還是目前根本不存在
- actor `publicKey` 的實際 key material 應該由哪個系統提供
