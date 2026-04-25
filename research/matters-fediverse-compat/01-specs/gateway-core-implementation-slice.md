# Gateway Core Implementation Slice

## Goal

把 `gateway-core-minimum-slice` 的第一輪工程邊界固定下來，避免把動態 gateway 錯放到 `ipns-site-generator` 這個純靜態輸出 repo 裡。

## Runtime Placement Decision

- `ipns-site-generator` 保持 static publisher
- gateway core 必須是獨立的 dynamic runtime
- root workspace 目前沒有現成的 gateway service repo
- 第一輪工程 task 已落地為 root repo 內的 `gateway-core/` Node 20 service，先用獨立 runtime 承接 follow flow、signatures、followers state、retry 與 dead letter

## Evidence

- `external/ipns-site-generator/package.json` 只有 build、test、lint 等靜態輸出流程，沒有 server、queue worker、HTTP runtime script
- `external/ipns-site-generator/src/makeHomepage/index.ts` 只生成 `.well-known/webfinger`、actor-like JSON-LD、`outbox.jsonld`
- repo 內沒有 inbox handler、signature verification runtime、followers state storage、retry queue、dead letter worker

## First Engineering Slice

- inbound `Follow`
- outbound `Accept` / `Reject`
- HTTP signature verification
- remote actor discovery / key refresh
- followers state persistence
- retry / dead letter skeleton
- minimal request trace

## Interface Draft

- `GET /.well-known/webfinger`
- `GET /.well-known/host-meta`
- `GET /.well-known/nodeinfo`
- `GET /nodeinfo/2.1`
- `GET /users/<handle>`
- `GET /users/<handle>/outbox`
- `POST /users/<handle>/inbox`
- `GET /users/<handle>/followers`
- `GET /users/<handle>/following`
- `POST /inbox`
- internal `POST /jobs/delivery`
- internal `POST /jobs/remote-actors/refresh`

## Out Of Scope For Slice 1

- reply / like / announce
- multi-instance provisioning UI
- legal case workflow UI
- paid / private / encrypted content handling

## Recommended Next Action

用 local sandbox harness 先驗證 canonical discoverability、bridged outbox、signed `Follow` -> `Accept`，接著把同一套驗收欄位搬到真實 Mastodon sandbox。

## Implementation Status

- `gateway-core/` 已提供 `/.well-known/webfinger`、`/.well-known/host-meta`、`/.well-known/nodeinfo`、`/nodeinfo/2.1`
- `gateway-core/` 已提供 actor、followers、following、outbox、user inbox 與 shared inbox 的第一版 endpoint
- inbound `Follow` 已支援 HTTP signature verification、followers state persistence、`Accept` / `Reject` 回送
- remote actor 已支援 seed data、live discovery、cache 與 signature failure 後的 key refresh fallback
- `GET /users/<handle>/outbox` 已可透過 `staticOutboxFile` 讀取 `ipns-site-generator` 產生的 `outbox.jsonld`，並重寫成 canonical actor surface
- outbound delivery 已有 retry / dead letter skeleton 與 minimal request trace
- `cd gateway-core && npm test` 可驗證 webfinger、static outbox bridge、Follow accept/reject、invalid signature、remote actor discovery、key refresh、retry / dead letter
- `cd gateway-core && npm run check:local-sandbox` 可驗證 canonical discoverability、bridged outbox、sandbox actor live discovery、signed `Follow` 與 `Accept` delivery
- `cd gateway-core && npm run check:mastodon-sandbox` 已在 `mastodon.social` 對公開 trycloudflare gateway 跑過第一輪黑箱驗證，discoverability 與 follow-loop 基本鏈路可用
- `Stage 04` 已開始第一個 social slice  
  public `Create` / `Reply` 會在驗章後進入 inbound object state
