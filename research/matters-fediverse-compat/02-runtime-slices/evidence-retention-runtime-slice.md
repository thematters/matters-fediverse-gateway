# Evidence Retention Runtime Slice

## Goal

把 `Stage 05` 的 evidence retention 從待辦推進到最小可執行 runtime，先讓 moderation 與 delivery failure 有獨立證據留存面，不只停在 abuse queue、audit log、dead letter。

## What Landed

- file store 與 SQLite store 都新增 `evidenceRecords` persistence
- blocked inbound domain 會留下 evidence snapshot
- inbound / outbound rate limit 命中會留下 evidence snapshot
- legal takedown 建案與 delete propagation 會留下 case evidence
- outbound delivery dead letter 會留下 delivery evidence
- 新增 admin endpoint  
  `GET /admin/evidence`
- dashboard summary 現在會帶 `evidenceRecords`
- evidence record 會附帶 `retainedAt` 與 `retentionUntil`

## Runtime Shape

- `domain-block`
  保留被擋入站活動、domain block 原因與 abuse case 關聯
- `rate-limit`
  保留 policy、counter evaluation、surface 與 abuse case 關聯
- `legal-takedown`
  保留 case metadata 與 delete propagation 結果
- `delivery-dead-letter`
  保留 queue item、error、target actor、activity type 與 dead letter disposition

## Verified

- `cd gateway-core && npm test`
  已覆蓋 SQLite evidence persistence、blocked inbound evidence、legal takedown evidence、dead letter evidence
- `cd gateway-core && npm run check:local-sandbox`
  evidence retention slice 加入後，discoverability 與 signed `Follow` -> `Accept` 仍正常

## Next Step

補 manual replay control、evidence review workflow、retention expiry / purge policy，並把 observability 與 backup / restore 串進 evidence store。
