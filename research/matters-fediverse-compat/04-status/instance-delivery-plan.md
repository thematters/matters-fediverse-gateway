# Instance Delivery Plan

## Goal

- 先落地 Matters 官方 instance
- 對外相容性以 Mastodon、ActivityPub、WebFinger 為第一基線
- 長期保留多 instance 擴充能力

## Architecture

- `ipns-site-generator`
  內容輸出、公開文章 representation、canonical article URL、歸檔
- federation gateway
  WebFinger、actor、inbox、outbox、sharedInbox、followers、簽章、delivery、queue、dead letter
- instance control plane
  instance registry、policy bundle、key scope、enable switch、launch gate

## Delivery Order

1. `stage01_instance_platform`
   鎖定 instance domain、NodeInfo、policy surface、責任邊界
2. `stage02_identity_and_discovery`
   改成 instance-first actor identity 與 discovery
3. `stage03_gateway_core`
   定義 gateway endpoint surface、queue、state ownership、failure model
4. `stage04_social_interop`
   打通 follow、reply、like、announce、update、delete 的 social loop
5. `stage05_moderation_and_ops`
   補上 domain block、abuse、rate limit、audit log、takedown
6. `stage06_multi_instance_control_plane`
   固定 registry、namespace isolation、shared service 邊界
7. `stage07_launch_readiness`
   收斂 runbook、go / no-go、工程 task seeds 與 handoff

## Success Criteria

- 外部 Mastodon 可成功 discover、follow Matters actor，並收到公開內容 delivery
- Matters 可接收外部公開 reply、like、announce，並處理 update、delete
- non-public content boundary 有明確規格與驗收測試
- 下一輪 implementer 可直接從 stage spec 與 task seeds 動工

## Stage01 Exit Criteria

- official instance 的 canonical domain 與 lifecycle mode 已固定
- instance config schema 已能表達 NodeInfo、software identity、policy bundle
- `ipns-site-generator`、gateway、control plane 的邊界已固定
- stage01 handoff 已能直接把工作交給 stage02 的 writer、architect、reviewer

## Stage06 Exit Criteria

- instance registry schema 已固定
- actor namespace、key scope、policy scope、queue partition、audit partition 都有明確規則
- shared service 與不可共享狀態已切清楚
- stage07 可直接在這個基礎上收 launch readiness，不需再重談 multi-instance 隔離
