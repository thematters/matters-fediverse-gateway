# Next Steps

1. 開 `gateway-core-minimum-slice` 工程 task，實作最小 follow flow、signature verify/sign、followers state 與 dead letter
2. 開 `identity-discovery-hardening` 工程 task，將 canonical actor URL、WebFinger、followers/following URL 與 key ownership 真正落進程式碼
3. 開 `social-interactions-loop` 工程 task，打通公開 reply、like、announce、undo、update、delete 的雙向流程
4. 開 `moderation-ops-baseline` 工程 task，實作 blocklist、rate limit、audit log、legal takedown 與 non-public boundary enforcement
5. 開 `multi-instance-control-plane-pilot` 工程 task，用第二個測試 instance 驗證 registry、queue partition、audit partition 與 policy scope
6. 建立 Mastodon 黑箱測試與 launch harness，讓 discovery、follow、social loop、boundary、moderation 都可重跑驗證
7. 以 `docs/handoff/current.md` 和 engineering task seeds 為入口，切換到真正的 implementation cycle
