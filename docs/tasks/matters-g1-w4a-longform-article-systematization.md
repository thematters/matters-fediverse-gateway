---
task_slug: matters-g1-w4a-longform-article-systematization
status: done
goal: 把 ActivityPub Article 型別作為 Matters 對外聯邦長文的主型別，並系統化 sanitizer / summary / attachment / canonical link 行為
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w4a-longform-article-systematization
latest_commit: e1045f5
last_updated: 2026-05-01T17:55:00-04:00
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
next_step: 進入 W3 三方互通驗證時，記錄 Mastodon / Misskey / GoToSocial 對 Article summary、attachment、canonical link 的顯示差異
blockers: none
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

## Validation

- 2026-05-01 `node --test --test-name-pattern "article normalization|outbox bridge|outbox Update normalizes|outbox Create normalizes" test/gateway-core.test.mjs`：9 pass / 0 fail
- 2026-05-01 `node --test`：95 pass / 0 fail
- 2026-05-01 `git diff --check`：pass
