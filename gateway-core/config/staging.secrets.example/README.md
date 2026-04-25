# Staging Secrets Layout Example

建議把 staging runtime 需要的 secret file 放在 config 旁邊的獨立資料夾。

## Expected Files

- `staging-public-key.pem`
- `staging-private-key.pem`
- `alert-webhook.token`
- `metrics-webhook.token`
- `logs-webhook.token`

## Notes

- `staging.instance.example.json` 會透過 `publicKeyPemFile`、`privateKeyPemFile`、`webhookBearerTokenFile` 參考這些檔案
- 真實部署時可改成其他路徑，但建議維持相同的檔名結構，方便 `npm run check:secret-layout` 驗證
