# Misskey Sandbox Interop

## Goal

把 Mastodon sandbox probe 的驗收欄位搬到真實 Misskey public instance，先驗證 canonical discoverability、remote account resolve、follow loop 與 relationship 收斂。

## Required Inputs

- `MISSKEY_BASE_URL`
  目標 Misskey instance，例如 `https://gyutte.site`
- `MISSKEY_ACCESS_TOKEN`
  使用者 token。第一輪只需要能讀 account relation 與建立 follow；token 不得寫進 repo 或 run report
- `MISSKEY_OPERATOR_PROFILE_URL`
  選填。公開操作帳號 profile URL，例如 `https://gyutte.site/@mashbean`
- `GATEWAY_PUBLIC_BASE_URL`
  真實 Misskey instance 可連到的 Matters gateway URL
- `GATEWAY_PROBE_BASE_URL`
  選填。若本地或 staging probe URL 和 public URL 不同時使用
- `GATEWAY_HANDLE`
  選填，預設 `alice`
- `MISSKEY_TOKEN_MODE`
  選填，預設 `authorization`。可改 `body` 或 `both` 以相容不同 Misskey instance

## Command

```bash
cd gateway-core
MISSKEY_BASE_URL="https://gyutte.site" \
MISSKEY_ACCESS_TOKEN="<token>" \
MISSKEY_OPERATOR_PROFILE_URL="https://gyutte.site/@mashbean" \
GATEWAY_PUBLIC_BASE_URL="https://gateway.example" \
npm run check:misskey-sandbox
```

To convert a raw probe JSON file into a sanitized repo-safe report:

```bash
cd gateway-core
npm run report:interop -- \
  --input-json ./runtime/interop/misskey-raw.json \
  --output ../research/matters-fediverse-compat/03-ops/misskey-public-run-YYYYMMDD.md \
  --implementation Misskey \
  --instance https://gyutte.site \
  --operator-profile https://gyutte.site/@mashbean \
  --gateway-url https://staging-gateway.matters.town \
  --gateway-actor alice \
  --gateway-commit <commit>
```

## What The Script Checks

- `/.well-known/webfinger`
- actor document
- bridged outbox
- Misskey `ap/show` 是否能 resolve remote Matters actor
- 若 `ap/show` 沒有回 user object，fallback 到 `users/show`
- Misskey `following/create` 是否能對 remote actor 建立 follow
- Misskey `users/relation` 是否顯示 following 或 pending follow request

## Token Handling

- Token 只從環境變數讀取，不寫進 repo。
- Script output 不包含 token。
- Repo-safe run report 由 `npm run report:interop` 產生；原始 probe JSON 應留在 `gateway-core/runtime/`，不納入 git。
- 若 UI 產生 token 後剪貼簿不可靠，可先由使用者放入備忘錄 app，之後再由 staging operator 放進本機 shell env 或 secret file。
- 建立 Misskey access token 是 persistent access creation，需要真人在 action-time 核准。

## Preconditions

- `GATEWAY_PUBLIC_BASE_URL` 必須對 `gyutte.site` 可達。
- gateway canonical host 必須和 `acct:<handle>@<host>` 一致。
- public federation endpoint 不可被 Cloudflare Access 或登入牆擋住。
- 第一輪不發文、不私訊、不建立 production credential；只做 resolve / follow / relation probe。

## Current State

- 腳本已落在 `gateway-core/scripts/run-misskey-sandbox-interop.mjs`
- package script 已新增 `npm run check:misskey-sandbox`
- report script 已新增 `npm run report:interop`，可把 raw JSON 轉成遮罩後的 public run report
- 使用者已提供公開 Misskey 帳號：`https://gyutte.site/@mashbean`
- 尚未建立或讀取 access token；尚未對 gyutte.site 執行外部 follow probe
- 外部 run report 請從 `research/matters-fediverse-compat/03-ops/interop-run-template.md` 複製後填寫
