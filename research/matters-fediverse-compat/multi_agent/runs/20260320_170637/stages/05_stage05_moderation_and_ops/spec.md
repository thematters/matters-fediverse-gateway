# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage05_moderation_and_ops`
- Title: Moderation And Ops
- Objective: 定義 moderation、domain policy、abuse handling、delivery retry 與 launch control 面
- Agents: writer, ops_reviewer, reviewer, editor
- Related paths:
  - `research/matters-fediverse-compat/outputs/moderation-and-ops-spec.md`
  - `research/matters-fediverse-compat/outputs/launch-readiness-checklist.md`
  - `research/matters-fediverse-compat/docs/adr/ADR-004-public-content-boundary.md`

## Decisions To Lock

- policy source 在 control plane，gateway 負責 enforcement
- blocklist、account suspend、rate limit、retry、dead letter 都屬於 launch blocker
- non-public content boundary 是 moderation 與 launch gate 的共同責任
- legal takedown 與 self-delete 必須走不同 audit reason

## Controls

- instance-level blocklist / allowlist
- actor-level suspend / deny
- retry budget / dead letter threshold
- audit log / incident trace
- takedown intake / case record

## Failure Model

- policy source 不可用時，gateway 預設拒絕新互動
- dead letter 無人工處理能力時，不得宣稱 ready for launch
- non-public content boundary 無法判斷時，預設不 delivery
- legal action 缺 audit trail 時，不得執行不可逆刪除

## Acceptance

- implementer 與 reviewer 可直接對齊
- ops reviewer 可直接用這份 spec 做 operations gate
- stage06 可在既有 policy owner 基線上討論多 instance scope
