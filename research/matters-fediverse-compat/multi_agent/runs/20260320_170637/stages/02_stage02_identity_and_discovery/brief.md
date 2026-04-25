# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage02_identity_and_discovery`
- Title: Identity And Discovery
- Owner: writer
- Supporting agents: architect, reviewer
- Goal: 把 external identity 收斂成 instance-first、單一 canonical actor ID 的 discovery 規格

## Inputs

- `multi_agent/stage_briefs/stage02_identity_and_discovery.md`
- `outputs/identity-discovery-spec.md`
- `outputs/identity-foundation-spec.md`
- `docs/adr/ADR-002-canonical-identity-and-discovery.md`
- `docs/adr/ADR-003-follower-state-and-key-ownership.md`

## Deliverables

- stage02 完整 brief
- `identity-discovery-spec.md`
- review gate 與 handoff

## Done When

- actor ID、profile、outbox、followers、following、WebFinger subject 規則全部一致
- key ownership 與 migration rule 已固定
- stage03 不需要再猜 canonical actor 或 followers owner
