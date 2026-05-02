# Staging Observability Drill 20260501 Local

## Scope

本次是本機 staging drill，不是 public Cloudflare staging drill。目標是先驗證 `gateway-core` 的 alerts / metrics / logs 三組 webhook sink 可以在 staging-style config、secret files、generic webhook receiver 與 SQLite runtime 下完整送達。

未執行項目：

- 未建立或修改 Cloudflare Tunnel / DNS / Access policy
- 未對外部署 `staging-gateway.matters.town`
- 未執行 Misskey / GoToSocial public follow probe
- 未 push

## Environment

- Host: local Mac
- Config: `gateway-core/config/staging.local.instance.json`
- Secret files: `gateway-core/config/staging.secrets/`，已被 `.gitignore` 排除
- Receiver: `127.0.0.1:8788`
- Receiver output: `gateway-core/runtime/webhooks/`
- Drill output: `gateway-core/runtime/drills/staging-observability-20260501-local/`
- Payload retention policy: 14 days

## Commands

```bash
cd gateway-core
node scripts/check-secret-layout.mjs --config ./config/staging.local.instance.json
```

Result: `status=ok`, checked files `5`, missing files `0`.

```bash
cd gateway-core
node scripts/run-webhook-receiver.mjs \
  --host 127.0.0.1 \
  --port 8788 \
  --output-dir ./runtime/webhooks \
  --bearer-token-file ./config/staging.secrets/webhook-receiver.token
```

Result: receiver started with `bearerTokenRequired=true`.

```bash
cd gateway-core
node scripts/run-staging-observability-drill.mjs \
  --config ./config/staging.local.instance.json \
  --output-dir ./runtime/drills/staging-observability-20260501-local \
  --require-sinks
```

Result: `status=ok`.

## Results

Generated at: `2026-05-02T03:19:02.712Z`

| Channel | Dispatch status | Sink | HTTP status | Errors |
| --- | --- | --- | --- | --- |
| alerts | dispatched | webhook | 202 | none |
| metrics | dispatched | webhook | 202 | none |
| logs | dispatched | webhook | 202 | none |

Receiver captured 3 payload files:

| Path | SHA-256 |
| --- | --- |
| `runtime/webhooks/2026-05-02T031902-766Z-0000-runtime-alerts.json` | `7d470b1cc9fa9956b8176b5a29de6fc74cf237bbba1a486cdccea10536693581` |
| `runtime/webhooks/2026-05-02T031902-772Z-0001-runtime-metrics.json` | `bd3aa1a146430b3502d85125417e8f072ea6f269c624cc7dbc1840c2450aa71c` |
| `runtime/webhooks/2026-05-02T031902-774Z-0002-runtime-logs.json` | `bdf8b7512d2cdd225eee9d0872bfde36494a3edd61fa0835fad70ca2f3e342af` |

Drill bundle hashes:

| Path | SHA-256 |
| --- | --- |
| `runtime/drills/staging-observability-20260501-local/alerts.json` | `7a372e79b02a5a55e10a5c66ebf50176b291a5466a0d8ffaa65dc5eec2c17449` |
| `runtime/drills/staging-observability-20260501-local/metrics.json` | `ca9efeedc875827179434c0fe5a5bd056c1a50567d43ef1de28312dd35d1dfa7` |
| `runtime/drills/staging-observability-20260501-local/logs.json` | `b2749d43f85d6a8b7809ec62c82550d8683b60ab260b252afb80f6b9eeb72f14` |
| `runtime/drills/staging-observability-20260501-local/report.json` | `035e5ea548e4d86895584ee93ee2931c5a51a9e2e83e3556f5dcd27d503cd8e9` |

## Observations

- The local generic receiver accepted all three channels with bearer-token protection.
- The local staging config uses SQLite runtime state and the staging secret file layout.
- No token or private key value is recorded in this report.
- The first drill attempt with the Codex app Node binary failed on macOS native module code signing for `better-sqlite3`; rerunning with the same bundled Node runtime used by the full test suite passed.

## Next Step

The remaining W1 gap is public staging transport: create or reuse Cloudflare Tunnel / DNS routes for `staging-gateway.matters.town`, `staging-admin.matters.town`, and `staging-hooks.matters.town`, enable Access only for admin/hooks, then rerun this drill through the public hostnames.
