# Provider Alert Routing Runtime Slice

## Scope

把 `Stage 03` 的 alert dispatch 從 generic webhook baseline，再往前補成 provider-specific routing，先落 Slack incoming webhook。

## Landed In This Slice

- `runtime.alerting.dispatch`
  現在可預載 `slackWebhookUrl`、`slackChannel`、`slackUsername`、`slackIconEmoji` 與共用 `timeoutMs`
- `POST /admin/runtime/alerts/dispatch`
  現在可同時 dispatch generic webhook 與 Slack incoming webhook
- `npm run dispatch:alerts`
  現在支援 `--slack-webhook-url`、`--slack-channel`、`--slack-username`、`--slack-icon-emoji`
- alert dispatch 成功或失敗時，audit / trace 會保留 `sinkTypes`、`slackHost`、`slackStatus`
- Slack payload 會帶 instance headline、minimum severity、generated timestamp，以及最多五筆 alert 摘要

## Runtime Surfaces

- `POST /admin/runtime/alerts/dispatch`
- `scripts/dispatch-runtime-alerts.mjs`
- `src/lib/runtime-observability.mjs`

## Verification

- `cd gateway-core && npm test`
  已覆蓋 admin Slack dispatch 與 config-driven Slack dispatch script
- `cd gateway-core && npm run check:local-sandbox`
  local sandbox 互通驗證仍正常

## Remaining Gaps

- alert routing 已有 generic webhook 與 Slack incoming webhook，PagerDuty 等 provider-specific sink 尚未接
- metrics 與 logs 目前仍停在 generic webhook baseline
- staging drill 與 deployment topology 固化仍待完成
