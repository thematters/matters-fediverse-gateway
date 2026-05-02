# Staging Observability Drill 20260502 Cloudflare

## Scope

本次是 public Cloudflare staging transport smoke 加 staging-style observability drill。目標是驗證三個 staging hostnames 可以透過 Cloudflare Tunnel 轉到本機 gateway / webhook receiver，並確認 alerts / metrics / logs 三組 bundle 仍能送達 generic webhook receiver。

本次不是 production deployment，也不是正式 Misskey public follow / post 測試。

未執行項目：

- 未安裝 cloudflared 或 gateway-core 為長駐系統服務
- 未建立 production DNS / production routing
- 未執行 Misskey / GoToSocial public follow probe
- 未推送 git branch
- 未記錄任何 token、private key 或 webhook secret 明文

## Environment

- Host: local Mac through Cloudflare Tunnel
- Cloudflare account: Matters Lab
- Tunnel: `matters-gateway-staging`
- Tunnel ID: `61f68581-cb23-44ae-bde6-40826a941e2f`
- Public hostnames:
  - `staging-gateway.matters.town` -> `http://127.0.0.1:8080`
  - `staging-admin.matters.town` -> `http://127.0.0.1:8080`
  - `staging-hooks.matters.town` -> `http://127.0.0.1:8788`
- Gateway config: `gateway-core/config/staging.local.instance.json`
- Secret files: `gateway-core/config/staging.secrets/`，已被 `.gitignore` 排除
- Node runtime: bundled primary runtime Node，已確認可載入 `better-sqlite3`
- Gateway server: `127.0.0.1:8787`
- Generic webhook receiver: `127.0.0.1:8788`
- Local reverse proxy: `127.0.0.1:8080`
- Drill output: `gateway-core/runtime/drills/staging-observability-20260502-cloudflare/`
- Receiver output: `gateway-core/runtime/webhooks/`
- Payload retention policy: 14 days

`caddy` was unavailable in this local environment, so this drill used a temporary Node reverse proxy under ignored runtime files. The proxy routed gateway/admin hostnames to the local gateway process and blocked obvious admin/job paths on the public gateway hostname.

## Commands

The tunnel token was provided through the Cloudflare UI and was not written into this report.

```bash
cloudflared tunnel run --token [REDACTED]
```

```bash
cd gateway-core
node src/server.mjs \
  --config ./config/staging.local.instance.json \
  --host 127.0.0.1 \
  --port 8787
```

```bash
cd gateway-core
node scripts/run-webhook-receiver.mjs \
  --host 127.0.0.1 \
  --port 8788 \
  --output-dir ./runtime/webhooks \
  --bearer-token-file ./config/staging.secrets/webhook-receiver.token
```

```bash
cd gateway-core
node runtime/staging-proxy.mjs
```

```bash
cd gateway-core
node scripts/run-staging-observability-drill.mjs \
  --config ./config/staging.local.instance.json \
  --output-dir ./runtime/drills/staging-observability-20260502-cloudflare \
  --require-sinks
```

## Cloudflare Tunnel Smoke

Cloudflared registered four tunnel connections and received the ingress config for all three hostnames. Immediate public requests can return Cloudflare `1033` while the connector and edge config converge; after a 25 second wait, all public smoke checks passed.

| Check | Result |
| --- | --- |
| local gateway `127.0.0.1:8787/.well-known/nodeinfo` | HTTP 200 |
| local hooks `127.0.0.1:8788/healthz` | HTTP 200 |
| local proxy gateway host | HTTP 200 |
| local proxy admin host | HTTP 200 |
| `https://staging-gateway.matters.town/.well-known/nodeinfo` | HTTP 200 |
| `https://staging-admin.matters.town/.well-known/nodeinfo` | HTTP 200 |
| `https://staging-hooks.matters.town/healthz` | HTTP 200 |

Public gateway/admin NodeInfo responses advertised:

```json
{
  "links": [
    {
      "rel": "http://nodeinfo.diaspora.software/ns/schema/2.1",
      "href": "https://staging-gateway.matters.town/nodeinfo/2.1"
    }
  ]
}
```

## Observability Drill Results

Generated at: `2026-05-02T14:02:28.765Z`

| Channel | Dispatch status | Sink | HTTP status | Errors |
| --- | --- | --- | --- | --- |
| alerts | dispatched | webhook | 202 | none |
| metrics | dispatched | webhook | 202 | none |
| logs | dispatched | webhook | 202 | none |

Receiver captured 3 payload files:

| Path | SHA-256 |
| --- | --- |
| `runtime/webhooks/2026-05-02T140228-793Z-0000-runtime-alerts.json` | `b3e8a8e28e1ea3fabb6e61d8c34d83e7ca1c3044429cc66de733f854d382e3e6` |
| `runtime/webhooks/2026-05-02T140228-800Z-0001-runtime-metrics.json` | `d9fa7f3b9c889df0d649a881209ba7832ee9b5372ba1b872783c86dcfad0987f` |
| `runtime/webhooks/2026-05-02T140228-801Z-0002-runtime-logs.json` | `aa621d2c1194d89d31599b870fcf87823c7dcb4be7cf85e9106dceef6166c37d` |

Drill bundle hashes:

| Path | SHA-256 |
| --- | --- |
| `runtime/drills/staging-observability-20260502-cloudflare/alerts.json` | `d2409c5f30949bf1da894bd10d770586d1ad448af37d485348991a7aaee1e588` |
| `runtime/drills/staging-observability-20260502-cloudflare/metrics.json` | `6ba7496e52e48f6bde81b4a17fae400a14d238a324560298eaa4c4e25ee7a453` |
| `runtime/drills/staging-observability-20260502-cloudflare/logs.json` | `598e0777ea8130604c407a69e593bee24224f767a75722f02a3e09e66956aab3` |
| `runtime/drills/staging-observability-20260502-cloudflare/report.json` | `9422d3d46714381127599e20be1414393dfc62d13ab840e53d661fceebf6ab0a` |

## Observations

- Cloudflare Tunnel routing is sufficient for a fast staging transport smoke on the local Mac.
- The connector needs a short propagation window after registration; the first public checks may return `1033` before they settle.
- Alerts, metrics, and logs all reached the generic webhook receiver with HTTP 202.
- The current command-runner environment does not keep background processes alive after the command exits. This is acceptable for drills, but not for unattended staging.
- `staging-admin.matters.town` is reachable publicly in this smoke. It should receive Cloudflare Access or move behind a private-only route before broader testing.
- `staging-hooks.matters.town` remains bearer-token protected at the receiver level. If it is used for external callbacks, Cloudflare Access may break provider delivery and should be applied only after confirming the callback model.

## Next Human Decision

W1 has reached the next human decision point:

- Choose persistent hosting model: install `cloudflared`, gateway, webhook receiver, and reverse proxy as long-lived services on this Mac, or move staging to a small VM / container host.
- Choose access policy: protect `staging-admin.matters.town` with Cloudflare Access before wider testing; decide whether `staging-hooks.matters.town` stays public with bearer-token protection or also receives Access for internal-only drills.
