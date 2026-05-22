# Production Pilot Final Gates

Date: 2026-05-22
Status: pre-outbound checklist; production remains `record_only`

This checklist narrows the remaining work before the first production outbound
pilot for `acct:mashbeanmatters@matters.town`.

It is not approval to send production ActivityPub `Create`, `Update`, or
`Delete`. Production outbound remains disabled until every blocking item in this
document is closed and Matters current General Manager gives an explicit go.

## Current Safe Baseline

| Gate | Status | Evidence |
| --- | --- | --- |
| Production server release | Cleared | `matters-server` v5.23.0 reached `master` through PR #4814. |
| Production record-only mode | Cleared | `matters-server-prod-new` is in `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`. |
| Redacted audit query | Cleared | Workflow run `26269962135` passed with `include_decision_report=false` and returned row `id=399` for article `1225211`. |
| Gateway public preflight | Cleared | `npm run check:production-record-only` passed on 2026-05-22 with `outbox.totalItems=0`, `followers.totalItems=2`, and `fullOutboundEnabled=false`. |
| Public discovery | Cleared | `npm run check:threads-discovery` passed on 2026-05-22 for default, `facebookexternalua`, `facebookexternalhit`, and `meta-externalagent` probes. |
| Production outbound | Still disabled | No production ActivityPub delivery has been enabled or sent. |

## Blocking Gates Before Outbound

| Gate | Required result | Current state | Decision owner |
| --- | --- | --- | --- |
| Production private S3 bundle storage | Private bucket or prefix exists, bucket policy blocks public access, lifecycle/retention is documented, and access logging or audit trail is known. | Cleared for pilot storage on 2026-05-22. Bucket `matters-fediverse-prod-bundles` exists in `ap-southeast-1`, blocks public access, uses SSE-S3 encryption, has versioning enabled, and expires the `pilot/` prefix after 90 days. | Matters current General Manager; infra supports execution and audit details. |
| Gateway SQLite backup | Fresh backup exists for the live AWS origin SQLite database and has a manifest. | Cleared on 2026-05-22 through SSM command `732401b2-f577-499b-8387-20e6b736f361`. Backup manifest reports schema version 6 and WAL mode. | Matters current General Manager; gateway operator executes. |
| Gateway SQLite consistency scan | Latest production-origin scan has no unexplained diffs. | Cleared with explained diffs on 2026-05-22. The scan reported `totalDiffs=5`, all `missing_in_file`: 2 followers, 1 Misskey inbound object, and 2 Misskey engagements exist in SQLite but not legacy file state. There were no `missing_in_sqlite` or value mismatches; this matches the SQLite-primary runtime direction. | Matters current General Manager; gateway operator executes. |
| Rollback owner and window | Named owner, reachable during pilot window, with authority to stop delivery and disable author federation. | Owner assigned to Matters current General Manager. Pilot window still needs a concrete time. | Matters current General Manager; gateway operator executes rollback steps. |
| Legal takedown owner | Named owner and response path for external takedown requests. | Owner assigned to Matters current General Manager. Legal/policy may advise, but the pilot decision owner is GM. | Matters current General Manager. |
| Privacy notice | Product/legal approved copy about external caching, replication, and deletion limits. | Owner assigned to Matters current General Manager. Draft exists in `08-production-rollout-human-approval.md`. | Matters current General Manager. |
| Key exposure / rotation owner | Named severity decision owner and execution owner for rotation, actor update/delete, and external notice decisions. | Owner assigned to Matters current General Manager. CTO/security supports severity assessment and gateway operator executes key rotation. | Matters current General Manager. |
| Lambda and gateway ingestion secrets | Owners and rotation path named. | Owner assigned to Matters current General Manager. CTO/infra supports credential storage and rotation mechanics. | Matters current General Manager. |

## Recommended Defaults

Use these defaults unless Matters current General Manager overrides them before
the pilot:

- S3 storage: one private prefix for production generated bundles, not public
  serving. Pilot bucket: `s3://matters-fediverse-prod-bundles/pilot/`.
- S3 public access: block all public access at bucket level.
- S3 retention: 90 days for pilot bundle artifacts, then revisit after the
  pilot. Keep longer only if Matters current General Manager explicitly wants
  it after legal/policy input.
- Access logging/audit: CloudTrail data events or equivalent access audit for
  the bucket/prefix before broader rollout.
- Rollback window: one hour around the first `Create`; no broad delivery during
  that window.
- Rollback action order: stop outbound queue, keep `record_only`, disable
  `mashbean` author federation if needed, preserve SQLite/logs, then decide on
  remote `Delete`.
- Key rotation: keep the current versioned key id for the pilot unless there is
  suspected exposure. Do not reuse the old Worker demo `#main-key`.
- Audit query: use `include_decision_report=false` by default and keep full
  decision reports out of public PRs and chat logs.

## Owner Assignment

All pilot gate decision ownership is assigned to Matters current General
Manager. CTO, infra, legal/policy, security, and gateway operator roles are
supporting or execution roles unless the General Manager delegates a specific
decision in writing.

## AWS Readiness Commands

The 2026-05-22 run authenticated AWS CLI as
`arn:aws:iam::903380195283:user/mashbean` and found the gateway origin instance
`i-0a5bca704b0a14b53` online through SSM.

Run these after any later AWS CLI session refresh.

Read-only identity and resource discovery:

```bash
aws sts get-caller-identity --output json
aws s3api list-buckets --query 'Buckets[].Name' --output json
aws ec2 describe-instances \
  --region ap-southeast-1 \
  --filters 'Name=tag:Name,Values=matters-gateway-core-origin-dev' \
  --query 'Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PrivateIp:PrivateIpAddress,IamProfile:IamInstanceProfile.Arn}' \
  --output json
```

If the live origin config path is still
`/etc/matters-gateway/staging.instance.json`, run backup and consistency scan
through SSM on the origin instance:

```bash
aws ssm send-command \
  --region ap-southeast-1 \
  --document-name AWS-RunShellScript \
  --targets 'Key=tag:Name,Values=matters-gateway-core-origin-dev' \
  --parameters 'commands=[
    "cd /opt/matters-gateway/repo/gateway-core",
    "node scripts/backup-sqlite.mjs --config /etc/matters-gateway/staging.instance.json --label pre-outbound-pilot-20260522",
    "node scripts/scan-consistency.mjs --config /etc/matters-gateway/staging.instance.json --label pre-outbound-pilot-20260522"
  ]'
```

Do not paste command output if it contains private paths, credentials, or
private payloads. Summarize only: backup file path, manifest path, integrity
result, and `totalDiffs`.

## 2026-05-22 AWS Evidence

- S3 bucket: `matters-fediverse-prod-bundles`
- Region: `ap-southeast-1`
- Public access block: all four public access block flags enabled.
- Encryption: SSE-S3 / `AES256`, bucket key enabled.
- Versioning: enabled.
- Lifecycle: `pilot/` objects and noncurrent versions expire after 90 days.
- SSM command: `732401b2-f577-499b-8387-20e6b736f361`
- Backup file:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-22-060943152Z-pre-outbound-pilot-20260522.sqlite`
- Backup manifest:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-22-060943152Z-pre-outbound-pilot-20260522.sqlite.json`
- Consistency report:
  `/var/lib/matters-gateway/runtime/consistency-scans/consistency-scan-2026-05-22-060943542Z-pre-outbound-pilot-20260522.md`
- Consistency result: `totalDiffs=5`, all explained as SQLite-only data
  after the SQLite-primary runtime migration; no SQLite omissions and no value
  mismatches.

## Go / No-Go Rule

Go only if all of these are true:

- production remains `record_only` until the pilot send step;
- S3 private storage gate is closed;
- fresh SQLite backup exists;
- latest consistency scan has `totalDiffs=0` or every diff is explained;
- rollback pilot window is named by Matters current General Manager;
- legal takedown response path and privacy notice are approved by Matters
  current General Manager;
- key exposure / rotation decision path is approved by Matters current General
  Manager;
- Lambda and gateway ingestion secret rotation path is approved by Matters
  current General Manager;
- pilot scope is still only `mashbean`, article `1225211`, and known accepted
  Mastodon/Misskey followers.

No-go if Matters current General Manager has not explicitly approved the
remaining owner-gated items, any storage access is public by accident, the
gateway preflight fails, the audit query no longer shows `record_only`, or the
follower target set contains unexpected actors.
