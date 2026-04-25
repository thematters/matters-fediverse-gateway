# Stage Review

- Run ID: `20260320_170637`
- Stage ID: `stage04_social_interop`
- Title: Social Interoperability
- Reviewer scope: Mastodon 黑箱互通、event coverage、boundary drift

## Checks

- `Article` 與 reply thread mapping 是否固定
- inbound `Reply`、`Like`、`Announce`、`Undo` 是否納入驗收範圍
- outbound `Create`、`Update`、`Delete` 是否納入驗收範圍
- non-public content boundary 是否仍明確

## Open Gates

- 需要 stage04 handoff 補上黑箱測試案例與 verify command
- 需要 implementer 確認遠端 object reference 與 delivery record 的 state model
