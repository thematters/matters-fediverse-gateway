# Stage 05 Moderation And Ops

## Objective

為 instance 對外互通建立最小可上線的 moderation 與 operations 控制面。

## Inputs

- `outputs/moderation-and-ops-spec.md`
- `processed/governance-risk/memo.md`
- `docs/adr/ADR-004-public-content-boundary.md`

## Outputs

- operations review gate
- launch blocking checklist
- moderation handoff

## Completion Gate

- domain block、rate limit、audit log、dead letter、legal takedown 都有明確控制方式
- 非公開內容邊界可被 reviewer 驗證
