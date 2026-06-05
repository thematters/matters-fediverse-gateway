# Threads Receiver-Visible Regression

Date: 2026-06-04
Operator: mashbean
Threads account: `mashbean`
Gateway commit: `285650d` or later
Discovery regression: pass
Gateway readback: pass

## Profile

- URL:
  `https://www.threads.com/fediverse_profile/@mashbeanmatters@matters.town`
- Opens: yes, confirmed in logged-in Safari UI readback on 2026-06-04.
- Follow state: following, confirmed in logged-in Safari UI readback on
  2026-06-04.
- Beta notice: Threads indicates users can like posts from other servers but
  cannot reply yet, and that some posts may not display.

## Search

- `@mashbeanmatters@matters.town`: passed.
- `mashbeanmatters@matters.town`: not separately recorded in this screenshot.
- Evidence: user-provided Threads web screenshot on 2026-06-04 shows the search
  field containing `@mashbeanmatters@matters.town` and a result row for
  `@mashbeanmatters@matters.town`, with the fediverse icon beside the account.
- Interpretation: Threads account search indexing has converged for the exact
  handle form. This gate is no longer open for the pilot actor.

## Feed

- Fediverse feed visible: passed in logged-in Safari UI readback on
  2026-06-04.
- Latest companion Note visible / interactable: passed by Threads-origin Like
  return on 2026-06-04T16:53:24.395Z.
- Other remote posts visible: passed in logged-in Safari UI readback on
  2026-06-04.

## Permalink

- Copyable Threads single-post URL: unavailable in current Threads UI.
- Timestamp click: did not navigate away from the remote profile URL.
- Overflow menu: exposed `查看原始貼文`, `封鎖`, and `檢舉`; it did not
  expose a Threads permalink or copy action.
- `查看原始貼文`: opens an external-link confirmation for
  `https://matters.town/a/3tmz0u0a42qx`, so Threads points users back to the
  Matters canonical article URL rather than a Threads-hosted remote-post URL.
- Share button: blocked by Threads with
  `You can't share posts from other servers yet.`

## Reply

- Reply button visible: yes, visible on the latest companion Note.
- Reply allowed: no, blocked by Threads UI.
- Notice text: clicking Reply showed
  `You can't reply to posts from other servers yet.`

## Gateway Return

- Like return: passed for the visible Note probe and the latest companion Note.
- Reply return: not passed; Threads UI does not currently allow the action.
- Receiver readback command:
  `cd gateway-core && npm run check:threads-receiver-readback`
- Notification/content evidence:
  `https://threads.net/ap/users/17841401579146452/#likes/869695086184604`
  was stored by `gateway-core` and appears in local notification/content
  readback for the visible Note.
  `https://threads.net/ap/users/17841401579146452/#likes/1009601838311603`
  was also stored for
  `https://matters.town/ap/notes/ap-articles-threads-note-companion-proof-20260604T155626Z-note-companion`.

## Decision

- Gateway blocker: no.
- Receiver-side limitation: single-post Threads permalink, remote sharing, and
  remote reply are current Threads UI limitations, not gateway blockers.
- Follow-up: continue pilot-scoped Threads checks with the runbook after new
  bounded sends; do not treat Threads search, reply, or permalink limitations
  as gateway blockers unless a public gateway regression also appears.
