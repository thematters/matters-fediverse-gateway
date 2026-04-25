# ADR-001 Federation Architecture

## Context

現有 `ipns-site-generator` 已有靜態 ActivityPub surface，但不足以支撐完整互通。

## Decision

採用 `static publisher + federation gateway + instance control plane` 架構。

## Consequences

- 保留現有內容輸出投資
- 把 inbox、signatures、followers、delivery 與 moderation surface 集中到動態層
- 後續實作與驗收要同時關注靜態 representation 與動態互通
