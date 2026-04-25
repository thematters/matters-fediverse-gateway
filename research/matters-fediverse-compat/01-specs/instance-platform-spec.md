# Instance Platform Spec

## Goal

定義 Matters 官方 instance 的平台邊界、對外身分、policy surface 與 launch baseline，讓後續 identity、gateway、moderation 與 multi-instance 規格有共同基底。

## Platform Model

- 第一個落地產品是 Matters 官方營運的單一 instance
- 長期必須保留多 instance 擴充能力，所以 config schema 不能把 domain、policy、key scope、queue scope 寫死
- `ipns-site-generator` 只負責內容輸出與可快取 representation
- federation gateway 負責 WebFinger、actor、inbox、outbox、signatures、followers state、delivery
- instance control plane 負責 instance metadata、policy bundle、enable switch、launch gate 與 lifecycle mode

## Decisions

- 對外 canonical domain 由官方 instance domain 承擔，不再使用 IPNS URL 當主站身分
- 每個 instance 都要有自己的 brand metadata、federation policy、moderation policy、software identity
- public content boundary 在 stage01 就固定成預設只允許 `public` 對外 federation
- platform 必須能表達 `disabled`、`read_only`、`federating`、`maintenance` 四種 mode
- NodeInfo 與 software identity 的 owner 是 instance control plane，不是 `ipns-site-generator`

## Responsibility Split

### `ipns-site-generator`

- 公開文章 representation
- canonical article URL
- 靜態快取輸出
- 非即時內容歸檔

### federation gateway

- `/.well-known/webfinger`
- actor、outbox、inbox、sharedInbox、followers、following
- inbound verify、outbound sign
- delivery queue、retry、dead letter
- follower graph 與 interaction state

### instance control plane

- instance registry
- canonical domain 與 handles domain
- software identity 與 NodeInfo metadata
- federation policy、moderation policy、launch gate
- lifecycle mode、maintenance message、enable switch

## Instance Config Schema Draft

```json
{
  "instance_id": "matters-official",
  "canonical_domain": "social.matters.town",
  "handles_domain": "social.matters.town",
  "display_name": "Matters",
  "description": "Matters official fediverse instance",
  "contacts": {
    "support_email": "support@example.com",
    "report_email": "trust-safety@example.com",
    "legal_email": "legal@example.com"
  },
  "software": {
    "name": "matters-instance",
    "version": "0.1.0",
    "repository": "https://github.com/thematters/ipns-site-generator"
  },
  "nodeinfo": {
    "open_registrations": false,
    "protocols": ["activitypub"],
    "services": {
      "inbound": [],
      "outbound": []
    },
    "metadata": {
      "content_boundary": "public-only",
      "instance_mode": "read_only"
    }
  },
  "federation": {
    "enabled": false,
    "public_content_only": true,
    "accept_inbound_follows": false,
    "shared_inbox_enabled": false,
    "allowlist_mode": false,
    "blocked_domains": []
  },
  "moderation": {
    "domain_block_enabled": true,
    "account_suspend_enabled": true,
    "rate_limit_enabled": true,
    "audit_log_retention_days": 365
  },
  "lifecycle": {
    "mode": "disabled",
    "launch_gate": "stage03_gateway_core",
    "maintenance_message": ""
  }
}
```

## Stage01 Launch Blockers To Fix

- canonical domain 與 handles domain 要先固定
- NodeInfo / software identity 欄位 owner 要先固定
- public-only federation boundary 要先固定
- lifecycle mode 要先固定，避免後面無法表達 disabled 或 read-only
- policy bundle 要能表達 domain block、rate limit、audit log 這些最低控制面

## Acceptance

- 有一份官方 instance config schema 草案
- NodeInfo 與 software identity 欄位有固定 owner
- policy surface 可被 reviewer 與 ops reviewer 逐項驗證
- 後續 stage 不需要再猜 canonical domain 或 instance 級設定從哪裡來
- config schema 可在不改 schema 的前提下表達第二個 instance
