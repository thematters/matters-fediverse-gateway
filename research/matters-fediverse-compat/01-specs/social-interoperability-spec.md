# Social Interoperability Spec

## Goal

定義 Matters 與外部 fediverse instance 之間的完整社交互通流程，讓 social loop 有清楚的入站、出站與內部事件映射。

## Scope

- 入站  
  Follow、Accept、Reject、Create、Reply、Mention、Like、Announce、Undo、Update、Delete
- 出站  
  Matters 發文、更新、刪除、互動回覆時的相對應 federation 行為
- 內部映射  
  article、comment、reaction、repost、delete action 與外部 event 的對應

## Mapping Decisions

- follow graph 由 gateway state 擁有
- Matters 公開長文對外 canonical object type 固定為 `Article`
- reply thread、reaction、boost relation 都要保留遠端 object reference
- Update、Delete、Undo 需要可回溯到原始 Matters object 與 outbound delivery record

## Boundary

- 只處理 public 內容
- paid、private、encrypted 內容不得進入 outbox，也不得被外部互動觸發 reveal
- 非公開內容不進 federation pipeline，未另行通過 ADR 前不做 preview metadata 例外

## Acceptance

- reviewer 可根據這份 spec 建立 Mastodon 黑箱 social loop 測試
- implementer 可依事件表實作最小雙向映射
- editor 可把 object mapping 與 boundary 收斂成 launch gate
