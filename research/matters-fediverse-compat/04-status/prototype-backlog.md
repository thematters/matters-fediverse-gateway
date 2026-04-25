# Prototype Backlog

## P0

- 建立官方 instance platform config schema 與 NodeInfo 對外欄位
- 固定 canonical actor URL、WebFinger subject、alias policy、followers URL 與 key ownership
- 定義 gateway inbox、sharedInbox、HTTP signatures、delivery queue 與 follower state
- 明定 public 內容可 federation，paid、private、encrypted 內容不可 federation
- 建立 Mastodon discovery 與 follow acceptance 黑箱驗收
- 建立 stage brief、review gate 與 handoff 模板，讓多 agent 可直接接棒

## P1

- 補 reply、mention、like、announce、undo、update、delete 的雙向映射
- 決定 `Note` / `Article` / 混合長文策略
- 補 domain block、account suspend、rate limit、dead letter 與 audit log
- 建立 delete propagation、cache invalidation 與 delivery retry 策略

## P2

- 建立 multi-instance registry 與 per-instance policy scope
- 補 launch runbook、incident handling 與 legal takedown flow
- 為第三方自助架設保留 onboarding 與 provisioning 設計
