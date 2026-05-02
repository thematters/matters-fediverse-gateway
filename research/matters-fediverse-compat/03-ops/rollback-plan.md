# Matters Gateway Rollback Plan

## Scope

This plan defines how to back out a failed G1 staging or controlled production cutover. It protects ActivityPub identity, SQLite runtime state, and operator evidence before service changes are reversed.

Rollback is an operational action. For production, the launch commander must approve the rollback start time, the chosen restore point, and any external communication.

## Rollback Triggers

Rollback should be considered when:

- public discovery resolves to the wrong actor, domain, or key,
- non-public content appears in federation output,
- admin routes are publicly reachable without approved protection,
- SQLite cannot be backed up or opened,
- delivery queue cannot be inspected,
- signature failures affect all or most remote interactions,
- observability sinks fail during launch and the team loses operational visibility.

## Preserve Before Rollback

1. Record current commit hash and runtime config path.
2. Copy current SQLite file to an evidence path.
3. Run backup if SQLite is readable.
4. Archive latest consistency scan report.
5. Save runtime alerts, metrics, logs, and dead-letter snapshots.
6. Record public smoke failures and timestamps.

## Rollback Paths

### Path A: Routing Rollback

Use when the runtime is unhealthy but the previous service or disabled route remains available.

1. Remove or revert public routing to the gateway hostname.
2. Keep local gateway process running long enough to preserve evidence.
3. Confirm `/.well-known/webfinger`, actor, and NodeInfo no longer point to the broken runtime if the rollback changes discovery.
4. Keep admin access local-only until the incident is closed.

### Path B: Runtime Rollback

Use when the current code/config is bad but routing can stay stable.

1. Stop the current gateway runtime.
2. Restore previous release artifact or commit.
3. Start gateway with the previous known-good config.
4. Run WebFinger, actor, NodeInfo, outbox, inbox rejection, and queue inspection smoke tests.
5. Keep new outbound delivery paused until smoke passes.

### Path C: Data Restore

Use when SQLite state is corrupted or an unsafe migration has modified runtime state.

1. Stop or isolate the runtime.
2. Restore the selected backup to a drill target first.
3. Run consistency scan against the restored target.
4. Promote the restored SQLite file only after human approval.
5. Preserve the corrupted file and all repair reports.

### Path D: Key Rollback

Use when key rotation causes broad signature failures.

1. Keep the overlap window active.
2. Confirm actor document includes the expected current and previous public keys.
3. Do not delete previous key material during the incident.
4. Publish or correct Actor Update only after human approval.

## Post-Rollback Checks

- Public discovery returns expected state or intentionally disabled state.
- Admin routes are protected or local-only.
- Queue is inspectable and no unsafe bulk replay is in progress.
- Backup and consistency scan artifacts exist after rollback.
- Incident record names the root cause, rollback path, and follow-up tasks.

## Communication Notes

- Staging-only rollback can be recorded internally.
- Production rollback may require author, community, partner, or public communication.
- No external communication should be sent from this runbook without the human owner.

