# Stage 02 Identity And Discovery

## Objective

把 actor ID、WebFinger、alias policy、followers/following URL、key ownership 固定為可驗證規則。

## Inputs

- `outputs/identity-foundation-spec.md`
- `docs/adr/ADR-002-canonical-identity-and-discovery.md`
- `docs/adr/ADR-003-follower-state-and-key-ownership.md`

## Outputs

- identity review gate
- identity handoff

## Completion Gate

- reviewer 確認不會產生雙主身分
- followers URL、outbox ID、publicKey owner 都有清楚責任
