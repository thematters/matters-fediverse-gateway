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

## Local Preflight

Use this section for the local contract or fixture-based checks that do not require Cloudflare account access, public instance tokens, external follow actions, deployment, or push.

| Check | Command | Result | Evidence | Blocker | Next Step |
| --- | --- | --- | --- | --- | --- |
| Working tree snapshot | `git status --short` |  |  |  |  |
| Tool availability | `node --version && npm --version` |  |  |  |  |
| GoToSocial dry-run contract | `cd gateway-core && npm run check:gotosocial-contract` |  |  |  |  |
| GoToSocial no-listener test | `cd gateway-core && node --test --test-name-pattern="gotosocial sandbox interop script dry-run contract emits endpoint plan without secrets"` |  |  |  |  |
| Patch hygiene | `git diff --check` |  |  |  |  |

Local-only runs must record:

- Environment: OS, Node/npm availability, and sandbox limits such as blocked `127.0.0.1` listeners.
- Probe mode: `dry-run contract`, `fixture fake server`, or `public instance`.
- Secret handling: confirm that output contains no token values.
- Blocker reason: missing dependency, sandbox listener permission, missing public URL, missing token, or human approval required.
- Next step: one concrete local command or one human gate.

## Human Gates

These actions require action-time human approval and must not be performed as part of a local-only operator run:

- Create or provide GoToSocial, Misskey, Cloudflare, webhook, or actor-key secrets.
- Create Cloudflare Tunnel, DNS route, or Access policy.
- Run a public instance resolve/follow/relationship probe.
- Perform any public post, reply, like, boost, direct message, deployment, or push.

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
