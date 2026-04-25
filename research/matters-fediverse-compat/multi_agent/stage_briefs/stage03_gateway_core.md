# Stage 03 Gateway Core

## Objective

定義 federation gateway 的最小可行核心，先支援公開內容的 follow flow 與基礎 delivery。

## Inputs

- `outputs/federation-gateway-spec.md`
- `processed/protocol-gap/matrix.md`
- `processed/interoperability-test/plan.md`

## Outputs

- gateway review gate
- gateway implementation slice
- updated interoperability acceptance plan

## Completion Gate

- inbox、sharedInbox、signatures、followers state、retry、dead letter 都有 owner
- reviewer 與 ops reviewer 都能逐項驗收
