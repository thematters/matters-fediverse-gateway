# Production Rollout Human Approval Brief

Date: 2026-05-05
Last updated: 2026-05-17
Status: production preparation approved for pilot; full rollout still pending

This brief is for product settings, legal/privacy, and production rollout decisions that should not be silently automated. Engineering can keep building and staging, but these items need explicit approval before public production enablement.

## 2026-05-13 Accepted Decisions

The product owner approved these rollout decisions in session:

- First phase keeps author federation default-off and requires explicit author opt-in.
- The allowlist is open rather than limited to a named pilot-author list. A separate pilot author list is not required.
- Article-level setting defaults to `inherit`.
- Article-level `disabled` always wins.
- Article-level `enabled` cannot bypass author opt-in.
- Before production rollout, `matters.icu` should run `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=record_only` to record publish/edit eligibility audit rows only.
- `record_only` must not call Lambda, write S3, publish IPNS, or deliver ActivityPub.
- Production generated bundles should be retained in a private S3 bucket/prefix for audit and retry.
- The repo boundary is accepted: `matters-server` records product decisions and trigger audit, `lambda-handlers` asynchronously generates bundles, and `gateway-core` owns the federation runtime.
- Canonical `acct:user@matters.town` cutover waits until staging E2E, rollback, and takedown checks pass.
- Production public `Create`, `Update`, and `Delete` delivery is approved once production gateway rollout is otherwise enabled; no separate delivery go/no-go is required.
- Launch window is intentionally deferred until the remaining implementation and staging checks are complete.

## 2026-05-17 Accepted Decisions

The product owner approved these additional rollout decisions in session:

- Threads is not a launch blocker.
- Engineering may enter production rollout preparation, but must not enable full outbound delivery.
- The next production-facing step is record-only plus narrow pilot-author observation.
- Pilot author: `mashbean`.
- Production actor keys should use a new versioned key id, not the old Worker demo `#main-key`.

Current pilot evidence:

- Canonical pilot Article delivery to Mastodon / g0v.social and Misskey / gyutte.site passed.
- Misskey reply, reaction/like, and renote/boost returned to gateway-core and were persisted.
- Mastodon visibility passed; Mastodon interaction return still needs a write-scoped test token or browser-based manual action because the current g0v.social token is read-only.
- Evidence report: [`canonical-pilot-article-interop-20260517.md`](../../03-ops/canonical-pilot-article-interop-20260517.md).

## User-Facing Copy Draft

Use this as the first copy draft for settings UI and release notes.

### Account Setting

**Fediverse 發布**

開啟後，你的公開文章可以被 Fediverse 上的其他服務讀取、追蹤與互動。這可能包含 Mastodon、Misskey 或其他相容服務。

只有公開文章會被送出。付費、私人、加密、圈子限定、草稿或已封存內容不會被送出。

請注意：Fediverse 是分散式網路。文章送出後，外部站台可能會保存、快取、轉載或顯示你的公開內容與文章資訊；Matters 無法保證所有外部副本都能同步刪除。

### Article Setting

**Fediverse 發布設定**

- 跟隨作者設定：如果你的帳號已開啟 Fediverse 發布，這篇公開文章可以被送出。
- 不送出這篇文章：即使帳號已開啟，這篇文章也不會送出。

這個設定不會讓非公開文章被送出。只有公開文章符合 Fediverse 發布條件。

### Short Release Note

Matters 將開始測試 Fediverse 發布功能。作者可自行選擇是否開啟，開啟後公開文章可被 Fediverse 上的其他服務讀取與互動。付費、私人、加密、圈子限定、草稿與已封存內容不會被送出。

## Owner Recommendations

| Area | Recommended owner | Reason |
| --- | --- | --- |
| Legal takedown | Matters legal / policy owner, with engineering on evidence preservation | Takedown decisions require policy judgment; engineering should preserve logs, affected URLs, actor IDs, object IDs, and delivery attempts. |
| Privacy notice | Product owner drafts, legal/policy approves, engineering verifies UI placement | The notice needs user-facing clarity and legal correctness; engineering should not own wording alone. |
| Key exposure / rotation | CTO or security owner as decision owner; gateway operator executes runbook | Key exposure affects public identity trust. The owner should decide severity, rotation timing, actor update/delete messaging, and whether external notice is needed. |
| S3 bucket / retention | Infrastructure owner with product/legal retention input | Bucket policy, lifecycle, access logs, and retention are operational controls with privacy implications. |
| Rollback | Launch commander plus gateway operator | Rollback may include disabling opt-in, pausing export jobs, preserving evidence, and changing public routing. |

## Recommended Confirmation

Approve this staging-to-production policy:

- Federation is default-off at launch.
- Author-level opt-in is required before any Matters author is federated.
- Per-article setting defaults to inherit the author setting.
- Per-article disable always wins.
- Public-only boundary is absolute: paid, private, encrypted, circle-only, archived, draft, or message-like content is never exported.
- First beta does not require a named pilot-author list; access can be broad as long as author opt-in remains explicit and default-off.
- Canonical `acct:user@matters.town` identity is not enabled until staging proves discovery, delivery, rollback, and takedown flows.
- Generated production bundle output uses private S3 for audit and retry. Bucket policy must be private-by-default unless explicitly approved for public serving.
- Legal takedown and key exposure policies remain launch blockers for production beta.

## Product Settings

| Decision | Recommended choice | Reason |
|---|---|---|
| Author default | Default-off, explicit opt-in | Reduces surprise and avoids federating authors who did not consent. |
| Article default | `inherit` | Keeps UI simple and lets author opt-in control the normal case. |
| Article override | `disabled` blocks export, `enabled` only works when author is opted in | Prevents article-level override from bypassing author consent. |
| Public filter | Active public articles only | Matches current Matters usage while keeping old private/paid paths outside federation. |
| Pilot scope | No named pilot author list required; broad access is acceptable while default-off and explicit opt-in remain in force | Removes launch-list overhead without federating anyone by default. |
| First production-facing pilot | Start with `mashbean` only, in record-only / observation mode before broader rollout | Keeps the first real identity path narrow while preserving default-off behavior. |
| User-facing copy | Use the draft copy in this brief as the next product-copy baseline | Explains external replication without making the setting scary or vague. |

## Legal / Privacy

| Decision | Recommended choice | Production blocker? |
|---|---|---|
| Takedown handling | Legal/policy owner decides; engineering preserves evidence and executes approved removal/update steps | Yes |
| External replication notice | Add copy that federated public content may be cached or copied by external servers | Yes |
| Key exposure response | CTO/security owner decides severity; gateway operator rotates key and publishes actor update/delete if approved | Yes |
| Paid/private policy | Do not federate paid/private/encrypted/circle content | Yes |
| Evidence retention | Keep internal staging and incident records, but do not expose credentials or private payloads | Yes |

## Production Rollout

| Decision | Recommended choice | Reason |
|---|---|---|
| Environment path | `develop` -> `matters.icu` -> production PR | Matches CTO guidance and keeps staging as a checkpoint. |
| Async generation | Keep bundle generation in `lambda-handlers`, not `matters-server` | Avoids main backend compute and retry load. |
| Storage | Use private S3 for production generated bundles; staging may continue direct return or private staging output | S3 gives production audit/retry while keeping bundle output private by default. |
| Gateway state | SQLite remains runtime source for the current gateway slice | Already chosen for staging; backup/restore remains required. |
| Canonical identity | Delay `acct:user@matters.town` until staging E2E and rollback pass | Prevents premature public identity commitment. |
| Production key id | Use a fresh versioned gateway-core key id for production actors | Avoids remote instance public-key cache conflicts from earlier demo keys. |
| Public delivery | Public `Create`, `Update`, and `Delete` delivery is approved once production gateway rollout is otherwise enabled | No separate delivery decision is required after production gates pass. |
| Rollback | Disable author opt-in, stop async export, preserve gateway evidence, then remove public routing if needed | Keeps rollback clear and reversible. |

## Approval Checklist

Before production beta, confirm:

- [x] Pilot author list not required.
- [ ] Author opt-in copy final approval.
- [x] Per-article UI default behavior.
- [ ] Legal takedown owner and response path.
- [ ] External federation persistence notice.
- [x] Production private S3 decision.
- [ ] Production Lambda secrets owner.
- [x] Gateway canonical domain and versioned key-id strategy.
- [ ] Actor key owner.
- [ ] Rollback owner and launch window.

## Not Yet Approved

Do not automatically perform these actions from staging work:

- Enable federation by default for all Matters users.
- Publish canonical `acct:user@matters.town` for real users.
- Expose production credentials or actor private keys.
- Push production DNS/Cloudflare routing changes.
- Federate paid/private/encrypted/circle-only content.
- Treat Misskey staging success as legal/privacy approval.
