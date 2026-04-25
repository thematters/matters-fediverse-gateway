# Deployment Topology Baseline

## Goal

把 `Stage 03` 的 deployment topology 固化成最小可溝通 artifact，讓 staging drill、reverse proxy、runtime store 與外部 observability sink 有同一張基準圖。

## Baseline Topology

```mermaid
flowchart LR
  user["Fediverse Client"] --> proxy["Public Reverse Proxy"]
  proxy --> gateway["gateway-core Node service"]
  gateway --> sqlite["SQLite runtime store"]
  gateway --> backup["Backup and restore scripts"]
  gateway --> alerts["Alert sinks"]
  gateway --> metrics["Metrics sink"]
  gateway --> logs["Logs sink"]
  operator["Operator"] --> drill["Observability drill runner"]
  drill --> gateway
  drill --> alerts
  drill --> metrics
  drill --> logs
  control["Control plane"] -. config and rollout .-> gateway
```

## Baseline Artifacts

- `gateway-core/config/staging.instance.example.json`
  staging config 範本，收斂 SQLite、alerting、metrics、logs dispatch 基線
- `gateway-core/config/staging.secrets.example/README.md`
  staging secret file layout 範本
- `gateway-core/deploy/Caddyfile.example`
  public reverse proxy 的最小 baseline
- `gateway-core/scripts/check-secret-layout.mjs`
  檢查 config 內 `*File` 參考是否存在
- `gateway-core/scripts/run-staging-observability-drill.mjs`
  一次驗證 alerts、metrics、logs 外部接線
- `research/matters-fediverse-compat/03-ops/restore-replay-drill-runbook.md`
  restore / replay 與 observability drill 的操作順序

## Remaining Gaps

- environment-specific reverse proxy 與 system service artifact 還沒固化
- 真實 deployment secret file 還沒 provision
- control plane 與 gateway-core 的 rollout boundary 仍待 runtime 化
