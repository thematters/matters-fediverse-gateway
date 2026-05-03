# Staging Secrets Layout Example

建議把 staging runtime 需要的 secret file 放在 config 旁邊的獨立資料夾。

## Expected Files

- `staging-public-key.pem`
- `staging-private-key.pem`
- `webhook-receiver.token`
- `alert-webhook.token`
- `metrics-webhook.token`
- `logs-webhook.token`

## Notes

- `staging.instance.example.json` 會透過 `publicKeyPemFile`、`privateKeyPemFile`、`webhookBearerTokenFile` 參考這些檔案
- 真實部署時可改成其他路徑，但建議維持相同的檔名結構，方便 `npm run check:secret-layout` 驗證
- Cloudflare Tunnel token、Cloudflare API token、Actor private key、webhook bearer token 都不要寫進 git；由 staging 主機上的檔案或 secret manager 管理
- `staging-hooks.matters.town` 可先接 `npm run receive:webhooks`，用 bearer token 保護並把 payload 寫到 staging 主機的 `runtime/webhooks/`
- `webhook-receiver.token` 是 receiver 自己驗證 incoming request 用的 token；`alert-webhook.token`、`metrics-webhook.token`、`logs-webhook.token` 是 gateway dispatch 到 receiver 時使用的 outbound bearer token
