# Governance Risk Memo

## Moderation And Abuse Intake

- 一旦支援完整 federation，Matters 就需要承接遠端檢舉、內容下架與帳號處置
- 研究問題是現有治理流程能否處理跨 instance case
- 最低控制措施是 abuse intake、case log、處置狀態與 escalation 規則

## Domain Policy

- 完整 federation 需要 allow / deny 與 selective federation policy
- 研究問題是 policy enforcement 要放在哪一層
- 最低控制措施是 domain allow / deny list、例外機制與 audit log

## Delete And Update Propagation

- 刪文、改文與撤回會牽涉遠端投遞與快取失效
- 研究問題是站內刪改模型如何映射到 `Update`、`Delete`、`Undo`
- 最低控制措施是 propagation queue、retry、tombstone 與 failure logging

## Spam And Trust Boundary

- inbox 一旦開放，spam、惡意互動與大量無效活動都會進入系統
- 研究問題是需要哪些 instance reputation、rate limit 與人工審查手段
- 最低控制措施是 rate limit、queue、重複偵測與封鎖機制

## Paid / Encrypted / Private Content

- fediverse 的公開傳播模式不適合直接承接付費文、加密文與限定受眾內容
- 研究問題是哪些內容必須排除，哪些只能輸出摘要與 canonical link
- 最低控制措施是第一階段只 federate 公開文章，其他類型預設不輸出或只輸出 preview

## Identity Spoofing And Canonical Drift

- 目前 actor 主身份綁在 `webfDomain`，但產品上的可見身份很可能仍是 `matters.town/@username`
- 研究問題是 product identity 與 federation identity 是否會長期分裂
- 最低控制措施是明確 canonical actor rule、穩定的 `webfDomain` 管理流程，以及一致的 alias policy

## Missing Followers Collection

- outbox 已經把 `cc` 指向 `followers.jsonld`，但 bundle 本身沒有產出該 collection
- 研究問題是這個 collection 要由 bridge 補，還是由其他 service 補
- 最低控制措施是先定義唯一的 follower state owner，避免 collection URL 存在但狀態不存在

## Missing Key Material

- actor payload 只有 `publicKey.id` 與 `owner`，沒有可驗章的 key material
- 研究問題是簽章、key lifecycle 與 rotation 要由哪個系統負責
- 最低控制措施是把 key management 明確放進 bridge 或 federation layer，不讓靜態 actor 假裝已可驗證

## Source URL Divergence

- ActivityPub object URL 目前使用 `webfDomain` 路徑，不是 `articles[].sourceUri`
- 研究問題是遠端 instance 會把哪個 URL 視為 canonical article
- 最低控制措施是定義 canonical content URL 與 fallback URL 規則，避免 SEO、分享與刪改傳播的身份分裂
