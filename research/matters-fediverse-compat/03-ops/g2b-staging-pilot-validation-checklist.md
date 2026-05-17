# G2-B Staging Pilot Validation Checklist

Date: 2026-05-15
Status: API validation, browser UI QA, strict-gate Lambda bundle, public gateway probes, staging outbound Update delivery, and canonical Mastodon follow proof passed for the pilot-owned public article path

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
- `mashbean@matters.town` is confirmed as a staging admin test account.
- The account has `fediverseBeta` and account-level federation is `enabled`.
- Public article `23520` (`ej8tf2513uky`, author `zeckagent3`) is eligible after
  staging author opt-in.
- Paywalled article `23522` (`zne4qktk3xk0`) remains blocked as
  `article_not_public`.
- Lambda strict-gate dry-run
  <https://github.com/thematters/lambda-handlers/actions/runs/25712528545>
  passed with 2 selected rows, 1 eligible public Article, and 1 skipped
  paywalled Article.
- Gateway bundle ingestion, WebFinger, actor, outbox, NodeInfo, and SQLite
  consistency checks passed against the G2-B strict-gate bundle.
- Pilot-owned public article `23525` (`ckl5le599uwc`) was created through the
  `matters.icu` browser UI and passed the strict federation gate in Lambda run
  <https://github.com/thematters/lambda-handlers/actions/runs/25713858021>.
- Public `staging-gateway.matters.town` now serves
  `mashbeanmatters@staging-gateway.matters.town`; WebFinger, actor, outbox, and
  NodeInfo probes passed.
- PR #29 added actor discovery hints for Mastodon-compatible discovery. The
  public staging actor now includes `discoverable`, `indexable`, and the
  Mastodon `toot` JSON-LD context.
- A staging `Update` for article `23525` was sent through
  `mashbeanmatters@staging-gateway.matters.town` and delivered to the accepted
  g0v.social and gyutte.site followers. Queue status after delivery was 0
  pending, 0 processing, and 0 dead letters.
- SQLite remains the runtime source of truth; the post-delivery consistency
  scan returned `totalDiffs=0`.
- No production setting, production data export, or canonical
  `acct:user@matters.town` rollout is enabled.
- The canonical pilot actor `acct:mashbeanmatters@matters.town` is routed
  through the AWS `gateway-core` origin for configured Worker federation paths.
  g0v.social Mastodon follow proof passed and created persistent SQLite follower
  state. gyutte.site Misskey canonical follow remains open because the Misskey
  UI entered a processing state without sending a Follow activity to the
  gateway-core inbox.

## Permission Setup Needed

Completed staging changes:

1. Confirmed `mashbean@matters.town` is the intended staging test account.
2. Confirmed the account can authenticate on `https://matters.icu`.
3. Confirmed staging admin access when the existing admin mutation path is
   used.
4. Added the `fediverseBeta` user feature flag to the test account.
5. Enabled account-level federation for the test account.
6. Did not add production flags or production credentials.

## Validation Steps After Permission Is Ready

1. Log in to `https://matters.icu` as `mashbean@matters.town`. Completed by API.
2. Open account settings and confirm the Fediverse row is visible. Completed in
   browser QA.
3. Toggle account-level federation setting to enabled. Completed by API.
4. Open an owned public article edit settings page. Completed for article
   `23525`.
5. Confirm the article-level Fediverse control is visible. Completed; the
   control defaults to `Follow author setting`.
6. Set the article control to `inherit`. Completed for staging article `23520`
   through the admin mutation path; the server stores `inherit` as the effective
   default when no article override row is needed.
7. Query `server.matters.icu` and confirm:
   - viewer has `fediverseBeta`
   - viewer federation setting is `enabled`
   - public article eligibility is `eligible`
   Completed.
8. Re-run `federation-export-dev` strict-gate staging dry-run with a public
   article and a paywalled article. Completed in run `25712528545`.
9. Confirm the public article is exported and the paywalled article remains
   blocked as `article_not_public`. Completed.
10. Run gateway public probes:
    - WebFinger
    - actor
    - outbox
    - NodeInfo discovery
    - NodeInfo 2.1
   Completed for `zeckagent3@staging-gateway.matters.town` and
   `mashbeanmatters@staging-gateway.matters.town`.
11. Run SQLite consistency scan and require `totalDiffs=0`. Completed.
12. Run Misskey read-only probe first; send a public staging Article only if the
    test plan explicitly requires an externally visible delivery. Completed for
    earlier Misskey Article probes.
13. Send one bounded staging `Update` for the pilot-owned public Article to
    accepted followers and require delivery queue health to return to 0 pending
    and 0 dead letters. Completed on 2026-05-15 for g0v.social and gyutte.site.

## Pass Criteria

- Pilot UI controls are visible only for the flagged pilot account.
- Account-level setting can be changed by the viewer.
- Article-level setting can be changed only by the article author.
- Public eligible article can pass the strict gate.
- Paywalled/private/non-public articles remain blocked.
- Gateway probes pass.
- SQLite consistency scan returns `0` diffs.
- Bounded staging outbound delivery can deliver to accepted followers and leave
  no queue backlog or dead letters.
- No production export, production storage write, or production ActivityPub
  delivery occurs.

## Stop Conditions

Stop and record the blocker if:

- the account is not a staging admin and admin mutation is required;
- the account cannot receive `fediverseBeta`;
- the UI row is hidden after `fediverseBeta` is present;
- paywalled/private content becomes eligible;
- strict-gate dry-run attempts a production write;
- delivery queue retains unexplained pending, processing, or dead-letter items
  after a bounded staging outbound delivery;
- a test requires production credentials, production branch rollout, or legal /
  privacy approval.

## Remaining Validation Gaps

- Local AWS CLI is not yet configured on this Mac, so local re-invocation of
  `federation-export-dev` is blocked until profile, region, and credentials are
  available. The existing GitHub Actions Lambda run remains valid evidence.
- Mastodon can receive delivered activities through g0v.social and canonical
  follow proof now persists one accepted follower for
  `acct:mashbeanmatters@matters.town`.
- Misskey canonical follow has passed after the actor key id was moved to the
  versioned gateway-core key id and gyutte.site remote-user state was refreshed.
- Threads can discover the canonical pilot profile but Follow still does not
  complete. Keep this as a non-blocking Threads Follow compatibility
  investigation.
- Cloudflare Meta crawler diagnostics now pass on the narrow staging and
  canonical federation paths. If Threads regresses, re-check WebFinger, actor,
  outbox, and NodeInfo with `meta-externalagent/1.1` before changing gateway
  behavior.
