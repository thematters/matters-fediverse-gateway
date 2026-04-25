# Local Sandbox Interop

## Goal

在沒有真實 Mastodon sandbox 帳號的前提下，先建立一個可重複執行的本地互通驗證腳本，驗證 `gateway-core` 的 canonical discoverability 與最小 follow loop。

## What The Harness Checks

- `/.well-known/webfinger` 是否回 `acct:<handle>@<instance-domain>`
- actor document 是否回 canonical actor URL
- bridged outbox 是否對外回 canonical actor surface
- remote actor live discovery 是否可抓到 sandbox actor
- sandbox actor 送 signed `Follow` 後，gateway 是否回 `202`
- sandbox inbox 是否收到 `Accept`

## Command

```bash
cd gateway-core
npm run check:local-sandbox
```

## Expected Outcome

- script 會輸出 `ok: true`
- `report.discovery` 會列出 WebFinger、actor、followers、outbox 的關鍵欄位
- `report.follow` 會列出 `Follow` 回應與收到的 `Accept`

## Next Step

這個 harness 通過後，下一輪就可以把驗證目標換成真實 Mastodon sandbox instance，保留同一組 discoverability 與 follow-loop 驗收欄位。
