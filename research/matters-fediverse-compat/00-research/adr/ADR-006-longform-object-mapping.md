# ADR-006 Longform Object Mapping

## Context

Matters 內容以長文為主，`Note`、`Article` 或混合策略會直接影響 Mastodon 顯示與互通品質。

## Decision

公開長文對外 canonical object type 固定使用 `Article`，並以黑箱相容性驗證確認顯示與 thread 行為。

## Consequences

- writer 與 architect 必須提供 object mapping 決策表
- implementer 不得再把長文預設輸出成 `Note`
- reviewer 必須以真實 Mastodon 行為驗證 `Article` 的顯示與 thread 表現
