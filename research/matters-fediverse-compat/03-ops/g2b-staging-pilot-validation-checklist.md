# G2-B Staging Pilot Validation Checklist

Date: 2026-05-11
Status: prepared; waiting for staging admin / pilot permission

## Purpose

This checklist is the shortest path from the merged G2-B code to a real
`matters.icu` staging validation. It does not enable production federation.

## Current State

- `matters-server` PR #4773 is merged to `develop` and the develop deploy passed.
- `matters-web` PR #5883 is merged to `develop` and the develop deploy passed.
- `server.matters.icu` exposes the G2-B schema:
  - `User.federationSetting`
  - `Article.federationSetting`
  - `Article.federationEligibility`
  - `setViewerFederationSetting`
  - `setArticleFederationSetting`
  - `UserFeatureFlagType.fediverseBeta`
- `mashbean@matters.town` is the intended staging pilot/admin test account, but
  it is not yet confirmed as a staging admin and does not yet have
  `fediverseBeta`.
- No production setting, production data export, or canonical
  `acct:user@matters.town` rollout is enabled.

## Permission Setup Needed

Once staging admin access exists, perform only these staging changes:

1. Confirm `mashbean@matters.town` is the intended staging test account.
2. Confirm the account can authenticate on `https://matters.icu`.
3. Grant or confirm staging admin access if the existing admin mutation path is
   used.
4. Add the `fediverseBeta` user feature flag to the test account.
5. Do not add production flags or production credentials.

## Validation Steps After Permission Is Ready

1. Log in to `https://matters.icu` as `mashbean@matters.town`.
2. Open account settings and confirm the Fediverse row is visible.
3. Toggle account-level federation setting to enabled.
4. Open an owned public article edit settings page.
5. Confirm the article-level Fediverse control is visible.
6. Set the article control to `inherit`.
7. Query `server.matters.icu` and confirm:
   - viewer has `fediverseBeta`
   - viewer federation setting is `enabled`
   - public article eligibility is `eligible`
8. Re-run `federation-export-dev` strict-gate staging dry-run with a public
   article and a paywalled article.
9. Confirm the public article is exported and the paywalled article remains
   blocked as `article_not_public`.
10. Run gateway public probes:
    - WebFinger
    - actor
    - outbox
    - NodeInfo discovery
    - NodeInfo 2.1
11. Run SQLite consistency scan and require `totalDiffs=0`.
12. Run Misskey read-only probe first; send a public staging Article only if the
    test plan explicitly requires an externally visible delivery.

## Pass Criteria

- Pilot UI controls are visible only for the flagged pilot account.
- Account-level setting can be changed by the viewer.
- Article-level setting can be changed only by the article author.
- Public eligible article can pass the strict gate.
- Paywalled/private/non-public articles remain blocked.
- Gateway probes pass.
- SQLite consistency scan returns `0` diffs.
- No production export, production storage write, or production ActivityPub
  delivery occurs.

## Stop Conditions

Stop and record the blocker if:

- the account is not a staging admin and admin mutation is required;
- the account cannot receive `fediverseBeta`;
- the UI row is hidden after `fediverseBeta` is present;
- paywalled/private content becomes eligible;
- strict-gate dry-run attempts a production write;
- a test requires production credentials, production branch rollout, or legal /
  privacy approval.
