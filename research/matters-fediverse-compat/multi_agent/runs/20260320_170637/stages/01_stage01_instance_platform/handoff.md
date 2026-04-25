# Stage Handoff

- Run ID: `20260320_170637`
- Stage ID: `stage01_instance_platform`
- Source roles: planner, writer, architect

## Summary

- 已固定官方 instance-first 平台模型
- 已固定 `ipns-site-generator`、gateway、control plane 的責任邊界
- 已補 instance config schema draft、lifecycle mode、policy bundle 與 stage01 launch blockers
- stage02 可直接承接 identity and discovery，不需要再猜 platform owner

## Confirmed

- canonical domain 不再由 IPNS URL 承擔
- NodeInfo / software identity 屬於 control plane
- 非公開內容預設不 federate
- 多 instance 能力必須透過 config schema 預留，不等待第三方架站功能才補

## Next Owner

- writer、architect、reviewer
- verify command
  `sed -n '1,220p' research/matters-fediverse-compat/outputs/instance-platform-spec.md`
  `sed -n '1,220p' research/matters-fediverse-compat/outputs/identity-discovery-spec.md`
