# Threads Receiver-Visible Regression

Date: 2026-06-04
Operator: mashbean
Threads account: `mashbean`
Gateway commit: `12d259a` or later
Discovery regression: pass

## Profile

- URL:
  `https://www.threads.com/fediverse_profile/@mashbeanmatters@matters.town`
- Opens: yes, confirmed in earlier 2026-06-04 UI readback.
- Follow state: following, confirmed in earlier 2026-06-04 UI readback.
- Beta notice: Threads indicated users can like posts from other servers but
  cannot reply yet in the earlier UI readback.

## Search

- `@mashbeanmatters@matters.town`: passed.
- `mashbeanmatters@matters.town`: not separately recorded in this screenshot.
- Evidence: user-provided Threads web screenshot on 2026-06-04 shows the search
  field containing `@mashbeanmatters@matters.town` and a result row for
  `@mashbeanmatters@matters.town`, with the fediverse icon beside the account.
- Interpretation: Threads account search indexing has converged for the exact
  handle form. This gate is no longer open for the pilot actor.

## Feed

- Fediverse feed visible: passed in earlier 2026-06-04 UI readback.
- Latest companion Note visible / interactable: passed by Threads-origin Like
  return on 2026-06-04T16:53:24.395Z.
- Other remote posts visible: passed in earlier 2026-06-04 UI readback.

## Permalink

- Copyable single-post URL: still open.
- Observed controls: earlier UI readback did not expose a copyable single-post
  permalink for the remote post.

## Reply

- Reply button visible: visible on prior profile/feed readback.
- Reply allowed: still open / blocked by Threads UI notice.
- Notice text: earlier UI readback showed a beta notice that users can like
  posts from other servers but cannot reply yet.

## Gateway Return

- Like return: passed for the visible Note probe and the latest companion Note.
- Reply return: not passed; Threads UI does not currently allow the action.
- Notification/content evidence:
  `https://threads.net/ap/users/17841401579146452/#likes/869695086184604`
  was stored by `gateway-core` and appears in local notification/content
  readback for the visible Note.
  `https://threads.net/ap/users/17841401579146452/#likes/1009601838311603`
  was also stored for
  `https://matters.town/ap/notes/ap-articles-threads-note-companion-proof-20260604T155626Z-note-companion`.

## Decision

- Gateway blocker: no.
- Receiver-side limitation: single-post permalink and remote reply remain
  receiver-visible limitations or open checks.
- Follow-up: continue pilot-scoped Threads checks with the runbook after new
  bounded sends; do not treat Threads search as a blocker.
