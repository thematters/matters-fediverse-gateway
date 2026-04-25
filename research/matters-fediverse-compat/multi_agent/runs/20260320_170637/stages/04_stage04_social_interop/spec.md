# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage04_social_interop`
- Title: Social Interoperability
- Owner: writer
- Related paths
  - `outputs/social-interoperability-spec.md`
  - `outputs/federation-gateway-spec.md`
  - `outputs/identity-discovery-spec.md`
  - `processed/interoperability-test/plan.md`
  - `docs/adr/ADR-004-public-content-boundary.md`
  - `docs/adr/ADR-006-longform-object-mapping.md`

## Decisions To Lock

- Matters 公開長文對外 canonical object type 固定為 `Article`
- inbound 要先覆蓋 `Follow`、`Create` reply、`Like`、`Announce`、`Undo`
- outbound 要先覆蓋 `Create`、`Update`、`Delete`
- remote reply、reaction、boost relation 都要保留遠端 object reference
- paid、private、encrypted 內容不進 social interoperability pipeline

## State Owner

- followers 與 actor key 屬於 gateway
- 遠端 object reference、delivery record、reaction linkage 由 gateway state 擁有
- canonical article content 與 article metadata 仍由 `ipns-site-generator` / Matters content side 提供

## Failure Model

- 若 `Article` / reply thread mapping 不固定，Mastodon 黑箱驗收會出現 thread 斷裂
- 若遠端 object reference 不持久化，`Undo`、`Delete`、`Update` 無法正確回收
- 若 boundary 漂移，非公開內容可能被錯送到外部 instance

## Acceptance

- reviewer 可根據事件表建立黑箱驗收
- implementer 可直接開始最小 social loop 切片
- stage05 不需要再重開 public boundary 或 object mapping 討論
