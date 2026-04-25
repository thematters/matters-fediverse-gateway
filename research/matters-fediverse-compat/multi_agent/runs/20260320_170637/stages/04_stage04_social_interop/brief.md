# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage04_social_interop`
- Title: Social Interoperability
- Owner: writer
- Supporting agents: architect, implementer, reviewer
- Goal: 固定 public social loop 的入站、出站、內部事件映射與黑箱驗收條件

## Inputs

- `multi_agent/stage_briefs/stage04_social_interop.md`
- `outputs/social-interoperability-spec.md`
- `outputs/federation-gateway-spec.md`
- `outputs/identity-discovery-spec.md`
- `processed/interoperability-test/plan.md`
- `docs/adr/ADR-004-public-content-boundary.md`
- `docs/adr/ADR-006-longform-object-mapping.md`
- repo-level handoff 與 active run state

## Deliverables

- social interoperability spec
- ADR-006 longform object mapping
- social loop review gate
- stage04 handoff

## Done When

- public social loop 的事件表已固定
- Mastodon 黑箱驗收案例已固定
- implementer 不需要再猜 `Article`、reply、like、announce、undo、delete 的處理邊界
