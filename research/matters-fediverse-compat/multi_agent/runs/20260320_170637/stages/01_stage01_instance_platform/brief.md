# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage01_instance_platform`
- Title: Instance Platform
- Owner: planner
- Supporting agents: writer, architect
- Goal: 固定 Matters 官方 instance 的 canonical domain、platform config schema、NodeInfo owner、policy surface 與 lifecycle mode

## Inputs

- `multi_agent/stage_briefs/stage01_instance_platform.md`
- `outputs/instance-platform-spec.md`
- `outputs/instance-delivery-plan.md`
- `outputs/launch-readiness-checklist.md`
- `docs/adr/ADR-001-federation-architecture.md`
- `docs/adr/ADR-005-instance-governance-surface.md`

## Deliverables

- stage01 完整 brief
- 補強後的 `instance-platform-spec.md`
- stage review 與 stage handoff

## Done When

- canonical domain、lifecycle mode、policy bundle、NodeInfo/software identity owner 都已固定
- `ipns-site-generator`、gateway、control plane 的邊界已固定
- stage02 不需要再猜平台設定從哪個層負責
