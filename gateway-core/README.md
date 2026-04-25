# Matters Gateway Core

`gateway-core` 是 Matters fediverse engineering 的第一個動態 runtime 切片，目標先落地這幾件事

- inbound `Follow`
- inbound `Create` / `Reply` / `Like` / `Announce` / `Undo`
- outbound `Update` / `Delete`
- outbound `Accept` / `Reject`
- HTTP signature verification
- remote actor discovery 與 key refresh
- static outbox bridge
- domain block、abuse queue、audit log baseline
- actor suspend、legal takedown、admin dashboard baseline
- instance-level / actor-level rate limit baseline
- evidence retention baseline
- manual replay control baseline
- SQLite ops baseline
- SQLite recovery / alerting baseline
- structured metrics / alert routing baseline
- remote actor policy baseline
- thread reconstruction / mention mapping baseline
- local conversation projection baseline
- remote acct mention resolution baseline
- followers state persistence
- retry / dead letter skeleton
- minimal request trace

## Quick Start

```bash
cd gateway-core
npm start
```

預設會讀 `./config/dev.instance.json`，並把狀態寫到 `./runtime/dev-state.sqlite`。

`config/dev-private-key.pem` 與 `config/dev-public-key.pem` 只是本地 slice 驗證用的示範金鑰，不可用於真實 instance。

## Endpoints

- `GET /.well-known/webfinger`
- `GET /.well-known/host-meta`
- `GET /.well-known/nodeinfo`
- `GET /nodeinfo/2.1`
- `GET /users/<handle>`
- `GET /users/<handle>/outbox`
- `GET /users/<handle>/followers`
- `GET /users/<handle>/following`
- `POST /users/<handle>/inbox`
- `POST /users/<handle>/outbox/create`
- `POST /users/<handle>/outbox/engagement`
- `POST /users/<handle>/outbox/update`
- `POST /users/<handle>/outbox/delete`
- `GET /admin/domain-blocks`
- `POST /admin/domain-blocks`
- `GET /admin/actor-suspensions`
- `POST /admin/actor-suspensions`
- `GET /admin/remote-actor-policies`
- `POST /admin/remote-actor-policies`
- `GET /admin/abuse-queue`
- `POST /admin/abuse-queue/resolve`
- `GET /admin/rate-limits`
- `POST /admin/rate-limits`
- `GET /admin/rate-limit-state`
- `GET /admin/legal-takedowns`
- `POST /admin/legal-takedowns`
- `POST /admin/legal-takedowns/resolve`
- `GET /admin/audit-log`
- `GET /admin/evidence`
- `GET /admin/dead-letters`
- `GET /admin/threads`
- `GET /admin/local-domain`
- `POST /admin/local-domain/reconcile`
- `POST /admin/dead-letters/replay`
- `GET /admin/runtime/storage`
- `GET /admin/runtime/metrics`
- `POST /admin/runtime/metrics/dispatch`
- `POST /admin/runtime/logs/dispatch`
- `GET /admin/runtime/alerts`
- `POST /admin/runtime/alerts/dispatch`
- `POST /admin/runtime/storage/reconcile`
- `GET /admin/queues/outbound`
- `GET /admin/dashboard`
- `POST /inbox`
- `POST /jobs/delivery`
- `POST /jobs/remote-actors/refresh`

## Slice Boundaries

- `ipns-site-generator` 繼續負責靜態輸出
- 這個 service 承接動態 inbox、followers state、key material、delivery queue
- social loop 目前已涵蓋最小的收件、撤回、刪改同步切片，以及 thread / mention / local conversation projection / remote acct mention baseline
- `paid`、`private`、`encrypted` 內容仍然不在這一輪支援範圍內

## Config Shape

`config/dev.instance.json` 示範了最小設定格式

- `instance`
  canonical domain、品牌資訊、NodeInfo 對外資訊
- `actors`
  本地 actor 的 profile、key material、follow policy
  `staticOutboxFile` 可選，用來接 static publisher 產生的 `outbox.jsonld`
- `remoteActors`
  遠端 actor seed data，提供第一跳驗章與回送資訊
- `remoteDiscovery`
  cache TTL 與 live actor discovery 行為
- `delivery`
  retry 上限與 outbound user agent
  `processingLeaseTimeoutMs` 用來界定 processing queue item 在 crash / restart 後多久可被回收成 pending
- `moderation`
  `domainBlocks` 可預載 instance 級 blocklist
  `actorSuspensions` 可預載 actor 級 suspension
  `remoteActorPolicies` 可預載單一遠端 actor 的 inbound / outbound policy
  `evidenceRetentionDays` 可設定 evidence record 的保留天數
  `rateLimits` 可預載 `instanceInbound`、`actorInbound`、`actorOutbound`
- `runtime`
  `storeDriver` 可選 `file` 或 `sqlite`
  `stateFile` 保留 file store 路徑
  `sqliteFile` 用於 SQLite persistence
  `alerting` 可調整 backup age、pending queue age、open dead letter、pending queue volume 的警戒門檻
  `alerting.dispatch` 可預載 webhook sink、custom headers、bearer token 與 timeout
  `metrics.dispatch` 可預載 metrics webhook sink、custom headers、bearer token 與 timeout
  `logs.dispatch` 可預載 logs webhook sink、custom headers、bearer token、audit limit、trace limit 與 trace prefix

## Test

```bash
cd gateway-core
npm test
```

## SQLite Backup

```bash
cd gateway-core
npm run backup:sqlite
```

這支腳本會對目前 configured SQLite runtime 做一致性備份，並在 backup 檔旁邊寫一份 manifest JSON。

## SQLite Restore

```bash
cd gateway-core
npm run restore:sqlite -- --input-file ./runtime/backups/dev-state-<timestamp>.sqlite --target-file ./runtime/dev-state.sqlite
```

這支腳本會把指定 backup 還原成新的 SQLite runtime，預設也會先替既有 target 做一份 pre-restore backup。

## Runtime Alerts

```bash
cd gateway-core
npm run dispatch:alerts -- --output-file ./runtime/alerts/latest.json
```

這支腳本會讀取目前 runtime metadata、metrics 與 alerts，產出一份可供排程或外部告警流程接手的 JSON bundle。

若要直接把 alert bundle 送到外部 webhook sink，可加上 CLI 參數，或在 `runtime.alerting.dispatch` 預設一組 webhook 設定。

```bash
cd gateway-core
npm run dispatch:alerts -- \
  --output-file ./runtime/alerts/latest.json \
  --webhook-url http://127.0.0.1:8788/runtime-alerts \
  --webhook-header x-alert-source=gateway-core \
  --webhook-bearer-token <token>
```

Slack incoming webhook 也可直接接在同一條 alert dispatch 流程。

```bash
cd gateway-core
npm run dispatch:alerts -- \
  --output-file ./runtime/alerts/latest.json \
  --slack-webhook-url https://hooks.slack.com/services/xxx/yyy/zzz \
  --slack-channel '#gateway-alerts' \
  --slack-username matters-gateway \
  --slack-icon-emoji :satellite:
```

`POST /admin/runtime/alerts/dispatch` 也支援同一組 webhook 與 Slack 欄位，並會把 sink 類型、target host 與 response status 寫進 audit / trace。

## Runtime Metrics

```bash
cd gateway-core
npm run dispatch:metrics -- --output-file ./runtime/metrics/latest.json
```

這支腳本會讀取目前 runtime structured metrics，產出一份可供排程或外部監控流程接手的 JSON bundle。

若要直接把 metrics bundle 送到外部 webhook sink，可加上 CLI 參數，或在 `runtime.metrics.dispatch` 預設一組 webhook 設定。

```bash
cd gateway-core
npm run dispatch:metrics -- \
  --output-file ./runtime/metrics/latest.json \
  --webhook-url http://127.0.0.1:8788/runtime-metrics \
  --webhook-header x-metrics-source=gateway-core \
  --webhook-bearer-token <token>
```

`POST /admin/runtime/metrics/dispatch` 也支援同一組 webhook 欄位，並會把 sink 類型、target host 與 response status 寫進 audit / trace。

## Runtime Logs

```bash
cd gateway-core
npm run dispatch:logs -- --output-file ./runtime/logs/latest.json
```

這支腳本會讀取目前 runtime 的 audit log 與 traces，產出一份 structured logs bundle。

若要直接把 logs bundle 送到外部 webhook sink，可加上 CLI 參數，或在 `runtime.logs.dispatch` 預設一組 webhook 設定。

```bash
cd gateway-core
npm run dispatch:logs -- \
  --output-file ./runtime/logs/latest.json \
  --webhook-url http://127.0.0.1:8788/runtime-logs \
  --webhook-header x-logs-source=gateway-core \
  --webhook-bearer-token <token> \
  --audit-limit 200 \
  --trace-limit 200 \
  --trace-event-prefix delivery.
```

`POST /admin/runtime/logs/dispatch` 也支援同一組 webhook 欄位，並可帶 `auditLimit`、`traceLimit`、`traceEventPrefix` 控制 bundle 範圍。

## Observability Drill

```bash
cd gateway-core
npm run drill:observability
```

這支腳本會依目前 config 一次產出 alerts、metrics、logs bundle，寫到 `./runtime/drills/`，並嘗試把三組訊號送到各自設定好的 external sink。

若要改用其他 config 或輸出路徑，可直接執行

```bash
cd gateway-core
node scripts/run-staging-observability-drill.mjs \
  --config ./config/dev.instance.json \
  --output-dir ./runtime/drills/manual-check \
  --require-sinks
```

完成後會在 output dir 內留下 `alerts.json`、`metrics.json`、`logs.json` 與 `report.json`，方便把 staging drill 結果一併封存。

## Deployment Baseline

- staging config 範本在 `config/staging.instance.example.json`
- staging secret layout 範本在 `config/staging.secrets.example/README.md`
- reverse proxy baseline 範本在 `deploy/Caddyfile.example`
- rollout env 範本在 `deploy/matters-gateway-core.env.example`
- system service baseline 在 `deploy/matters-gateway-core.service.example`
- deployment topology baseline 在 `../research/matters-fediverse-compat/03-ops/deployment-topology-baseline.md`
- `gateway-core` 預期放在 public reverse proxy 後面，runtime 以 SQLite 為基線，外部 observability sink 由 `runtime.alerting.dispatch`、`runtime.metrics.dispatch`、`runtime.logs.dispatch` 控制

```bash
cd gateway-core
npm run check:secret-layout
```

這支腳本會檢查目前 config 內透過 `*File` 參考的 key 與 webhook token 檔案是否存在，適合在 staging drill 前先做一次 layout 驗證。

```bash
cd gateway-core
npm run check:rollout-artifact
```

這支腳本會檢查 rollout env artifact 是否帶齊 `WORKDIR`、`CONFIG_PATH`、`HOST`、`PORT`、`LOG_DIR`。若改用實際 staging env file，可加 `--strict-paths` 一起檢查路徑是否存在。

## Local Smoke Test

```bash
cd gateway-core
npm start
curl -s http://127.0.0.1:8787/users/alice/outbox
```

預設 dev config 會讀 [`alice-outbox.jsonld`](/Users/mashbean/Documents/AI%20Agent/worktrees/matters-gateway/gateway-core/fixtures/alice-outbox.jsonld)，所以本機啟動後可以直接看到改寫成 canonical actor 的公開 outbox。

## Local Sandbox Interop

```bash
cd gateway-core
npm run check:local-sandbox
```

這支腳本會起一個本地 sandbox actor，檢查 WebFinger、actor、outbox，並送出 signed `Follow` 驗證 gateway 是否能回 `Accept`。

## Mastodon Sandbox Interop

```bash
cd gateway-core
MASTODON_BASE_URL="https://mastodon.example" \
MASTODON_ACCESS_TOKEN="<token>" \
GATEWAY_PUBLIC_BASE_URL="https://gateway.example" \
npm run check:mastodon-sandbox
```

這支腳本會沿用 local sandbox 的驗收欄位，改向真實 Mastodon instance 執行 remote account resolve、follow 與 relationship polling。
