# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage03_gateway_core`
- Title: Gateway Core
- Owner: architect
- Related paths
  - `outputs/federation-gateway-spec.md`
  - `outputs/identity-discovery-spec.md`
  - `processed/interoperability-test/plan.md`

## Decisions To Lock

- gateway endpoint surface
- inbound/outbound queue model
- followers state owner
- signature owner 與 rotation owner
- minimum implementation slice

## Blocking Gates

- HTTP Signatures inbound verification 必須存在
- follow / accept / reject flow 必須有持久化 followers state
- retry、dead letter、audit log 必須至少有基礎可觀測欄位
- public-only boundary 不得在 gateway core 被繞過

## Acceptance

- implementer 可以直接開始最小 follow flow
- reviewer 可依 endpoint 與 state owner 做 protocol gate
- ops reviewer 可依 queue、retry、dead letter 做 operations gate
