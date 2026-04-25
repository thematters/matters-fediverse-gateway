# Mastodon Sandbox Interop

## Goal

把 local sandbox interop 擴展到真實 Mastodon sandbox instance，驗證 canonical discoverability、remote account resolve、follow loop 與 relationship 收斂。

## Required Inputs

- `MASTODON_BASE_URL`
  目標 Mastodon sandbox instance
- `MASTODON_ACCESS_TOKEN`
  一個 user token，至少要有 `read:search`、`read:follows`、`write:follows`
- `GATEWAY_PUBLIC_BASE_URL`
  真實 Mastodon 可連到的 Matters gateway URL
- `GATEWAY_PROBE_BASE_URL`
  選填。若本地或 staging probe URL 和 public URL 不同時使用
- `GATEWAY_HANDLE`
  選填，預設 `alice`

## Command

```bash
cd gateway-core
MASTODON_BASE_URL="https://mastodon.example" \
MASTODON_ACCESS_TOKEN="<token>" \
GATEWAY_PUBLIC_BASE_URL="https://gateway.example" \
npm run check:mastodon-sandbox
```

## What The Script Checks

- `/.well-known/webfinger`
- actor document
- bridged outbox
- Mastodon `resolve=true` 是否能找到 remote Matters actor
- Mastodon follow response 是否回 `following` 或 `requested`
- relationship polling 是否收斂

## Preconditions

- `GATEWAY_PUBLIC_BASE_URL` 必須對目標 Mastodon instance 可達
- gateway 的 canonical host 必須和 `acct:<handle>@<host>` 一致
- gateway actor 必須維持 public-only boundary

## Current State

- 腳本已經落在 [`run-mastodon-sandbox-interop.mjs`](/Users/mashbean/Documents/AI%20Agent/worktrees/matters-fediverse-compat-research/gateway-core/scripts/run-mastodon-sandbox-interop.mjs)
- 已在 `mastodon.social` 對公開 trycloudflare gateway 跑過第一輪 probe
- 執行結果與觀察已記錄在 [`mastodon-sandbox-run-20260321.md`](/Users/mashbean/Documents/AI%20Agent/worktrees/matters-fediverse-compat-research/research/matters-fediverse-compat/03-ops/mastodon-sandbox-run-20260321.md)
