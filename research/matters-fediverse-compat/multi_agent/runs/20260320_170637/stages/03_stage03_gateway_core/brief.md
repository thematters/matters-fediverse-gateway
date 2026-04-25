# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage03_gateway_core`
- Title: Gateway Core
- Owner: architect
- Supporting agents: implementer, reviewer, ops_reviewer
- Goal: 定義並收斂 gateway core 的 endpoint surface、queue、signatures、followers state 與最小 follow flow

## Inputs

- `multi_agent/stage_briefs/stage03_gateway_core.md`
- `outputs/federation-gateway-spec.md`
- `outputs/identity-discovery-spec.md`
- `processed/interoperability-test/plan.md`
- `docs/adr/ADR-003-follower-state-and-key-ownership.md`

## Deliverables

- 補強後的 `federation-gateway-spec.md`
- gateway review gate
- minimum implementation slice 定義
- stage03 handoff

## Done When

- inbox、sharedInbox、followers、keys、queue、retry、dead letter 都有 owner
- minimum follow flow 已定義到 implementer 可動工
- reviewer 與 ops reviewer 對 blocking gate 沒有未解衝突
