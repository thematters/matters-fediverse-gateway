# Staging Observability Drill YYYYMMDD

## Summary

- Status: `pending`
- Staging gateway: `https://staging-gateway.matters.town`
- Staging admin: `https://staging-admin.matters.town`
- Staging hooks: `https://staging-hooks.matters.town`
- Gateway commit:
- Operator:
- Started at:
- Completed at:

## Human Approval Record

Record the action-time confirmations here before the drill:

- Cloudflare Tunnel / DNS routes created or reused:
- Cloudflare Access enabled for admin/hooks:
- Cloudflare Access not enabled for public federation hostname:
- Actor key files provisioned from Notes app:
- Webhook token files provisioned from Notes app:
- Payload retention policy accepted: 14 days

## Commands

```bash
cd gateway-core
npm run check:secret-layout -- --config ./config/staging.instance.json
```

```bash
cd gateway-core
node scripts/run-staging-observability-drill.mjs \
  --config ./config/staging.instance.json \
  --output-dir ./runtime/drills/staging-observability-YYYYMMDD \
  --require-sinks
```

## Cloudflare Checks

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://staging-gateway.matters.town/.well-known/webfinger
cloudflared tunnel ingress rule https://staging-admin.matters.town/admin/dashboard
cloudflared tunnel ingress rule https://staging-hooks.matters.town/healthz
```

Expected:

- `staging-gateway.matters.town` routes to public gateway paths and is not behind Access.
- `staging-admin.matters.town` is protected by Access.
- `staging-hooks.matters.town` is protected by Access unless a specific external callback test requires otherwise.

## Drill Report

- `report.json` path:
- `report.json` SHA-256:
- Overall status:
- Alerts channel status:
- Metrics channel status:
- Logs channel status:
- Slack status: skipped unless already available at no extra cost

## Captured Webhook Payloads

Do not paste full payload bodies unless needed for debugging. Default to file names and hashes.

| Channel | File | SHA-256 | Received At | HTTP Status |
| --- | --- | --- | --- | --- |
| alerts |  |  |  |  |
| metrics |  |  |  |  |
| logs |  |  |  |  |

## Observations

- Alert latency:
- Metrics latency:
- Logs latency:
- Payload format issues:
- Retry or timeout issues:
- Cloudflare routing issues:
- Access policy issues:

## Follow-Up Fixes

- [ ] TBD

## Retention

- Keep `runtime/webhooks/` and `runtime/drills/` for 14 days.
- Internal reports should record file names, timestamps, statuses, and SHA-256 hashes by default.
- Drill payloads must not contain secrets.
- Delete or archive drill artifacts after the 14-day retention window.
