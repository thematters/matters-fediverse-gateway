# Moderation And Ops Spec

## Goal

定義 Matters instance 對外互通時必要的 moderation 與 operations 控制面，讓 gateway 開放後仍有基本防線與可觀測性。

## Required Controls

- domain block 與 allow policy
- account suspend 與 actor-level deny action
- rate limit 與 abuse throttling
- delivery retry、dead letter、manual replay
- audit log、incident trace、legal takedown flow
- delete propagation 與 evidence retention 邊界

## Control Surfaces

- instance policy
  blocklist、allowlist、federation enable switch、public-only boundary
- actor policy
  suspend、disable follow acceptance、deny outbound delivery
- queue policy
  retry budget、dead letter threshold、manual replay permission
- audit surface
  request trace、decision reason、operator action、policy snapshot
- legal surface
  takedown intake、case id、action scope、retention timer

## Operational Rules

- domain block 需同時影響 inbound accept、outbound delivery 與 manual replay
- account suspend 需能阻止新入站 follow 與 outbound activity 發送
- rate limit 至少分成 instance-level 與 actor-level 兩層
- retry budget 用盡後必須進 dead letter，不可無限重送
- dead letter 必須能記錄失敗類型、目標、最後錯誤與是否已人工處置
- legal takedown 與 user self-delete 必須有不同的 action reason 與 audit trail
- non-public content boundary 必須在 gateway 前就能被判斷，不能等投遞失敗才擋

## Blocking Launch Gates

- blocklist、rate limit、audit log 三條基線已可操作
- dead letter 與 manual replay 有最小 runbook
- non-public content boundary 有明確測試案例
- delete propagation 與 takedown action 有可追溯紀錄

## Ownership

- policy source
  control plane
- enforcement
  gateway
- incident 與 legal case record
  operations plane
- content visibility boundary
  content system 與 gateway 共同檢查，gateway 為最後防線

## Decision Rules

- moderation policy 必須能區分 instance 級與 actor 級作用範圍
- retry 與 dead letter 必須可被 ops reviewer 追蹤
- legal takedown 與 user delete 不可共用同一條不透明流程
- 對外互通開啟前，至少要有 blocklist、rate limit、audit log 三條基線

## Acceptance

- 有一份 operations review gate
- 被 block 的 domain 無法繼續觸發入站互動
- 失敗投遞有 retry 與 dead letter path
- 所有高風險操作都有最小審計紀錄
- stage06 不需要再重談 policy source 與 enforcement boundary
