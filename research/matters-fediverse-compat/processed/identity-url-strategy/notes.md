# Identity And URL Strategy Notes

## Identifiers To Reconcile

- `acct:<user>@<webfDomain>`
- `https://<webfDomain>/about.jsonld`
- `https://matters.town/@<user>`
- `https://<ipnsKey>.ipns.cf-ipfs.com`

## Key Questions

- 哪一個是 canonical actor URL
- 哪一些只是 alias
- WebFinger subject 是否固定綁定 `webfDomain`
- 作者若有自訂網域，如何與 `matters.town`、IPNS 路徑協調

## Evidence From Code

- `src/makeHomepage/index.ts` 以 `https://<webfDomain>/about.jsonld` 當 actor ID
- 同一支程式用 `https://<webfDomain>` 當 WebFinger profile-page link
- WebFinger `subject` 是 `acct:<user>@<webfDomain>`
- WebFinger `aliases` 目前包含 `https://<webfDomain>`、`https://<ipnsKey>.ipns.cf-ipfs.com`、`https://matters.town/@<user>`
- `byline.author.uri` 與 `articles[].sourceUri` 只出現在 JSON Feed / HTML 相關欄位，沒有拿來當 ActivityPub actor 或 object ID
- actor context 定義了 `alsoKnownAs` 映射，但實際 payload 沒有填入 `alsoKnownAs` 值

## Working Assumption

- 依現有程式邏輯，canonical actor identity 明顯偏向 `https://<webfDomain>/about.jsonld`
- `https://<webfDomain>` 是對外 profile page URL
- `https://matters.town/@<user>` 較適合當 product profile alias
- IPNS gateway URL 較適合做內容分發或 fallback，不宜承擔主要 actor identity

## Federation Risks

- 若 `webfDomain` 不穩定，actor ID 就會漂移
- 若 `matters.town/@<user>` 仍被產品面當成主要身份，會和 WebFinger subject 的主身份產生分裂
- actor payload 未真正輸出 `alsoKnownAs`，遠端只能從 WebFinger `aliases` 推測身份關係
- object URL 與 `sourceUri` 分離，可能讓遠端 instance 把 `webfDomain` 文章頁當成 canonical，而不是 Matters 原始頁面
