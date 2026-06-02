# Matters Instance Interoperability Progress

## Current Status

- branch  
  `codex/matters-gateway-stage03-alert-webhook`
- current engineering focus  
  `gateway-core`
- current next step  
  `Stage 03` production gap 已補 webhook alert sink、Slack incoming webhook alert routing、queue durability baseline、external metrics sink、structured logs、observability staging drill runner、deployment topology baseline artifact、secret layout check、reverse proxy baseline，以及 rollout artifact baseline；本機 staging-style generic webhook drill 與 Cloudflare Tunnel public transport smoke 已通；Zero Trust 權限尚未開通前採 temporary no-Zero-Trust mode：`staging-admin` public hostname 回 404，admin 只走本機，`staging-hooks` 維持 bearer-token public；W2 consistency scan 已可比較 file state / SQLite 的 followers、inbound objects、engagements 並輸出 JSON + markdown 報表；W8 三份 runbook 已完成，實際 tabletop 可在不阻塞開發的情況下延後；G2-A preflight 已推進到 real matters.icu public-only Lambda dry-run、gateway runtime ingestion、WebFinger / actor / outbox / NodeInfo public probe、SQLite consistency scan、Misskey read-only probe；G2-B server/web product controls 已 merge to develop 並部署到 `matters.icu`，`mashbean@matters.town` staging admin / `fediverseBeta` API gate 已通，公開文章 `23520` strict gate eligible、付費文章 `23522` 維持 `article_not_public`；pilot-owned public article `23525` 已通過 browser UI QA、strict-gate Lambda、gateway public probe、Misskey read-side resolve、PR #29 actor discovery hints，以及 staging outbound `Update` delivery to g0v.social / gyutte.site；2026-05-15 已在 `matters-server-develop` 啟用 `record_only`，新 staging 文章 `23534` 的 publish/edit 都寫入 `federation_export_event`，狀態為 `record_only` / `recorded` / `eligible`，且 `inherit` 符合作者 opt-in 預設規則；Mastodon read-back repeatability 與 bounded staging `Delete` proof 已完成；Cloudflare Meta crawler skip rule 已擴到 staging 與 canonical pilot Fediverse paths，`check:threads-discovery -- --canonical-base-url https://matters.town` 回 `ok: true`，`acct:mashbeanmatters@matters.town` WebFinger 對 Meta UA 回 200，主站首頁/文章頁 smoke 仍回 200；g0v.social Mastodon 與 gyutte.site Misskey 對 canonical handle 的 read-only resolve 已通；AWS persistent canonical gateway-core origin 已建立於 `dev-vpc` private subnet，Node 20 / better-sqlite3 / Cloudflare Tunnel `gateway-core-origin.matters.town` 已通，canonical actor key 已在 EC2 內生成，gateway-core service 已 enabled / active，Worker `GATEWAY_CORE_ORIGIN` 已切到 origin，live healthz 顯示 `gateway-core-proxy` / `inboxMode=persistent` / `followReadiness=ready`，invalid inbox probe 由 gateway-core 回 401；Mastodon 與 Misskey visible canonical follow proof 已完成，其中 Misskey 需使用新的 gateway-core key id 避免早期 Worker demo key cache；canonical pilot Article 已送達 g0v.social / gyutte.site，Mastodon 與 Misskey readback 皆通，Misskey reply / like / renote 回傳已落 SQLite；2026-06-02 fresh production pilot Article `https://matters.town/a/n0wacr6zgyyq` 已 bounded `Create` 到 g0v.social / gyutte.site，AWS origin 已部署 runtime outbox readback 修正，public outbox 顯示 `totalItems=1` 且 Threads discovery diagnostics `ok=true`；下一個工程步驟是 receiver-visible readback refresh、Threads follow compatibility investigation、Mastodon write-scope interaction proof、以及 production gate closure；production full outbound delivery 仍未啟用

## Stage Progress

- `Stage 01 Instance Platform`  
  完成  
  instance domain、brand metadata、policy surface、NodeInfo 規格已定義
- `Stage 02 Identity And Discovery`  
  完成  
  canonical actor URL、WebFinger subject、alias policy、key ownership 規則已定義
- `Stage 03 Gateway Core`  
  進行中  
  已完成 runtime scaffold、WebFinger、actor、followers、NodeInfo、Follow accept/reject、HTTP signature verification、followers state、retry / dead letter、remote actor discovery、key refresh、static outbox bridge、SQLite persistence baseline，以及第一輪真實 Mastodon 黑箱驗證  
  SQLite backup、restore、reconciliation、backfill、queue observability、alerting、structured metrics、alert routing 已有最小切片  
  external alert sink 已先補 webhook dispatch baseline，admin runtime alerts 與離線 dispatch script 都可直接送出 alerts + metrics bundle  
  Slack incoming webhook alert routing 已補 provider-specific baseline，admin runtime alerts 與離線 dispatch script 都可直接送出 Slack payload  
  outbound queue durability 已補 processing lease、stale lease recovery、restart recovery 與 file-store atomic persist baseline  
  external metrics sink 已補 webhook dispatch baseline，admin runtime metrics 與離線 metrics script 都可直接送出 metrics bundle  
  structured logs 已補 webhook dispatch baseline，admin runtime logs 與離線 logs script 都可直接送出 audit / trace bundle  
  observability staging drill runner 已補 baseline，可一次輸出 alerts、metrics、logs bundle 與 report，並驗證各自 sink dispatch  
  deployment topology baseline artifact 已補 staging config 範本與 topology 基線圖  
  secret layout check 與 reverse proxy baseline 已補 `check:secret-layout`、staging secrets layout 範本與 `Caddyfile.example`  
  rollout artifact baseline 已補 systemd unit、rollout env example 與 `check:rollout-artifact`  
  restore / replay drill runbook 已補齊  
  本機 staging-style generic webhook drill 已通；Cloudflare Tunnel public transport smoke 已用 `staging-gateway.matters.town`、`staging-admin.matters.town`、`staging-hooks.matters.town` 跑通；no-new-cost hosting review 建議先採既有 Mac + Cloudflare Tunnel，`staging-admin` Access allowlist 已確認為三個 Matters emails，但 Cloudflare dashboard 要求 Billing edit permission 才能完成 Zero Trust onboarding；臨時策略改為 local proxy 擋 public admin，`staging-hooks` 先維持 public bearer-token
- `Stage 04 Social Interop`  
  進行中  
  inbound public `Create` / `Reply` 已可驗章並持久化  
  inbound `Like` / `Announce` 已可驗章並落 engagement state  
  inbound `Undo` 與 outbound `Update` / `Delete` 已有最小切片  
  outbound reply / reaction fan-out、mention mapping 已有最小切片  
  thread reconstruction、local mention mapping、admin thread query 已有最小切片  
  local conversation projection、mention backfill、orphan reply reconciliation、social reconcile `dryRun` 已有最小切片  
  remote mention resolution、error policy、failure cache / retry boundary、admin mention query 已有切片  
  local content projection、conversation action matrix、delivery-aware action matrix、admin local content query 已有切片  
  notification model projection、admin local notification query、read state、grouping 已有切片  
  outbound-authored content projection 已有切片  
  delivery activity-level collapse 已有切片
  content delivery drilldown 與 content-context replay 已有切片
  content delivery review queue 與 richer dashboard summary 已有切片
  review queue / dashboard 的 unique activity summary 已有切片
  review queue / dashboard 已有 store-backed snapshot source
  review queue / dashboard / activity index / activity replay 已收斂成 actor-scoped persisted projection bundle
  content delivery activity index 已有切片
  content delivery activity replay 已有切片
  review queue item ops 已補 replayableItems、replayCount、lastReplayAt、staleSince
  review queue / dashboard 已補最小 ops filter，包含 actorHandle、status、replayedOnly、replayableOnly
  activity drilldown 已補 actorHandle、status、activityId filter
  activity index 已補 replayedOnly、replayableOnly filter
  replayedOnly 已改為依 activity recipient queue item 歷史判斷，不會因 replay 後轉成 pending 就失去命中
  review queue response 已補 `filteredSummary`，filter 後的 item list 與摘要視角已對齊
  review queue / dashboard 的 content delivery snapshot 已補 `appliedFilters`
  review queue / dashboard 的 content delivery snapshot 已補 `viewSummary` 與 `summaries.current`
  review queue / dashboard 的 content delivery snapshot 已補 `canonicalSummaryKey` 與 `summaryAliases`
  review queue / dashboard 的 content delivery snapshot 已補 `currentSummaryMode`
  review queue / dashboard 的 content delivery snapshot 已補 `contractVersion` 與 `legacySummaryKeys`
  review queue / dashboard 現在共用 content delivery summary contract normalization helper
  review queue / dashboard 的 content delivery snapshot 已補 `contract` 子物件
  review queue / dashboard 的 content delivery snapshot 已補 `contract.legacyFields`
- `Stage 05 Moderation And Ops`  
  進行中  
  domain block、abuse queue、audit log 已有最小 runtime  
  account suspend、legal takedown、admin dashboard 已有最小 runtime  
  instance-level / actor-level rate limit 已有最小 runtime  
  evidence retention 已有最小 runtime  
  manual replay control 已有最小 runtime  
  richer actor-level policy 已有最小 runtime
- `Stage 06 Multi-Instance Control Plane`  
  規格完成  
  runtime 還沒落 instance registry、per-instance config、namespace isolation
- `Stage 07 Launch Readiness`  
  規格完成  
  真實互通驗收、營運演練與 launch checklist 還沒跑
- `G2-A Production Data Integration`
  preflight 進行中
  已完成 `matters-server` / `ipns-site-generator` / `lambda-handlers` / `gateway-core` repo-backed gap scan；`matters-server` PR #4761 已 merged to develop 並部署到 `matters.icu`；`ipns-site-generator` PR #161 已 merged to main；`lambda-handlers` PR #223 已部署 `federation-export-dev` v0.14.1；最新 public-only GitHub Actions dry-run `25695506631` 使用 public article `23520` 與 paywalled article `23522`，結果 `23520` eligible、`23522` skipped as `article_not_public`。`gateway-core` 已用 SQLite runtime 消化該 deployed-Lambda bundle，public probe 覆蓋 WebFinger、actor、outbox、NodeInfo discovery、NodeInfo 2.1，SQLite consistency scan 0 diff，Misskey read-only probe resolve `zeckagent3@staging-gateway.matters.town` 並確認 followers collection 有 1 recipient。
- `G2-B Product Controls`
  staging API validation passed; browser UI QA and outbound delivery passed for pilot-owned public article
  `matters-server` PR #4773 已 merged to develop 並部署到 `matters.icu`；`matters-web` PR #5883 已 merged to develop 並部署到 `matters.icu`；`server.matters.icu` schema 已確認包含 `User.federationSetting`、`Article.federationSetting`、`Article.federationEligibility`、`setViewerFederationSetting`、`setArticleFederationSetting`、`UserFeatureFlagType.fediverseBeta`。`mashbean@matters.town` 已確認為 staging admin test account，已加上 `fediverseBeta`，account-level federation setting 已設為 `enabled`。real staging GraphQL gate 驗證顯示 public article `23520` 在 author opt-in 後回 `eligible`，paywalled article `23522` 仍回 `article_not_public`。Lambda strict-gate workflow run `25712528545` 成功，2 rows selected、1 eligible、1 skipped，輸出 bundle 含 7 個檔案；`gateway-core` 已用該 bundle 完成本機 ingestion、WebFinger / actor / outbox / NodeInfo probe、SQLite consistency scan `totalDiffs=0`，且 public `staging-gateway.matters.town` probe 仍通。2026-05-12 另以 browser UI 建立 pilot-owned public article `23525` (`ckl5le599uwc`)，確認 account settings Fediverse row enabled、article edit Fediverse override 顯示 `Follow author setting`，Lambda strict-gate workflow run `25713858021` 成功，1 selected、1 eligible、0 skipped；public staging gateway 已切到 `mashbeanmatters@staging-gateway.matters.town`，WebFinger / actor / outbox / NodeInfo public probes 通過，gyutte.site Misskey read-side `users/show` 可解析。下一個工程步驟是 export trigger contract / decision report retention / replay suppression；production 仍未啟用。
  2026-05-15 PR #29 已 merged，staging actor 補上 `discoverable` / `indexable` / Mastodon `toot` context；Cloudflare public actor 與 WebFinger 回 `no-store` / `DYNAMIC`。同日對 article `23525` 送出 staging outbound `Update`，g0v.social 與 gyutte.site 兩位 accepted followers 均 delivered；delivery queue 回 0 pending / 0 processing / 0 dead letter，post-delivery SQLite consistency scan `totalDiffs=0`。g0v.social Mastodon read-only app 已建立，API 可 resolve `mashbeanmatters@staging-gateway.matters.town` 並讀取近期 staging objects；`check:mastodon-readback` 已自動化此檢查。bounded staging `Delete` proof 已完成：staging object `staging-delete-proof-20260515T120541Z` 的 `Create` / `Delete` 均 delivered 到 g0v.social 與 gyutte.site，且 g0v.social 對刪除後 status 回 `404`。Cloudflare staging-only custom rule `skip-staging-fediverse-meta-crawlers` 已啟用，`meta-externalagent/1.1` 對 staging WebFinger / actor / outbox / NodeInfo probes 不再被 403 擋住；`check:threads-discovery` 回 `ok: true`。Threads UI 仍查無 staging actor，現列為平台索引/canonical identity compatibility，不阻塞 Mastodon/Misskey staging signoff。`POST /jobs/inbound-reconciliation` 已實作並補上 scheduler bearer token guard，讓已知 public remote Activity URLs 可以定期跑同一條 policy-checked reconcile path；`run:inbound-reconciliation` 只接受明確列出的 public `https` Activity URLs，作為 Mastodon reply delivery gap 的最小 operational fallback。PR #30 merged 後，Mac-hosted staging gateway 已重啟到 merged code，scheduler token file 已接入 runtime config，每 15 分鐘跑一次 bounded reconciliation loop；空 source 會寫 no-op 報告。公開 g0v.social reply Activity `116575631875488289/activity` 已經透過 scheduler path 重跑，SQLite 已有該 inbound reply，post-run consistency scan `totalDiffs=0`。

## Engineering Milestones

- `M1` 研究 baseline 與 multi-agent workflow  
  完成
- `M2` gateway core minimum slice 第一版  
  完成
- `M3` remote actor discovery 與 key refresh boundary  
  完成
- `M4` static outbox bridge  
  完成
- `M5a` local sandbox interop harness  
  完成
- `M5` Mastodon sandbox interop  
  第一輪黑箱驗證已完成
- `M6` inbound `Create` / `Reply` persistence  
  完成
- `M6b` inbound `Like` / `Announce` persistence  
  完成
- `M6c` inbound `Undo` 與 outbound `Update` / `Delete`  
  完成
- `M6d` outbound reply / reaction fan-out 與 mention mapping  
  完成
- `M6e` thread reconstruction 與 richer local mention mapping  
  完成
- `M6f` local conversation projection 與 social reconcile baseline  
  完成
- `M6g` remote mention resolution 與 engagement action matrix baseline  
  完成
- `M6h` local content projection 與 content model baseline  
  完成
- `M6i` remote mention error policy、failure cache 與 admin query  
  完成
- `M6j` notification model projection 與 delivery-aware content action matrix  
  完成
- `M6k` notification read state 與 grouped feed  
  完成
- `M6l` outbound-authored content projection  
  完成
- `M6m` delivery activity-level collapse  
  完成
- `M6n` content delivery drilldown 與 content-context replay  
  完成
- `M6o` content delivery review queue 與 richer dashboard summary  
  完成
- `M7` SQLite persistence baseline  
  完成
- `M7b` SQLite ops baseline  
  完成
- `M8` moderation baseline runtime  
  完成
- `M8b` actor suspend、legal takedown、admin dashboard baseline  
  完成
- `M8c` rate limit baseline runtime  
  完成
- `M8d` evidence retention runtime  
  完成
- `M8e` manual replay control runtime  
  完成
- `M8f` remote actor policy runtime  
  完成
- `M7c` SQLite recovery / alerting runtime  
  完成
- `M7d` observability runtime baseline  
  完成
- `M7e` external alert webhook sink  
  完成
- `M7f` outbound queue durability baseline  
  完成
- `M7g` external metrics sink baseline  
  完成
- `M7h` structured logs baseline  
  完成
- `M7i` Slack incoming webhook alert routing  
  完成
- `M7j` observability staging drill runner  
  完成
- `M7k` deployment topology baseline artifact  
  完成
- `M7l` secret layout and reverse proxy baselines  
  完成
- `M7m` rollout artifact baseline  
  完成
- `M6` full social loop  
  進行中

## Verification Snapshot

- `cd gateway-core && runtime/tools/node-local --test`
  111 tests passing
  local conversation projection 與 social reconcile `dryRun` 已覆蓋
  remote acct mention resolution 已覆蓋
  remote mention retryable / permanent failure policy、failure cache、admin mention query 已覆蓋
  notification projection、read state、grouped feed、delivery-aware content action matrix、activity-level delivery collapse、content delivery drilldown、review queue / dashboard summary、unique activity summary、activity-level replay 與 local notification query 已覆蓋
  Misskey sandbox probe 已對 gyutte.site public instance 跑通；GoToSocial 依目前決策暫不執行
  local content projection、outbound-authored content projection、stable partial content key、richer action matrix、review queue store-backed snapshot、cross-content activity index 與 activity index persistence 已覆蓋
  review queue item ops read model 的 replayableItems、replayCount、lastReplayAt、staleSince 已覆蓋
  review queue / dashboard 的 replayedOnly、replayableOnly filter、review queue `filteredSummary`、`appliedFilters`、activity index replay filter 與 activity drilldown 的 activityId filter 已覆蓋
  runtime alert webhook dispatch、config-driven webhook sink、admin dispatch sink audit、CLI webhook dispatch、Slack provider payload shaping、CLI Slack dispatch、observability drill runner、drill report、secret layout checker script 已覆蓋
  2026-05-01 本機 staging-style observability drill 已用 ignored secret files、SQLite runtime state 與 generic webhook receiver 跑通；alerts / metrics / logs 三組 sink 皆回 202
  2026-05-02 Cloudflare staging transport smoke 已用 local Mac + Cloudflare Tunnel 跑通；`staging-gateway.matters.town` 與 `staging-hooks.matters.town` 回 200，`staging-admin.matters.town` 在 no-Zero-Trust mode 下維持 404；alerts / metrics / logs 三組 bundle 送到 generic webhook receiver 皆回 202；封存報告見 `research/matters-fediverse-compat/03-ops/staging-observability-drill-20260502-cloudflare.md`
  2026-05-02 `better-sqlite3` 已確認安裝；Codex app Node 載入 native module 會遇到 macOS code-signature mismatch，因此 staging 服務用 ignored `runtime/tools/node-local` ad-hoc signed copy 啟動；測試子程序已改用 `process.execPath`
  2026-05-02 staging hosting / Access review 已封存於 `research/matters-fediverse-compat/03-ops/staging-hosting-access-plan-20260502.md`；Access setup blocked by Cloudflare dashboard because current login lacks required Billing edit permission
  2026-05-02 temporary no-Zero-Trust mode 已落地：新增 `scripts/run-staging-local-proxy.mjs`，Caddy tunnel 範例預設讓 `staging-admin` 回 404；測試覆蓋 public gateway pass-through、public admin/jobs blocking、admin hostname 404 與 unknown host 421
  2026-05-02 W2 consistency scan 已確認可跑：`scan-consistency.mjs` 比對 followers、inbound objects、engagements，dry-run 預設輸出 JSON + markdown，`--repair --repair-target file|sqlite` 需顯式指定；本機 scan 顯示 0 diffs，targeted tests 2/2 passing
  2026-05-02 W8 launch / incident / rollback runbooks 已完成；tabletop record template 已完成；實際 2+ participant tabletop 尚未執行，仍是下一個真人 gate
  2026-05-02 W3 Misskey public interop 已跑通：gyutte.site 成功 resolve `alice@staging-gateway.matters.town`、follow remote actor，relationship 顯示 `isFollowing: true`；報告見 `research/matters-fediverse-compat/03-ops/misskey-public-run-20260502T152117Z.md`。`ap/show` 對此 actor 回 400，probe 已補 `users/show` fallback；重跑時 `ALREADY_FOLLOWING` 會視為已收斂。GoToSocial 依目前決策暫跳過。
  2026-05-02 W4a Misskey display follow-up 已封存於 `research/matters-fediverse-compat/03-ops/article-display-compatibility-20260502.md`；gyutte.site 不會回填既有 outbox Article，但已透過 `scripts/run-misskey-article-display-probe.mjs --send --confirm-public-create` 送出 public staging `Create`。gateway 投遞到 gyutte.site follower 回 `delivered`，Misskey `users/notes` 出現 matched note；text-only Article display API path 已驗證。後續 media fixture 也已送出：外部 PNG 與 IPFS-normalized JPEG 都出現在 Misskey `files[]`，有 media URL 與 thumbnail；真人 UI 視覺審查已由 mashbean 確認通過。
  2026-05-02 G2-A production data integration preflight 已封存於 `research/matters-fediverse-compat/02-runtime-slices/g2a-production-data-integration-slice.md` 與 `docs/tasks/matters-g2-a-production-data-integration.md`；`ipns-site-generator` release-readiness 已通過 `npm test -- --runInBand` 9/9 與 `npm run lint`，並在 branch `codex/release-ipns-activitypub-bundle` commit `0cd6e88` bump 到 `0.1.9`；npm publish 因 `@matters` scope 權限卡住，因此 `matters-server` draft PR #4761 暫用 vendored tarball。`matters-server` 目前已有 exporter scaffold、local writer、CLI、eligibility gate、settings migration scaffold、strict mode、migration-safe default export、decisionReport 與 DB loader tests；Node 18 local verification passed，targeted Jest 18/18，`federationExportService.ts` line coverage 97.61%。`gateway-core` rebuild `better-sqlite3` 後 `npm test` 117/117 passing。PR #4761 GitHub Actions build 已通過，但 Codecov patch/project 仍失敗；下一步是修 coverage，npm registry migration 排在其後。
  2026-05-11 G2-A deployed-Lambda public-only regression 已重跑：GitHub Actions run `25695506631` passed；`gateway-core/scripts/run-matters-icu-staging-check.mjs` 用 artifact 產生 `runtime/matters-icu-staging-20260511-public-only-latest`，manifest v1 / federatedPublicOnly / public article count / paywall skip decision 皆通過；public gateway probe 回 200 並覆蓋 WebFinger、actor、outbox、NodeInfo discovery、NodeInfo 2.1；`scan-consistency.mjs` 對 latest runtime 回報 totalDiffs 0；Misskey read-only dry-run 未送 public Create，但成功 resolve actor、讀取 users/notes，並確認 followersTotalItems 1。
  2026-05-11 G2-B server/web develop deploys passed：server run `25699693933` success、web run `25699702018` success；`matters.icu` HTTP 200；`server.matters.icu` schema 已看到 federation setting / eligibility / pilot mutation fields。read-only GraphQL 驗證保守預設正確，public article `23520` 在 author 未 opt-in 前被擋，paywalled article `23522` 被 `article_not_public` 擋住。
  2026-05-11 Lambda G2-B dry-runs passed：public-only run `25700094845` 回 `selected=2`、`eligible=1`、`skipped=1`；strict-gate row-level run `25700094876` 在 `authorFederationSetting=enabled`、`articleFederationSetting=inherit` 下仍保持 public article eligible / paywalled article blocked。
  2026-05-11 local gateway verification refreshed：`npm test` 117/117 passing；`npm run scan:consistency` totalDiffs 0；`npm run check:rollout-artifact` OK；`npm run check:secret-layout` OK。
  2026-05-15 local gateway verification refreshed：`npm test` 122/122 passing；`check:mastodon-readback` against g0v.social returned `ok: true`；bounded staging `Delete` proof delivered to g0v.social / gyutte.site and g0v.social returned `404` for the deleted status。
  2026-05-16 canonical pilot read surface deployed：Cloudflare Worker deploy `c48024e3-c249-4402-824b-7d199ace5a7f` set `CANONICAL_PILOT_HANDLES=mashbeanmatters` for `matters.town` federation routes only；custom rule `skip-fediverse-meta-crawlers` now skips WAF/rate-limit/BIC/Super Bot Fight Mode only for Meta crawler UAs on narrow staging and canonical Fediverse paths；`check:threads-discovery -- --canonical-base-url https://matters.town` returned `ok: true`；direct WebFinger probes for `facebookexternalua`、`facebookexternalhit/1.1`、`meta-externalagent/1.1` returned 200；main-site smoke for `https://matters.town/` and `https://matters.town/a/hwj8ajpbc048` returned 200；Threads web UI search still did not show the canonical profile.
  2026-05-16 canonical read-only social discovery passed：`check:mastodon-readback -- --acct mashbeanmatters@matters.town` resolved g0v.social remote account `mashbeanmatters@matters.town` with uri `https://matters.town/ap/users/mashbeanmatters`；gyutte.site Misskey `users/show` resolved the same handle and actor URI. Follow proof is intentionally left separate because it creates canonical pilot follower state.
  2026-05-16 canonical follow readiness preflight deployed：Worker deploy `b002f589-f9d3-4cf3-b389-0e137e36efc9` added `/ap/healthz` runtime reporting and `check:follow-readiness`；Worker deploy `7f9077c0-5dc8-4164-8793-83d437508758` fixed `/ap` prefix stripping before proxying canonical inbox POSTs to gateway-core；Worker deploy `7096c2e3-4e03-4133-9b0d-3ac7547be482` added gateway-core `/healthz` origin contract checking before `followReadiness=ready`；當時 live check 因 origin 尚未啟用而回 blocked，後續 2026-05-17 AWS gateway-core origin 已接上並使 readiness 轉為 `ok: true`。Main-site smoke for `https://matters.town/` and `https://matters.town/a/hwj8ajpbc048` still returned 200.
  2026-05-17 canonical profile URL repair deployed：gateway-core PR #54 stopped deriving actor profile URLs from the `/ap` ActivityPub path and deployed AWS origin commit `201993b`; Cloudflare Worker PR #55 then fixed pilot WebFinger profile-page aliases and deployed Worker version `675d2601-7960-4a52-bbb2-7d14dc642480`. Live probes now show WebFinger aliases `https://matters.town/@mashbeanmatters` and `https://matters.town/ap/users/mashbeanmatters`; the actor document `url` also returns `https://matters.town/@mashbeanmatters`; `check:follow-readiness -- --base-url https://matters.town --handle mashbeanmatters` returned `ok: true`. Threads can discover the canonical profile but follow still does not complete. PR #57 then made outbound Accept activities dereferenceable through `/ap/activities/*`; AWS origin and Worker were deployed, and the staging actor key id was moved from the old Worker demo `#main-key` to `#gateway-core-20260517`. After gyutte.site remote-user refresh and cancel/re-follow, Misskey `users/relation` returned `isFollowing: true`.
  2026-05-17 canonical pilot Article visibility and interaction proof passed：pilot Article `https://matters.town/ap/articles/canonical-pilot-article-20260517t042821z` delivered to `https://g0v.social/users/mashbean` and `https://gyutte.site/users/819de678273e9b120fd654b5`；Mastodon readback found status `116588026424982635`；Misskey `users/notes` found note `819e34313973c61ee9c1da0e`；Misskey reply `819e3432509b85525fb5db37`、reaction like `819e343250f7d796cd6589a4`、renote `819e34325149224d4f2fb3a3` all returned to gateway-core and traces recorded `reply.stored`、`like.stored`、`announce.stored`。Mastodon interaction proof remains pending because the current g0v.social token is read-only and returned 403 for write actions.
  `cd gateway-core && npm run check:secret-layout` 已可驗證 dev config 內的 key file 參考
  `cd gateway-core && npm run check:rollout-artifact` 已可驗證 rollout env example
  outbound queue processing lease、stale lease recovery、restart recovery 與 delivery job pre-dispatch recovery 已覆蓋
  runtime metrics webhook dispatch、config-driven metrics sink、admin metrics dispatch audit 與 CLI metrics dispatch 已覆蓋
  runtime logs webhook dispatch、config-driven logs sink、admin logs dispatch audit 與 CLI logs dispatch 已覆蓋
- 本地 smoke test  
  `/.well-known/webfinger` 可正常回應 canonical actor
  `/users/alice/outbox` 可回應由靜態 `outbox.jsonld` 橋接而來的公開文章集合
- `cd gateway-core && npm run check:local-sandbox`  
  可完成 canonical discoverability、bridged outbox 與 signed `Follow` -> `Accept` 驗證
- `cd gateway-core && npm run check:mastodon-sandbox`  
  已在 `mastodon.social` 對公開 trycloudflare gateway 跑過第一輪黑箱驗證，結果 `ok: true`
- 2026-05-01 補充  
  canonical `acct:matters@matters.town` 已透過 Cloudflare Worker routes 上線，並由 `g0v.social` 完成 exact discovery 與 inbound follow delivery；`mastodon.social` exact discovery 仍保留為 instance-side cache / remote-resolution retest
- 正式部署缺口清單  
  見 `production-deployment-gaps.md`
