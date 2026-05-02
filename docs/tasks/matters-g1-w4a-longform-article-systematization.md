---
task_slug: matters-g1-w4a-longform-article-systematization
status: done
goal: 把 ActivityPub Article 型別作為 Matters 對外聯邦長文的主型別，並系統化 sanitizer / summary / attachment / canonical link 行為
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w4a-longform-article-systematization
latest_commit: updated-in-this-commit
last_updated: 2026-05-02T11:45:00-04:00
tmux_session: none
host_affinity: none
outputs_scope: gateway-core
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - gateway-core/src/lib/static-outbox-bridge.mjs
  - gateway-core/src/lib/activitypub.mjs
  - research/matters-fediverse-compat/00-research/adr/ADR-006-longform-object-mapping.md
  - research/matters-fediverse-compat/01-specs/static-outbox-adapter-contract.md
  - research/matters-fediverse-compat/02-runtime-slices/content-model-runtime-slice.md
  - research/matters-fediverse-compat/05-roadmap/decisions/02-html-sanitizer-rules.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm test
next_step: 若要驗證 Misskey timeline 實際顯示，需要 action-time 確認後對外送出一則清楚標記的 staging public Create；GoToSocial 依目前決策暫跳過。
blockers: Misskey 已完成 discover/follow，但 gyutte.site 沒有回填既有 outbox Article；真正的 display probe 會產生外部可見測試內容，需真人確認。
---

# Task Handoff

## Context

G1 工作項目 W4a，是這一輪最核心的內容工程。決策已定：對外用 `Article` 型別，不降級 `Note`。此 task 把決策落到程式：
- 完整欄位對映（`content` HTML / `summary` excerpt / `attachment` 圖片 / `url` canonical / `name` 標題）
- HTML sanitizer 規則集（哪些 tag 進、哪些被剝）
- IPFS hash 圖片如何展示在不支援 IPFS gateway 的實作
- `summary` 截斷策略與多語處理

## Acceptance Criteria

- ADR-006 從草案升為定版（補 sanitizer 規則 + summary 策略）
- `static-outbox-bridge.mjs` 與 `activitypub.mjs` 對 Article 的處理走同一條 normalize path
- 至少 8 組 Article-specific 單元測試（公開、付費 preview、含 IPFS 圖、含外部圖、長 summary、空 summary、含程式碼塊、跨語言）
- 與 W3 的三方互通驗證對齊（Mastodon / Misskey / GoToSocial 各自顯示差異記錄）

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started
- 2026-05-01 completed by codex-local in `e1045f5`; added shared Article normalization for static bridge and outbound Create/Update, plus Article-specific tests and ADR-006 rules
- 2026-05-02 W3 Misskey public run 回饋到 W4a：gyutte.site 已 resolve/follow `alice@staging-gateway.matters.town`，但 `users/notes` 沒有回填既有 outbox Article；顯示差異紀錄見 `research/matters-fediverse-compat/03-ops/article-display-compatibility-20260502.md`
- 2026-05-02 使用者決定 Misskey token 先保留，GoToSocial 暫不補跑
- 2026-05-02 新增 guarded Misskey Article display probe；預設 dry-run，公開送出需 `--send --confirm-public-create`
- 2026-05-02 經真人確認後送出 public staging Article；gateway delivery 回 `delivered`，Misskey `users/notes` 出現 matched note，text-only Article display API path 通過
- 2026-05-02 追加 `--fixture media`：public staging Article 含外部 PNG 與 IPFS-normalized JPEG，Misskey `users/notes` matched note 含 2 個 files 與 thumbnails

## Validation

- 2026-05-01 `node --test --test-name-pattern "article normalization|outbox bridge|outbox Update normalizes|outbox Create normalizes" test/gateway-core.test.mjs`：9 pass / 0 fail
- 2026-05-01 `node --test`：95 pass / 0 fail
- 2026-05-01 `git diff --check`：pass
- 2026-05-02 Misskey API display probe：`users/show` 200、`users/notes` 200 with 0 notes；gateway outbox 200 with 2 Article objects
- 2026-05-02 `runtime/tools/node-local --test test/misskey-article-display-probe.test.mjs`：6 pass / 0 fail
- 2026-05-02 guarded display dry-run：gateway followers 1、Misskey resolve fallback pass、`users/notes` empty、prepared public staging Article payload generated but not sent
- 2026-05-02 guarded display send：`outbox/create` 202、1 recipient、delivery `delivered`、Misskey `users/notes` matched `https://staging-gateway.matters.town/articles/w4a-misskey-display-probe-20260502`
- 2026-05-02 media display send：`outbox/create` 202、1 recipient、delivery `delivered`、Misskey `users/notes` matched `https://staging-gateway.matters.town/articles/w4a-misskey-media-probe-20260502`；matched note 含 `image/png` 與 `image/jpeg` 兩個 files
