# Stage Handoff

- Run ID: `20260320_170637`
- Stage ID: `stage02_identity_and_discovery`
- Source roles: writer, architect, reviewer

## Summary

- 已固定 instance-first canonical actor 與 WebFinger subject
- 已把 legacy `matters.town`、`webfDomain`、IPNS URL 壓回 alias
- 已固定 followers 與 key ownership 由 gateway 承接
- stage03 可直接接著做 inbox、collections、signatures 與 queue

## Confirmed

- 只有單一可 follow 的 primary actor
- actor、profile、followers、following、NodeInfo 應落在同一 instance domain
- key material 不得由靜態輸出層假裝提供

## Next Owner

- architect、implementer、reviewer、ops_reviewer
- verify command
  `python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py current-stage`
