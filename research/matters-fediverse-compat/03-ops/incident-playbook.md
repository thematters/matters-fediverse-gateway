# Matters Gateway Incident Playbook

## Scope

This playbook covers the first G1 operational incidents for Matters Fediverse Gateway. It is written for staging and controlled launch operations, with SQLite as the runtime source of truth.

Legal takedown handling is intentionally limited to evidence preservation and escalation. Policy decisions, user communication, and legal outcomes remain outside this playbook until legal review is complete.

## Incident Severity

| Severity | Meaning | Initial response |
| --- | --- | --- |
| SEV1 | Public federation identity, keys, or privacy boundary is wrong | Stop external delivery if possible, preserve evidence, escalate immediately |
| SEV2 | Delivery, inbox, queue, or observability is degraded | Keep service running if safe, mitigate, monitor queue and alerts |
| SEV3 | Single integration or non-critical admin view is failing | Record issue, run targeted checks, schedule fix |

## Common First Actions

1. Record incident start time, reporter, affected hostname, and commit hash.
2. Preserve logs, audit entries, trace records, dead letters, and evidence snapshots.
3. Check admin runtime storage, metrics, alerts, and delivery queue.
4. Run or inspect the latest SQLite backup.
5. Avoid repair actions until the source of truth is clear.
6. Do not publish external updates, rotate production keys, or notify users without the human owner.

## Scenario A: Signature Failure Spike

Symptoms:

- inbound requests fail signature verification,
- outbound delivery receives repeated 401 or 403 responses,
- remote actor key refresh warnings increase.

Checks:

1. Inspect runtime alerts for HTTP signature and key refresh errors.
2. Check whether failures cluster by remote domain or by all domains.
3. Confirm actor document still exposes the expected public key.
4. Confirm private key path resolves locally and was not replaced accidentally.
5. Check recent key rotation records and overlap window.

Mitigation:

- If all remote domains fail, pause outbound delivery if available and review local key/config.
- If one remote domain fails, keep evidence and mark it as remote-specific unless other signals disagree.
- If rotation is involved, keep previous key overlap until the human key owner decides the next step.

Escalation gate:

- Publishing a corrective Actor Update, changing production key material, or declaring key exposure requires human approval.

## Scenario B: Queue Backlog

Symptoms:

- outbound queue grows,
- dead letters increase,
- delivery latency exceeds target,
- webhook/observability alerts report stale leases or retry spikes.

Checks:

1. Inspect queue depth, stale leases, retryable errors, and dead letters.
2. Confirm network reachability to the affected remote domains.
3. Run storage reconciliation on a drill target if corruption is suspected.
4. Run consistency scan and archive the report before repair.

Mitigation:

- Recover stale leases through the existing runtime path.
- Replay only dead letters that are policy-safe and not blocked by domain or actor rules.
- Keep retry limits intact; do not bypass moderation or domain policy.

Escalation gate:

- Bulk replay, production throttling changes, or public-facing status updates require human approval.

## Scenario C: SQLite Corruption Or Restore Failure

Symptoms:

- gateway cannot open SQLite,
- runtime storage endpoint errors,
- backup or restore script fails,
- sudden missing followers, inbound objects, engagements, or queue records.

Checks:

1. Stop or isolate the affected runtime before writing to the database.
2. Copy the suspect SQLite file for evidence.
3. Run backup/restore drill against a separate target.
4. Run consistency scan against the restored target and archive the report.

Mitigation:

- Restore from the latest known-good backup only after the launch commander approves.
- Treat SQLite as source of truth unless evidence proves the backup is stale and file state is safer for a specific repair.
- Use `--repair` only with an explicit target and archived pre-repair report.

Escalation gate:

- Production restore, data repair direction, or deleting corrupted files requires human approval.

## Scenario D: Remote Implementation Stops Responding

Symptoms:

- one implementation or instance stops accepting follows or deliveries,
- delivery errors cluster by implementation,
- display behavior changes after remote upgrade.

Checks:

1. Confirm local discovery and actor document are still correct.
2. Check whether Mastodon, Misskey, and GoToSocial probes behave differently.
3. Review recent remote response codes and dead letters.
4. Archive an interop run report if the issue is reproducible.

Mitigation:

- Keep local runtime stable and avoid protocol changes until a compatibility report exists.
- Mark remote-specific failures as known interop risk if the gateway remains correct for other implementations.

Escalation gate:

- Contacting remote admins, public statements, or changing federation semantics requires human approval.

## Scenario E: Legal Takedown Request

Allowed local actions:

- preserve request metadata,
- preserve affected object IDs, actor IDs, and audit records,
- mark legal review as pending in internal records.

Not allowed without legal review:

- deciding whether to remove content,
- notifying users or remote instances,
- publishing policy statements,
- destroying evidence.

Escalation gate:

- All legal takedown decisions stay with legal review.

## Evidence Checklist

- incident start and end timestamps,
- affected actor/object/activity IDs,
- related runtime alerts, metrics, logs,
- queue/dead-letter snapshots,
- backup manifest and consistency scan reports,
- mitigation commands and results,
- unresolved risks and follow-up task links.

