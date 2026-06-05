# Threads Receiver-Visible Regression Runbook

Date: 2026-06-04
Status: active receiver-visible follow-up

## Scope

This runbook checks what a logged-in Threads user can actually see or do after
gateway-side ActivityPub delivery has passed.

It does not use the Threads API and does not require a Threads API integration.
It should be run after bounded gateway-origin proof sends, after Cloudflare
rules change, or when Threads UI behavior appears to change.

## Current Baseline

Passed gateway-side:

- WebFinger for `acct:mashbeanmatters@matters.town`
- actor, outbox, Article, Note, and activity public dereference
- Meta-like user-agent probes with no Cloudflare challenge
- Threads Follow / Accept convergence
- public `Create(Article)` delivery to Threads
- scoped companion `Create(Note)` delivery to Threads

Passed receiver-visible:

- Threads opens the remote profile page for
  `mashbeanmatters@matters.town`.
- Threads shows the profile as followed.
- Threads profile/feed has displayed remote posts from the actor.
- Threads exact-handle search can find `@mashbeanmatters@matters.town`.
- Threads-origin Likes returned to `gateway-core` for the visible Note probe
  and the latest companion Note.

Open receiver-visible checks:

- single-post permalink or copyable URL;
- reply action from Threads to the remote post;

## External Product Context

Meta describes Threads federation as a phased rollout. Its engineering post
notes that Threads had to add UI treatments because replies and other behavior
may or may not federate yet:

- <https://engineering.fb.com/2024/03/21/networking-traffic/threads-has-entered-the-fediverse/>

Meta's 2025 fediverse update says Threads has a dedicated fediverse feed and
profile search, and recommends exact-handle search such as
`@flipboard@flipboard.social`:

- <https://about.fb.com/news/2025/06/its-now-easier-see-more-fediverse-content-threads/>

TechCrunch's coverage of the same rollout says Threads users can see top-level
fediverse posts in a separate feed, but are not yet able to reply to them:

- <https://techcrunch.com/2025/06/17/threads-expands-open-social-web-integrations-with-fediverse-feed-user-profile-search/>

This means a gateway-side pass plus a receiver-visible search or reply failure
is not automatically a gateway bug. Treat it as a receiver-visible gate until a
public endpoint regression is also observed.

## Preflight

Run the public discovery regression first:

```bash
cd gateway-core
npm run check:threads-discovery -- \
  --canonical-base-url https://matters.town \
  --activity-url https://matters.town/ap/activities/1780588588874-create-note-companion-mashbeanmatters \
  --object-url https://matters.town/ap/notes/ap-articles-threads-note-companion-proof-20260604T155626Z-note-companion \
  --object-url https://matters.town/ap/articles/threads-note-companion-proof-20260604T155626Z
```

Expected result:

- `ok=true`
- no failures
- no warnings
- no `cf-mitigated=challenge`
- WebFinger, actor, outbox, activity, Article, and Note probes all return 200

If this fails, fix the gateway / Worker / Cloudflare path before using Threads
UI as evidence.

Run the gateway-side receiver readback next:

```bash
cd gateway-core
npm run check:threads-receiver-readback
```

Expected result for the current pilot:

- `ok=true`
- `Threads-origin Like return` appears under `passed`
- `Threads-origin Reply return` remains under `open`
- `Threads single-post permalink / copyable URL` remains under `open`

This confirms persisted gateway evidence for delivery and returned
interactions. It does not inspect the Threads UI or use Threads APIs.

## UI Checks

Use a logged-in Threads account with fediverse sharing enabled.

Check profile:

- Open:
  `https://www.threads.com/fediverse_profile/@mashbeanmatters@matters.town`
- Record whether the profile opens.
- Record whether the profile shows followed / following state.
- Record follower count and any beta notice text.

Check exact account search:

- Search `@mashbeanmatters@matters.town`.
- Search `mashbeanmatters@matters.town`.
- Record whether either returns the remote fediverse profile.
- If not found, record whether unrelated results appear or no results appear.

Check fediverse feed:

- Open the Threads following / fediverse feed entry point.
- Record whether recent posts from `mashbeanmatters@matters.town` appear.
- Specifically look for the 2026-06-04 companion proof text:
  `Threads Note Companion Proof 20260604T155626Z`.

Check single-post URL:

- Try clicking the latest visible remote post text, timestamp, overflow menu,
  and share controls.
- Record whether Threads exposes a copyable URL.
- If only the profile page is available, mark permalink as unavailable.

Check reply:

- Open the reply action on the visible remote post.
- Do not send a reply unless explicitly approved for that run.
- Record whether Threads says remote replies are unavailable or beta-limited.

Check Like return only when explicitly approved:

- If a new Like is allowed, click Like on one visible remote post.
- Then confirm gateway return with:

```bash
curl -sS 'https://gateway-core-origin.matters.town/admin/local-notifications?actorHandle=mashbeanmatters&category=like' | jq .
```

Do not use Like as a routine check unless it is part of an approved bounded
test, because it changes third-party state.

## Result Template

Create a new report under:

```text
research/matters-fediverse-compat/03-ops/threads-receiver-visible-regression-YYYYMMDD.md
```

Template:

```markdown
# Threads Receiver-Visible Regression

Date:
Operator:
Threads account:
Gateway commit:
Discovery regression: pass/fail

## Profile

- URL:
- Opens:
- Follow state:
- Beta notice:

## Search

- `@mashbeanmatters@matters.town`:
- `mashbeanmatters@matters.town`:
- Interpretation:

## Feed

- Fediverse feed visible:
- Latest companion Note visible:
- Other remote posts visible:

## Permalink

- Copyable single-post URL:
- Observed controls:

## Reply

- Reply button visible:
- Reply allowed:
- Notice text:

## Gateway Return

- Like return:
- Reply return:
- Notification/content evidence:

## Decision

- Gateway blocker:
- Receiver-side limitation:
- Follow-up:
```

## Decision Rules

Treat as gateway / Cloudflare blocker if:

- public discovery regression fails;
- Meta-like user agents receive 403, 429, 503, or challenge pages;
- ActivityPub `content-type` is wrong for actor / activity / object;
- Threads delivery returns non-2xx for a fresh bounded proof.

Treat as receiver-side limitation if:

- public discovery regression passes;
- delivery is `delivered`;
- profile/feed can open;
- Threads UI says remote reply is unavailable.

Do not block Mastodon / Misskey production pilot work on Threads-only search or
reply limitations unless product explicitly decides Threads full UX parity is a
launch requirement.
