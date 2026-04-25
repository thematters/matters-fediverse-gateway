# Rollout Artifact Runtime Slice

## Scope

把 `Stage 03` 的 deployment baseline 再往前補成可直接套用到 staging 的 rollout artifact，先固定 env file、system service 與最小檢查流程。

## Landed In This Slice

- 新增 `deploy/matters-gateway-core.env.example`
  固定 `WORKDIR`、`CONFIG_PATH`、`HOST`、`PORT`、`LOG_DIR`
- 新增 `deploy/matters-gateway-core.service.example`
  提供 systemd baseline，直接啟動 `src/server.mjs`
- 新增 `scripts/check-rollout-artifact.mjs`
  驗證 rollout env 是否帶齊必要欄位，並可用 `--strict-paths` 檢查實際路徑
- 新增 `npm run check:rollout-artifact`
  讓 rollout artifact 可在 staging drill 前先做機械化檢查

## Verification

- `cd gateway-core && npm test`
  已覆蓋 rollout artifact checker script
- `cd gateway-core && npm run check:rollout-artifact`
  rollout env example 可正常通過

## Remaining Gaps

- 真實 staging 主機的 env file、service unit 與 proxy route 還沒 provision
- rollout artifact 仍停在 single-node baseline
