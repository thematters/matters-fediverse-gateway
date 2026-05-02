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

- Cloudflare Tunnel / DNS routes created or reused by human owner:
- Cloudflare Access enabled for admin/hooks by human owner:
- Cloudflare Access not enabled for public federation hostname:
- Actor key files provisioned by human owner outside git:
- Webhook token files provisioned by human owner outside git:
- GoToSocial or Misskey access token creation approved, if this drill includes public interop:
- External follow or public test traffic approved, if this drill includes public interop:
- Payload retention policy accepted: 14 days

## Preflight Checklist

### Local-Only Checks

These checks are safe for an operator to run without Cloudflare account access, public instance tokens, external follow actions, deployment, or push.

- [ ] Record `git status --short`.
- [ ] Record Node/npm availability and exact versions, or record missing dependency as a blocker.
- [ ] Run the GoToSocial dry-run contract check when available:

```bash
cd gateway-core
npm run check:gotosocial-contract
```

- [ ] If `npm` is unavailable, run the script directly with the repo-local Node runtime and record the command used.
- [ ] Run the matching no-listener Node test when the environment supports Node test execution.
- [ ] Run `git diff --check`.
- [ ] Record every command, exit status, output path/hash if any, blocker reason, and next step in the Local Verification Log below.

### Human Gate Before Real Staging Drill

These actions require action-time human approval and must not be performed by an operator without confirmation.

- [ ] Cloudflare DNS route or Tunnel creation/reuse.
- [ ] Cloudflare Access app or policy creation/change.
- [ ] Secret file provisioning for actor keys or webhook bearer tokens.
- [ ] GoToSocial or Misskey access token creation.
- [ ] Any public resolve/follow/relationship probe against a real external instance.
- [ ] Any external post, reply, like, boost, direct message, deployment, or push.

### Forbidden Without Approval

- Do not create Cloudflare Tunnel, DNS records, or Access policies.
- Do not create or store GoToSocial, Misskey, Cloudflare, webhook, or actor-key secrets.
- Do not paste token values into this report or into git.
- Do not perform public follow, posting, replies, likes, boosts, private messages, deploys, or pushes.

## Local Verification Log

| Command | Environment | Exit / Status | Evidence | Blocker | Next Step |
| --- | --- | --- | --- | --- | --- |
| `git status --short` | local repo |  |  |  |  |
| `npm run check:gotosocial-contract` | local repo |  |  |  |  |
| `node --test --test-name-pattern="gotosocial sandbox interop script dry-run contract emits endpoint plan without secrets"` | local repo |  |  |  |  |
| `git diff --check` | local repo |  |  |  |  |

## Probe Result Template

- Probe type: `GoToSocial dry-run contract | GoToSocial public instance | Misskey public instance | staging observability drill`
- Command:
- Environment summary:
- Gateway public URL:
- Gateway handle:
- Remote instance:
- Token used: `no token | env var only, redacted in output`
- Result: `pending | passed | failed | blocked`
- Raw output path:
- Raw output SHA-256:
- Secret redaction checked:
- Main blocker:
- Next local step:
- Next human gate:

## Commands

Local-only command examples:

```bash
cd gateway-core
npm run check:secret-layout -- --config ./config/staging.instance.json
```

Run the real staging observability drill only after the Human Gate section is approved and required staging hostnames, Access policy, and secret files already exist:

```bash
cd gateway-core
node scripts/run-staging-observability-drill.mjs \
  --config ./config/staging.instance.json \
  --output-dir ./runtime/drills/staging-observability-YYYYMMDD \
  --require-sinks
```

## Cloudflare Checks

Run these checks only after a human owner has created or confirmed the Cloudflare Tunnel, DNS routes, and Access policy. These commands validate an approved staging setup; they are not approval to create Cloudflare resources.

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
