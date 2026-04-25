# Manual Replay Runtime Slice

## Goal

把 `Stage 05` 的 manual replay control 從規格推進到最小可執行 runtime，讓 dead letter 不再只能堆著，ops 可以查詢並人工重送。

## What Landed

- file store 與 SQLite store 都補上 dead letter query / replay 方法
- 新增 admin endpoint  
  `GET /admin/dead-letters`  
  `POST /admin/dead-letters/replay`
- replay 會把 dead letter item 轉回 `pending`，並直接走既有 delivery processor
- replay 會留下 audit event、trace、manual replay evidence
- replay 仍會經過既有 policy enforcement  
  domain block 不會被繞過

## Runtime Shape

- `GET /admin/dead-letters`
  提供 dead letter 查詢，可依 `status`、`actorHandle`、`limit` 篩選
- `POST /admin/dead-letters/replay`
  單次只處理一個 `id`
  會寫入 replay metadata
  會立即呼叫 delivery processor 重新送出
- dead letter record 現在會保留 `replayHistory`

## Verified

- `cd gateway-core && npm test`
  已覆蓋 dead letter listing、successful replay、policy-safe replay
- `cd gateway-core && npm run check:local-sandbox`
  manual replay slice 加入後，discoverability 與 signed `Follow` -> `Accept` 仍正常

## Next Step

補 richer actor-level deny policy，並把 SQLite persistence 的 backup、migration、queue observability 串起來。
