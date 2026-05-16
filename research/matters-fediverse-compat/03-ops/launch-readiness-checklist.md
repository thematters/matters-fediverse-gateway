# Launch Readiness Checklist

## Stage01 Platform Baseline

- canonical domain 已固定
- NodeInfo / software identity owner 已固定
- lifecycle mode 可表達 `disabled`、`read_only`、`federating`、`maintenance`
- policy bundle 可表達 public-only boundary、domain block、rate limit、audit log
- instance config schema 可表達第二個 instance 而不需要改 schema

## Discovery

- WebFinger 可解析 `acct:<handle>@<instance-domain>`
- actor、profile、followers、sharedInbox、NodeInfo URL 一致

## Federation Core

- gateway 可完成 follow、accept、公開內容 delivery；2026-05-15 staging
  `Update` 已送達 g0v.social 與 gyutte.site，queue 回到 0 pending / 0
  dead letter
- 2026-05-16 canonical `acct:mashbeanmatters@matters.town` Mastodon follow
  proof passed through the AWS gateway-core origin: g0v.social Follow reached
  the inbox, signature verification passed, SQLite recorded one accepted
  follower, and the signed Accept delivery returned HTTP 202
- HTTP Signatures 驗章與簽發可觀測
- retry 與 dead letter 可運作
- launch runbook 已定義 pre-flight、cutover、post-cutover smoke、go/no-go 與 evidence archive

## Social Loop

- 外部 reply、like、announce 可進入 Matters 事件流
- Matters 的 update 已在 staging outbound delivery 驗證；bounded staging
  delete proof 也已完成，g0v.social 對刪除後 status 回 `404`

## Moderation

- domain block、account suspend、abuse queue、takedown queue 都可操作
- non-public content boundary 有自動化或黑箱驗收
- incident playbook 已覆蓋 signature failure spike、queue backlog、SQLite restore、remote implementation outage 與 legal takedown escalation

## Multi-Instance

- registry 能表達第二個 instance
- shared service 與 per-instance policy 已分離
- actor namespace、key scope、queue partition、audit partition 不互相污染
- 新增第二個 instance 不需要改 code path 或 schema

## Handoff

- staging E2E、G2-B pilot checklist、demo page 與 implementation progress 需
  持續同步最新 evidence
- task note 與 active run 狀態需保持一致
- 下一輪工程 task 需列出 verify command
- rollback plan 已定義 routing、runtime、data restore 與 key rollback path
- W8 tabletop record template 已建立；正式 2+ participant tabletop 尚未執行，完成紀錄應放內部文件

## Current Pre-Production Gaps

- Threads actor discovery remains unresolved in the web UI even after canonical
  `acct:mashbeanmatters@matters.town` WebFinger and Meta crawler probes return
  200. Treat this as compatibility/indexing work, not as proof that the gateway
  ActivityPub core failed.
- Canonical Mastodon follow proof for `mashbeanmatters@matters.town` has passed
  on g0v.social. Misskey canonical follow is still open: gyutte.site resolves
  the actor and can enter a processing state, but no gyutte.site Follow activity
  reached gateway-core traces during the first canonical attempt.
- `GATEWAY_CORE_ORIGIN` is active for the narrow canonical pilot path and
  `check:follow-readiness` returns `ok: true`; live mode is
  `gateway-core-proxy`, not `edge-demo`.
- The origin exposes gateway-core `/healthz`; Worker healthz reports
  `component=gateway-core`, `storeDriver=sqlite`, `inboxMode=persistent`, and
  `followReadiness=ready`. The AWS origin runbook is
  `aws-gateway-core-origin-runbook.md`, and the CloudShell bootstrap script is
  `gateway-core/deploy/aws-gateway-core-origin-cloudshell.sh`.
- Canonical actor GET and inbox POST now come from the same key owner for the
  configured pilot actor. The Worker proxies configured pilot actor reads and
  inbox writes to `gateway-core`; the origin config sets
  `instance.activityPathPrefix` to `/ap`.
- Production gateway hosting, private S3 bundle storage, production secrets
  ownership, legal takedown owner, privacy notice, key exposure/rotation owner,
  rollback rehearsal, and launch communication remain explicit human rollout
  gates.
- Production outbound `Create` / `Update` / `Delete` remains disabled until
  launch approval is recorded.
