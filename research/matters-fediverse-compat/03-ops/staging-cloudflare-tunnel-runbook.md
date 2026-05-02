# Staging Cloudflare Tunnel Runbook

## Goal

用既有 Cloudflare 帳號建立一個低成本 staging 入口，讓 `gateway-core` 可以在小型 VM 或 container host 上完成 W1 observability drill。這份 runbook 不處理正式部署、不建立 production credential，也不把 token 寫進 repo。

## Recommended Hostnames

- `staging-gateway.<domain>`
  公開 federation staging 入口，給 WebFinger、NodeInfo、Actor、Outbox、Inbox 測試使用。不要放在 Cloudflare Access 後面，否則 Mastodon、Misskey、GoToSocial 等遠端 server 無法自動存取。
- `staging-hooks.<domain>`
  webhook receiver 入口，接 alerts / metrics / logs dispatch。建議放在 Cloudflare Access 後面；receiver 本身也要開 bearer token。
- `staging-admin.<domain>`
  管理介面入口。若要公開到網路，必須放在 Cloudflare Access 後面；沒有 Access 前先只綁 localhost 或 VPN。

## Preflight Checklist

- Cloudflare 帳號持有人已核准 DNS zone、Tunnel、Access policy 與 staging host 使用方式。
- staging host 已準備 Node/npm、`cloudflared`、Caddy、SQLite runtime 目錄與 system service 或 container runtime。
- hostname 已定案：`staging-gateway.<domain>`、`staging-admin.<domain>`、`staging-hooks.<domain>`。
- public federation hostname `staging-gateway.<domain>` 沒有套 Cloudflare Access。
- `staging-admin.<domain>` 與 `staging-hooks.<domain>` 的 Cloudflare Access policy 已由帳號持有人核准。
- actor key files、receiver bearer token、alerts/metrics/logs dispatch token 已由 staging owner 放在 staging host；不要寫進 git。
- webhook payload 留存、清除、雜湊或搬移策略已由 staging owner 決定。
- production route 與 production credential 不在本次 staging drill 範圍內。

## Local Services

```bash
cd gateway-core

node src/server.mjs \
  --config ./config/staging.instance.json \
  --host 127.0.0.1 \
  --port 8787
```

```bash
cd gateway-core

npm run receive:webhooks -- \
  --host 127.0.0.1 \
  --port 8788 \
  --output-dir ./runtime/webhooks \
  --bearer-token-file ./config/staging.secrets/webhook-receiver.token
```

The receiver accepts:

- `POST /runtime-alerts`
- `POST /runtime-metrics`
- `POST /runtime-logs`
- `GET /healthz`

It writes captured payloads to `runtime/webhooks/` and masks token-like headers before writing files.

Security model and limitations:

- The receiver is bearer-token-only. It checks `Authorization: Bearer ...` when `--bearer-token` or `--bearer-token-file` is configured.
- It is not an HMAC signature verifier and does not validate provider-style webhook signatures.
- Protect `staging-hooks.<domain>` with Cloudflare Access or a private network boundary when possible, then use the receiver bearer token as the inner check.
- Token-like headers are masked before files are written, but `bodyText` is retained in full. Drill payloads must not include secrets.
- Each captured payload includes `bodySha256` so the report can cite payload hashes without copying payload bodies.

Recommended local proxy for a shared staging host:

```bash
caddy run --config gateway-core/deploy/Caddyfile.cloudflare-tunnel.example
```

The public staging hostname blocks `/admin` and `/jobs`. Use the separate admin hostname only after Cloudflare Access is enabled.

## Cloudflare Tunnel

Use `gateway-core/deploy/cloudflared-staging.example.yml` as the shape for a locally managed tunnel:

```yaml
tunnel: STAGING_TUNNEL_UUID
credentials-file: /etc/cloudflared/STAGING_TUNNEL_UUID.json

ingress:
  - hostname: staging-gateway.example
    service: http://127.0.0.1:8080
  - hostname: staging-admin.example
    service: http://127.0.0.1:8080
  - hostname: staging-hooks.example
    service: http://127.0.0.1:8788
  - service: http_status:404
```

Minimum checks before running the drill:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://staging-gateway.example/.well-known/webfinger
cloudflared tunnel ingress rule https://staging-admin.example/admin/dashboard
cloudflared tunnel ingress rule https://staging-hooks.example/healthz
```

Run `cloudflared` as a service on the staging host after the tunnel and public hostnames are created in the Cloudflare dashboard or CLI. Keep tunnel tokens and credentials files outside git.

Cloudflare Access policy:

- Enable Access for `staging-admin.<domain>`.
- Enable Access for `staging-hooks.<domain>` unless the drill needs to receive unauthenticated external callbacks.
- Do not enable Access for `staging-gateway.<domain>` federation paths.

References:

- Cloudflare Tunnel routing: https://developers.cloudflare.com/tunnel/routing/
- Cloudflare Tunnel configuration: https://developers.cloudflare.com/tunnel/configuration/
- Cloudflare local ingress validation: https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/

## Staging Config

Copy and edit the example files on the staging host:

```bash
cd gateway-core
cp config/staging.instance.example.json config/staging.instance.json
mkdir -p config/staging.secrets
```

Set the dispatch URLs:

```json
{
  "runtime": {
    "alerting": {
      "dispatch": {
        "webhookUrl": "https://staging-hooks.<domain>/runtime-alerts",
        "webhookBearerTokenFile": "./staging.secrets/alert-webhook.token"
      }
    },
    "metrics": {
      "dispatch": {
        "webhookUrl": "https://staging-hooks.<domain>/runtime-metrics",
        "webhookBearerTokenFile": "./staging.secrets/metrics-webhook.token"
      }
    },
    "logs": {
      "dispatch": {
        "webhookUrl": "https://staging-hooks.<domain>/runtime-logs",
        "webhookBearerTokenFile": "./staging.secrets/logs-webhook.token"
      }
    }
  }
}
```

For the first no-cost path, the three generic webhook channels are enough. Add Slack only if there is already a free Slack incoming webhook available.

For a real staging copy, change the example secret paths from `./staging.secrets.example/...` to `./staging.secrets/...` after copying the template.

## Drill

```bash
cd gateway-core
npm run check:secret-layout -- --config ./config/staging.instance.json
node scripts/run-staging-observability-drill.mjs \
  --config ./config/staging.instance.json \
  --output-dir ./runtime/drills/staging-observability-YYYYMMDD \
  --require-sinks
```

Success means:

- `alerts.json`, `metrics.json`, `logs.json`, and `report.json` exist in the drill output directory
- `report.json` has `status: "ok"`
- `runtime/webhooks/` contains one accepted payload for each generic channel
- Any Slack result is recorded only if Slack was intentionally configured

Troubleshooting:

- `GET /healthz` should return `status: "ok"` from the receiver.
- A POST without bearer token should return 401 when the receiver token is configured.
- A POST with the expected bearer token should return 202 and write one JSON file under `runtime/webhooks/`.
- Compare `bodySha256` in the receiver response with the captured file when checking payload integrity.
- If `cloudflared tunnel ingress rule` does not match the expected hostname, fix the tunnel ingress config before running the drill.
- If Cloudflare Access blocks `staging-gateway.<domain>`, remove Access from the public federation hostname and keep Access only on admin/hooks hostnames.
- If Caddy returns 404 for `/admin` on `staging-gateway.<domain>`, that is expected; use `staging-admin.<domain>` through Access for admin checks.

## Disable and Roll Back

To stop the staging drill path:

```bash
sudo systemctl stop cloudflared || true
sudo systemctl stop caddy || true
pkill -f run-webhook-receiver.mjs || true
```

Then:

- Disable or remove the Cloudflare Tunnel DNS route for staging hostnames.
- Disable or tighten the Cloudflare Access apps for admin/hooks hostnames.
- Rotate receiver bearer token and alert/metrics/logs dispatch tokens if they were used from a shared host.
- Rotate actor key files if they were exposed outside the staging host or copied into an unsafe location.
- Move, hash, encrypt, or delete `runtime/webhooks/` and `runtime/drills/` according to the approved payload retention policy.
- Re-run public federation smoke checks on production hostnames to confirm staging routes did not affect production.

## Report Naming

Archive the human-readable drill result as:

`research/matters-fediverse-compat/03-ops/staging-observability-drill-YYYYMMDD.md`

Include:

- staging hostname names, without tokens
- drill command and timestamp
- report status
- payload file locations or hashes
- observed latency or retry issues
- whether Slack was skipped or tested
- follow-up fixes before production cutover
