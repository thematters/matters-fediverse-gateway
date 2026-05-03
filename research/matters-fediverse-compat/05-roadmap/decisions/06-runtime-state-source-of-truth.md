# Decision 06: Runtime State Source Of Truth

Date: 2026-05-01

## Decision

SQLite runtime state is the primary source of truth for gateway operation.

The JSON file state remains useful for local development, fixtures, migration
support, and compatibility checks, but it should not be treated as the
authoritative runtime state once SQLite is available.

## Consistency Scan Policy

`gateway-core/scripts/scan-consistency.mjs` compares the file state and SQLite
state for followers, inbound objects, and inbound engagements.

Default operation remains dry-run:

```bash
cd gateway-core
npm run scan:consistency
```

If the scan shows differences, operators must inspect the JSON and markdown
reports before any repair.

Because SQLite is the source of truth, the normal repair direction is:

```bash
npm run scan:consistency -- --repair --repair-target file
```

That means: use SQLite as the source and update the JSON file state to match it.

`--repair-target sqlite` is allowed only for explicit migration or recovery from
a known-good file-state backup. It must not be used as the default repair
direction after SQLite has become the runtime source of truth.

## Rationale

- SQLite is the runtime store that supports backup, restore, replay, operational
  drill evidence, and longer-running gateway operation.
- File state is easier to inspect manually, but it is not the target production
  runtime store.
- Repair direction can overwrite divergent records. Choosing SQLite as the
  default source avoids accidentally copying stale JSON state over newer runtime
  data.

## Human Approval Boundary

Dry-run scans do not require product, policy, privacy, legal, deployment, or
credential approval.

Repair requires an operator check of the report and an explicit command. If the
operator intends to repair SQLite from file state, they must first confirm the
file-state backup is intentionally trusted for that run.
