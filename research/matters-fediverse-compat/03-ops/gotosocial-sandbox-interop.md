# GoToSocial Sandbox Interop

## Goal

把 Mastodon sandbox probe 的驗收欄位搬到真實 GoToSocial public instance，驗證 canonical discoverability、remote account resolve、follow loop 與 relationship 收斂。

## Required Inputs

- `GOTOSOCIAL_BASE_URL`
  目標 GoToSocial instance
- `GOTOSOCIAL_ACCESS_TOKEN`
  使用者 token，至少要能搜尋 remote account、建立 follow、讀 relationship。token 不得寫進 repo 或 run report
- `GOTOSOCIAL_OPERATOR_PROFILE_URL`
  選填。公開操作帳號 profile URL
- `GATEWAY_PUBLIC_BASE_URL`
  真實 GoToSocial instance 可連到的 Matters gateway URL
- `GATEWAY_PROBE_BASE_URL`
  選填。若本地或 staging probe URL 和 public URL 不同時使用
- `GATEWAY_HANDLE`
  選填，預設 `alice`

## Command

```bash
cd gateway-core
GOTOSOCIAL_BASE_URL="https://gts.example" \
GOTOSOCIAL_ACCESS_TOKEN="<token>" \
GOTOSOCIAL_OPERATOR_PROFILE_URL="https://gts.example/@mashbean" \
GATEWAY_PUBLIC_BASE_URL="https://gateway.example" \
npm run check:gotosocial-sandbox
```

## What The Script Checks

- `/.well-known/webfinger`
- actor document
- bridged outbox
- GoToSocial Mastodon-compatible `/api/v2/search?resolve=true` remote actor resolution
- GoToSocial Mastodon-compatible `/api/v1/accounts/:id/follow`
- GoToSocial Mastodon-compatible `/api/v1/accounts/relationships`

## Token Handling

- Token 只從環境變數讀取，不寫進 repo。
- Script output 不包含 token。
- 建立 GoToSocial access token 是 persistent access creation，需要真人在 action-time 核准。

## Preconditions

- `GATEWAY_PUBLIC_BASE_URL` 必須對目標 GoToSocial instance 可達。
- gateway canonical host 必須和 `acct:<handle>@<host>` 一致。
- public federation endpoint 不可被 Cloudflare Access 或登入牆擋住。
- 第一輪不發文、不私訊、不建立 production credential；只做 resolve / follow / relationship probe。

## Current State

- 腳本已落在 `gateway-core/scripts/run-gotosocial-sandbox-interop.mjs`
- package script 已新增 `npm run check:gotosocial-sandbox`
- 尚未選定 GoToSocial public instance 或建立 access token；尚未對外執行 probe
