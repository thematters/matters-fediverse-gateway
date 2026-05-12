# Production Rollout Human Approval Brief

Date: 2026-05-05
Last updated: 2026-05-13
Status: pending human confirmation before production rollout

This brief is for product settings, legal/privacy, and production rollout decisions that should not be silently automated. Engineering can keep building and staging, but these items need explicit approval before public production enablement.

## 2026-05-13 人類決策點

正式 rollout 前，請逐項確認：

- 是否同意第一階段維持「作者預設關閉、pilot allowlist、作者明確 opt-in」。
- 是否同意文章預設為 `inherit`，且 `disabled` 永遠優先；`enabled` 不得繞過作者 opt-in。
- 是否同意 production 前先在 `matters.icu` 啟用 `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only`，只記錄 publish/edit eligibility audit，不打 Lambda、不寫 S3、不對外 delivery。
- 是否同意 production worker 後續採用「server 記錄決策，lambda-handlers 非同步產生 bundle，gateway-core 負責 federation runtime」的邊界。
- 是否選定 production generated bundle 的保留方式：建議用私有 S3 bucket/prefix 做 audit/retry；staging 可繼續 direct return。
- 是否確認 pilot 作者名單與 launch window。
- 是否確認 user-facing copy：Fediverse 發布會讓公開文章內容與 metadata 被外部站台讀取、快取或轉載。
- 是否確認 legal takedown owner、privacy notice、key exposure/rotation response path。
- 是否確認 canonical identity cutover 時機：`acct:user@matters.town` 只在 staging E2E、rollback、takedown 都通過後啟用。
- 是否確認 production 外部 delivery go/no-go：允許 gateway 對 Misskey/Mastodon 等遠端站台送出 public Create/Update/Delete 的時間點。

## Recommended Confirmation

Approve this staging-to-production policy:

- Federation is default-off at launch.
- Author-level opt-in is required before any Matters author is federated.
- Per-article setting defaults to inherit the author setting.
- Per-article disable always wins.
- Public-only boundary is absolute: paid, private, encrypted, circle-only, archived, draft, or message-like content is never exported.
- First beta uses allowlisted pilot authors only.
- Canonical `acct:user@matters.town` identity is not enabled until staging proves discovery, delivery, rollback, and takedown flows.
- Generated bundle output may use S3 for staging/production operations, but bucket policy must be private-by-default unless explicitly approved for public serving.
- Legal takedown and key exposure policies remain launch blockers for production beta.

## Product Settings

| Decision | Recommended choice | Reason |
|---|---|---|
| Author default | Default-off, explicit opt-in | Reduces surprise and avoids federating authors who did not consent. |
| Article default | `inherit` | Keeps UI simple and lets author opt-in control the normal case. |
| Article override | `disabled` blocks export, `enabled` only works when author is opted in | Prevents article-level override from bypassing author consent. |
| Public filter | Active public articles only | Matches current Matters usage while keeping old private/paid paths outside federation. |
| Pilot scope | Start with a small allowlist, including the current test author if approved | Keeps staging evidence concrete and rollback manageable. |
| User-facing copy | Explain that Fediverse publication makes public article metadata and content reachable by external servers | Avoids underexplaining federation persistence and replication. |

## Legal / Privacy

| Decision | Recommended choice | Production blocker? |
|---|---|---|
| Takedown handling | Define an internal legal takedown path before beta | Yes |
| External replication notice | Add copy that federated content may be cached or copied by external servers | Yes |
| Key exposure response | Treat as legal/security incident; rotate key and publish actor update/delete as appropriate | Yes |
| Paid/private policy | Do not federate paid/private/encrypted/circle content | Yes |
| Evidence retention | Keep internal staging and incident records, but do not expose credentials or private payloads | Yes |

## Production Rollout

| Decision | Recommended choice | Reason |
|---|---|---|
| Environment path | `develop` -> `matters.icu` -> production PR | Matches CTO guidance and keeps staging as a checkpoint. |
| Async generation | Keep bundle generation in `lambda-handlers`, not `matters-server` | Avoids main backend compute and retry load. |
| Storage | Use S3 if generated files need retention or gateway ingestion across deploys; otherwise direct return is acceptable for staging preflight | S3 is better for production audit/retry, direct return is faster for staging. |
| Gateway state | SQLite remains runtime source for the current gateway slice | Already chosen for staging; backup/restore remains required. |
| Canonical identity | Delay `acct:user@matters.town` until staging E2E and rollback pass | Prevents premature public identity commitment. |
| Rollback | Disable author opt-in, stop async export, preserve gateway evidence, then remove public routing if needed | Keeps rollback clear and reversible. |

## Approval Checklist

Before production beta, confirm:

- [ ] Pilot author list.
- [ ] Author opt-in copy.
- [ ] Per-article UI copy and default behavior.
- [ ] Legal takedown owner and response path.
- [ ] External federation persistence notice.
- [ ] Production S3 bucket or direct-return decision.
- [ ] Production Lambda secrets owner.
- [ ] Gateway canonical domain and actor key owner.
- [ ] Rollback owner and launch window.

## Not Yet Approved

Do not automatically perform these actions from staging work:

- Enable federation for all Matters users.
- Publish canonical `acct:user@matters.town` for real users.
- Expose production credentials or actor private keys.
- Push production DNS/Cloudflare routing changes.
- Federate paid/private/encrypted/circle-only content.
- Treat Misskey staging success as legal/privacy approval.
