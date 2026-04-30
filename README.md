# Matters Fediverse Gateway

把 Matters 的長文出版層接到 Fediverse 的開源 gateway。讓 Mastodon、Misskey、GoToSocial 上的使用者能追蹤 Matters 作者、看到完整長文、留言互動，同時保護付費 / 加密 / 私訊內容不外流。

> **Status**: G1 開發中（單實例 reference release，預計 2026-07 完工）
> **Demo / Docs**: <https://mashbean.github.io/matters-fediverse-gateway/>
> **Public demo actor**: `acct:alice@mashbean.github.io`

---

## Why

Fediverse 的弱點是長文出版。短訊息與時間軸已成熟，但獨立媒體、社群出版者、多語寫作集體仍然缺一條「可自架、有營運控制、能參與聯邦」的技術路線。

Matters 是有十年歷史、26 萬註冊使用者的長文平台，已在內部完成靜態 ActivityPub 輸出與 federation gateway 原型。本專案把這套工作打包成可重用的開源 gateway，讓 Matters 自身導入之外，其他長文出版團隊也能拿去自架。

## What's in here

| 路徑 | 內容 |
|---|---|
| [`gateway-core/`](gateway-core/) | Node.js 實作：WebFinger、ActivityPub inbox、HTTP Signatures、followers state、moderation、observability |
| [`research/matters-fediverse-compat/`](research/matters-fediverse-compat/) | 完整研究與規格（feasibility、ADR×6、specs、22 份 runtime slice、ops runbook、roadmap） |
| [`docs/tasks/`](docs/tasks/) | G1 七項工作的 handoff task 文件 |

## 已完成

- Canonical discoverability：WebFinger / NodeInfo / actor / followers / following
- Follow loop：signed Follow → Accept/Reject、HTTP signature 驗章與簽發
- Social loop：`Create / Reply / Like / Announce / Undo` 入站持久化、`Create / Like / Announce / Update / Delete` 出站 fan-out
- Thread reconstruction、`acct:` 遠端 mention 解析
- Moderation 基線：domain block、actor suspend、legal takedown、rate limit、evidence retention、manual replay
- Persistence：SQLite + backup / restore / reconcile
- Observability：metrics / alerts / logs webhook 外送 + Slack incoming
- 與 mastodon.social 完成第一輪黑箱互通驗證
- 85 組自動化測試通過
- 公開靜態 ActivityPub prototype endpoints 已上線，可檢查 WebFinger、actor、outbox、Article 與 NodeInfo

公開 demo endpoints：

- WebFinger: <https://mashbean.github.io/.well-known/webfinger?resource=acct:alice@mashbean.github.io>
- Actor: <https://mashbean.github.io/users/alice.json>
- Outbox: <https://mashbean.github.io/users/alice/outbox>
- Article: <https://mashbean.github.io/articles/matters-open-social-demo>
- NodeInfo: <https://mashbean.github.io/nodeinfo/2.1>

## G1 路線（2026-05 ~ 2026-07）

七項工作：
1. [W1 真環境值班演習](docs/tasks/matters-g1-w1-staging-observability-drill.md)
2. [W3 Misskey + GoToSocial 互通](docs/tasks/matters-g1-w3-misskey-gotosocial-interop.md)
3. [W4a 長文 Article 系統化](docs/tasks/matters-g1-w4a-longform-article-systematization.md)（核心）
4. [W5 付費 / 私密邊界程式化](docs/tasks/matters-g1-w5-paid-private-boundary-enforcement.md)
5. [W6 金鑰輪替流程](docs/tasks/matters-g1-w6-key-rotation-flow.md)
6. [W2 一致性掃描](docs/tasks/matters-g1-w2-consistency-scan.md)
7. [W8 應變手冊與桌面演練](docs/tasks/matters-g1-w8-incident-runbooks-tabletop.md)

完整藍圖：[development-plan](research/matters-fediverse-compat/05-roadmap/development-plan.md)
五個產品決策：[decisions](research/matters-fediverse-compat/05-roadmap/decisions/)

## Quick Start

```bash
cd gateway-core
npm install
npm test
npm start
```

預設讀 `config/dev.instance.json`，狀態寫到 `runtime/dev-state.sqlite`。
詳見 [gateway-core/README.md](gateway-core/README.md)。

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Matters 主站       │         │ ipns-site-generator │
│   (matters.town)     │ ──────> │  靜態 ActivityPub    │
└─────────────────────┘         │  WebFinger / outbox  │
                                └──────────┬──────────┘
                                            │ static bundle
                                            ▼
                                ┌─────────────────────┐
              入站互動           │   gateway-core      │     出站 Article
       ◀─────────────────────── │   (this repo)        │ ─────────────────▶
       Mastodon / Misskey       │                      │     Fediverse
       GoToSocial / etc.        │  inbox / signatures  │
                                │  followers state     │
                                │  moderation / ops    │
                                └──────────────────────┘
```

## License

[AGPL-3.0](LICENSE) — 與 Mastodon、Misskey、GoToSocial 等聯邦伺服器一致。

## Acknowledgements

原始研發：Github [@thematters](https://github.com/thematters)。靜態發佈層基於 [`thematters/ipns-site-generator`](https://github.com/thematters/ipns-site-generator)。
