# Matters Gateway Launch Runbook

## Scope

This runbook covers the G1 reference gateway launch path for staging or a controlled production cutover. It assumes `gateway-core` is the canonical ActivityPub runtime, SQLite is the runtime source of truth, and file state is used only for migration checks or fallback inspection.

This runbook does not approve production launch by itself. Production cutover still requires human approval for domain routing, key material, external Actor Update publishing, legal/comms readiness, and rollback timing.

## Roles

- Launch commander: owns go/no-go calls and timeline.
- Operator: runs commands, watches runtime health, and records evidence.
- Critic/reviewer: checks acceptance evidence before each gate advances.
- Communications owner: prepares user-facing or partner-facing updates if needed.

## Pre-Flight

1. Confirm branch and release artifact.
   - Record commit hash.
   - Confirm no untracked secret files are staged.
   - Run `git diff --check`.
2. Confirm runtime config.
   - `gateway-core/config/*.instance.json` points to the intended actor domain.
   - SQLite file path is writable and backed up.
   - Private key paths exist outside tracked files.
   - Webhook tokens and external sink URLs are stored outside git.
3. Confirm gateway checks.
   - `cd gateway-core`
   - `node --test`
   - `node scripts/check-secret-layout.mjs --config ./config/dev.instance.json`
   - `node scripts/check-rollout-artifact.mjs --env-file ./deploy/matters-gateway-core.env.example`
4. Confirm persistence health.
   - `node scripts/backup-sqlite.mjs --config ./config/dev.instance.json --label pre-launch`
   - `node scripts/scan-consistency.mjs --config ./config/dev.instance.json --label pre-launch`
   - Review JSON and markdown consistency reports.
5. Confirm observability.
   - Run staging observability drill with required sinks in the target environment.
   - Confirm alerts, metrics, and logs dispatch successfully.
6. Confirm access control.
   - Public federation hostname is reachable.
   - Admin surface is protected or intentionally local-only.
   - Webhook receiver is protected by bearer token or an approved equivalent.

## Cutover

1. Freeze changes during the cutover window.
2. Start gateway runtime with the approved config.
3. Start reverse proxy or tunnel connector.
4. Start webhook receiver if external observability sinks are in use.
5. Switch public routing only after local health checks pass.
6. If rotating keys, keep overlap window active before publishing the generated Actor Update.
7. Record all timestamps, command results, and public smoke URLs.

## Post-Cutover Smoke

Run these checks from outside the runtime host where possible:

- `/.well-known/webfinger?resource=acct:<handle>@<domain>` returns the canonical actor.
- `/.well-known/nodeinfo` points to the expected NodeInfo endpoint.
- Actor document includes the expected public key.
- Outbox returns public Article objects only.
- Inbox rejects unsigned or invalidly signed requests.
- Follow accept flow still works in the selected test environment.
- Admin runtime storage, metrics, alerts, and delivery queue views are available only through the approved admin path.

## Go/No-Go Criteria

Go is allowed only when:

- tests and secret layout checks pass,
- backup and consistency scan artifacts exist,
- public discovery endpoints return expected data,
- admin surface is protected or local-only,
- observability sinks dispatch without errors,
- rollback owner confirms the rollback window is still available.

No-go is required when:

- any secret appears in tracked files or logs,
- SQLite cannot be backed up,
- consistency scan shows unexplained drift,
- discovery points to the wrong actor or domain,
- admin surface is publicly exposed without approved access control,
- delivery queue cannot be inspected,
- legal/comms requirements for the target launch are not accepted.

## Evidence To Archive

- commit hash and config file names,
- backup manifest path,
- consistency scan JSON and markdown paths,
- observability drill report path,
- public smoke command output,
- go/no-go timestamp and owner,
- rollback decision timestamp if invoked.

