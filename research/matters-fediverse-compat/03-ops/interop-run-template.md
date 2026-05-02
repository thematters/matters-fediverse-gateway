# Interop Run YYYYMMDD

## Summary

- Status: `pending`
- Implementation: `Misskey | GoToSocial | Mastodon`
- Instance:
- Operator account URL:
- Gateway public URL:
- Gateway actor:
- Gateway commit:
- Started at:
- Completed at:

## Human Approval Record

Record action-time confirmations before the run:

- Public instance account selected:
- Access token created or provided:
- Token scope reviewed:
- External follow action approved:
- Public test traffic approved:
- No posting / reply / like / boost actions unless separately approved:

## Command

Misskey:

```bash
cd gateway-core
MISSKEY_BASE_URL="https://gyutte.site" \
MISSKEY_ACCESS_TOKEN="<token>" \
MISSKEY_OPERATOR_PROFILE_URL="https://gyutte.site/@mashbean" \
GATEWAY_PUBLIC_BASE_URL="https://staging-gateway.matters.town" \
npm run check:misskey-sandbox
```

GoToSocial:

```bash
cd gateway-core
GOTOSOCIAL_BASE_URL="https://gts.example" \
GOTOSOCIAL_ACCESS_TOKEN="<token>" \
GOTOSOCIAL_OPERATOR_PROFILE_URL="https://gts.example/@mashbean" \
GATEWAY_PUBLIC_BASE_URL="https://staging-gateway.matters.town" \
npm run check:gotosocial-sandbox
```

## Result

- Probe result: `pending`
- WebFinger subject:
- Actor ID:
- Outbox ID:
- Outbox total items:
- Remote resolved account ID:
- Remote resolved account URL:
- Follow response:
- Relationship state:

## Display Checks

Use public URLs and screenshots only when approved. Do not include tokens.

- Remote profile appears:
- Article object appears:
- Article title/name display:
- Summary display:
- HTML/content rendering:
- Attachment rendering:
- Canonical link display:
- Reply / like / boost visibility:

## Compatibility Findings

| Area | Finding | Severity | Follow-up |
| --- | --- | --- | --- |
| resolve |  |  |  |
| follow |  |  |  |
| Article display |  |  |  |
| reply |  |  |  |
| like |  |  |  |
| boost |  |  |  |

## Evidence

Default to hashes and public URLs. Do not paste tokens, private account settings, or private payload bodies.

- Raw probe output file:
- Raw probe output SHA-256:
- Public profile URL:
- Public article URL:
- Screenshot path, if any:

## Next Steps

- [ ] TBD
