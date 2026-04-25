# Mastodon Sandbox Run 2026-03-21

## Summary

已使用真實 `mastodon.social` 帳號與 token，對 Matters gateway 執行第一輪黑箱互通驗證。

## Runtime Context

- Mastodon instance  
  `https://mastodon.social`
- gateway public URL  
  `https://bride-ray-strengths-interim.trycloudflare.com`
- gateway actor  
  `acct:alice@bride-ray-strengths-interim.trycloudflare.com`
- execution command  
  `npm run check:mastodon-sandbox`

## Result

- probe 結果  
  `ok: true`
- WebFinger subject  
  `acct:alice@bride-ray-strengths-interim.trycloudflare.com`
- actor canonical ID  
  `https://bride-ray-strengths-interim.trycloudflare.com/users/alice`
- outbox total items  
  `2`
- Mastodon resolved account id  
  `116262524420545657`
- Mastodon resolved acct  
  `alice@bride-ray-strengths-interim.trycloudflare.com`

## Observations

- Mastodon 可成功 resolve remote Matters actor
- gateway 的 canonical WebFinger、actor、followers、bridged outbox 都可被真實 Mastodon 讀取
- follow API 回應顯示可 follow
- relationship polling 最終顯示 `requested: true`

## Interpretation

- 對真實 Mastodon 來說，discoverability 與 follow-loop 基本鏈路已打通
- 目前觀測到的最終關係狀態偏向 pending / requested，表示後續仍值得針對 `Accept` 是否被 Mastodon 視為已完成 follow 再做 deeper inspection
- 這不阻止我們進入下一個工程主線  
  `reply`  
  `like`  
  `announce`
