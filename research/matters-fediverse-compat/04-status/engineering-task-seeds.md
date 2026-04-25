# Engineering Task Seeds

## Task 1

- 名稱  
  `instance-platform-foundation`
- 目標  
  建立官方 instance config schema 與對外平台身分
- 交付  
  instance platform spec、NodeInfo 欄位、federation policy、launch baseline

## Task 2

- 名稱  
  `identity-discovery-hardening`
- 目標  
  固定 actor ID、WebFinger subject、alias policy、followers URL 與 key ownership
- 交付  
  identity and discovery spec、review gate、最小 discovery 驗收

## Task 3

- 名稱  
  `gateway-core-minimum-slice`
- 目標  
  定義並實作最小 federation gateway core，先支援公開內容的 follow flow
- 交付  
  inbox/sharedInbox API、signature verification、delivery queue、followers state、failure logging

## Task 4

- 名稱  
  `social-interactions-loop`
- 目標  
  建立 reply、mention、like、announce、undo、update、delete 的雙向映射
- 交付  
  social interoperability spec、長文 mapping 決策、Mastodon 黑箱測試案例

## Task 5

- 名稱  
  `moderation-ops-baseline`
- 目標  
  建立 instance 對外互通時最基本的 moderation 與營運控制面
- 交付  
  domain block、account suspend、rate limit、abuse queue、audit log、legal takedown、runbook

## Task 6

- 名稱  
  `multi-instance-control-plane-pilot`
- 目標  
  用第二個測試 instance 驗證 registry、queue partition、audit partition、key scope 與 policy scope 隔離
- 交付  
  registry storage、instance config loader、partition validation、隔離測試案例

## Task 7

- 名稱  
  `launch-readiness-harness`
- 目標  
  建立可重跑的 Mastodon 黑箱驗收與 go / no-go checklist
- 交付  
  discovery test、follow flow test、social loop test、boundary test、moderation test、runbook
