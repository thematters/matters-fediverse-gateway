# Matters Instance Interoperability Flow

```mermaid
flowchart TD
  A["Stage 01<br/>Instance Platform<br/>完成"] --> B["Stage 02<br/>Identity And Discovery<br/>完成"]
  B --> C["Stage 03<br/>Gateway Core<br/>基線完成"]
  C --> D["Stage 04<br/>Social Interop<br/>進行中"]
  D --> E["Stage 05<br/>Moderation And Ops<br/>規格完成"]
  E --> F["Stage 06<br/>Multi-Instance Control Plane<br/>規格完成"]
  F --> G["Stage 07<br/>Launch Readiness<br/>待執行"]

  C --> C1["gateway-core runtime"]
  C1 --> C2["WebFinger actor followers NodeInfo"]
  C1 --> C3["Follow Accept Reject signatures"]
  C1 --> C4["Remote actor discovery key refresh"]
  C1 --> C5["Static outbox bridge"]
  C1 --> C6["Local sandbox 與 Mastodon 驗證"]
  C1 --> C7["SQLite persistence baseline"]

  D --> D1["Inbound Create Reply<br/>完成"]
  D --> D2["Inbound Like Announce<br/>完成"]
  D --> D3["Undo Update Delete<br/>完成"]
  D --> D4["Reply reaction fan-out mention mapping<br/>待完成"]

  E --> E1["Domain block abuse queue audit log<br/>完成最小切片"]
  E --> E2["Account suspend legal takedown dashboard<br/>完成最小切片"]
  E --> E3["Rate limit<br/>完成最小切片"]
  E --> E4["Evidence retention richer actor policy<br/>待完成"]

  F --> F1["Instance registry"]
  F --> F2["Per-instance config namespace isolation"]

  G --> G1["Production deployment topology"]
  G --> G2["Operational readiness"]
  G --> G3["Launch checklist and rollback drill"]
```

## Reading Guide

- `Stage 01` 到 `Stage 02` 已完成規格基線
- `Stage 03` 已完成第一版工程基線，`gateway-core runtime`、`Follow inbox`、`signature verification`、`remote actor discovery`、`static outbox bridge`、`SQLite persistence baseline`、`Mastodon sandbox` 驗證已打通
- `Local sandbox verification` 已完成，`Real Mastodon sandbox verification` 也已完成第一輪黑箱驗證
- `Stage 04` 已完成第一批最小控制面，public `Create` / `Reply`、`Like` / `Announce`、`Undo`、outbound `Update` / `Delete` 都已進入工程切片
- `Stage 05` 已有三個 runtime 切片，`domain block`、`abuse queue`、`audit log`、`account suspend`、`legal takedown`、`admin dashboard`、`rate limit` 已打通
- 離正式部署最近的主線是 SQLite persistence 的營運能力、`Stage 05` 剩餘的 evidence retention / richer actor policy，以及 `Stage 04` 的 mention / thread / fan-out
