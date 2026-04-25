# Stage Review

- Run ID: `20260320_170637`
- Stage ID: `stage02_identity_and_discovery`
- Reviewer scope: canonical actor、WebFinger、alias policy、followers owner、key owner

## Checks

- instance-domain actor URL 與 WebFinger subject 已一致
- alias 已被限制在 `alsoKnownAs` 或 profile links
- followers/following 與 key material owner 已固定到 gateway
- migration rule 已明定不得同時暴露兩個 primary actor

## Findings

- stage02 已把 discovery 風險壓到可實作程度
- stage03 仍需真正補上 inbox、followers state、signatures 與 collection endpoint
- stage02 的主要任務是鎖規則，不是完成 gateway implementation

## Outcome

- pass
- 下一棒是 stage03 的 architect、implementer、reviewer、ops_reviewer
