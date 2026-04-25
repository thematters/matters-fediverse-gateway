# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage01_instance_platform`
- Title: Instance Platform
- Owner: planner
- Related paths
  - `outputs/instance-platform-spec.md`
  - `outputs/instance-delivery-plan.md`
  - `outputs/launch-readiness-checklist.md`

## Decisions

- 第一個產品形態固定為 Matters 官方營運單一 instance
- canonical domain 與 handles domain 必須由 instance control plane 擁有
- `ipns-site-generator` 只處理內容輸出，不處理 instance lifecycle、NodeInfo、policy bundle
- public-only federation boundary 在 stage01 就固定，不等到 social interop 才補
- platform mode 固定為 `disabled`、`read_only`、`federating`、`maintenance`

## State Owner

- instance metadata、NodeInfo、software identity、policy bundle 屬於 instance control plane
- delivery、followers、signatures 屬於 federation gateway
- public content representation 屬於 `ipns-site-generator`

## Failure Model

- canonical domain 若未固定，stage02 identity and discovery 全部阻塞
- NodeInfo owner 若漂移，gateway 與 control plane 會重複對外宣告軟體身分
- public-only boundary 若不先鎖定，後續 social loop 有誤送非公開內容風險

## Acceptance

- reviewer 可逐項檢查 platform blockers 是否已固定
- implementer 可直接據此開始 stage02 與 stage03
- stage02 不再需要重開 platform 邊界討論
