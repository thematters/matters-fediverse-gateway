# Threads Article / Note Compatibility

Date: 2026-06-04
Status: first bounded implementation slice complete; live pilot enablement still requires operator action

## Current Evidence

Threads now has enough evidence to split the compatibility state into separate
gates:

- `acct:mashbeanmatters@matters.town` opens as a remote Threads profile.
- Threads UI shows the account in `following` state.
- Threads profile/feed shows remote `Create(Note)` posts from the Matters
  gateway actor.
- Threads UI currently shows a beta notice saying users can like posts from
  other servers but cannot reply yet.
- The visible remote post does not expose a copyable single-post permalink in
  the current Threads UI.
- Threads search still does not reliably find the account, even though the
  profile page itself is visible.
- Gateway admin readback confirms a Threads-origin Like returned for the
  visible Note probe:
  `https://threads.net/ap/users/17841401579146452/#likes/869695086184604`.
- The canonical Article object-id path now works gateway-side:
  `https://matters.town/ap/articles/1228008-threads-article-atomuri-cleanup-20260603T232529Z`
  returns ActivityPub JSON and delivered to Threads, g0v.social, and gyutte.site.

What is not yet proven:

- Threads UI visibility for a long-form `Article` object.
- Threads-origin reply return, because current Threads UI says replies are not
  available for posts from other servers.
- Threads account search indexing.
- Threads single-post permalink availability.

## Product Constraint

Matters should keep long-form publishing represented as ActivityPub `Article`.
Changing all outbound Matters articles to `Note` would weaken the model for
Mastodon, Misskey, archives, and future receivers that handle long-form objects
correctly.

## Options

### Option A: Article-only

Keep sending only ActivityPub `Article`.

Pros:

- Cleanest protocol model for long-form Matters articles.
- No duplicate posts.
- Already works for Mastodon/Misskey and gateway-side Threads delivery.

Cons:

- Threads UI may keep hiding long-form Article objects.
- Threads product value remains weak even though delivery succeeds.

### Option B: Convert Matters articles to Note globally

Send `Note` instead of `Article` for Matters article publishes.

Pros:

- Most likely to maximize Threads UI visibility.
- Simpler than dual object fanout.

Cons:

- Loses long-form ActivityPub semantics.
- Risks degrading Mastodon/Misskey rendering and readback.
- Makes Article-specific fixes and tests less meaningful.

This is not recommended.

### Option C: Add a bounded Note companion for Threads-visible preview

Keep the primary `Article` delivery, and optionally emit a short `Note`
companion that links to the canonical Matters article URL.

Pros:

- Preserves long-form `Article` as the canonical object.
- Gives Threads a visible short-form object that users can like.
- Can be rolled out only for pilot actors or only when explicitly enabled.
- Can keep the companion text simple: title/summary plus Matters short URL.

Cons:

- May create duplicate posts on Mastodon/Misskey unless recipient targeting or
  receiver policy is precise.
- Requires id, update, delete, and audit rules for the companion object.
- Replies remain blocked if Threads UI continues to disallow replies from
  other servers.

### Option D: Per-receiver adapter

Keep canonical `Article` for general receivers, but transform or add a `Note`
only for receiver classes that need it.

Pros:

- Best end-user behavior per receiver.
- Avoids duplicate posts on Mastodon/Misskey if implemented carefully.

Cons:

- Adds receiver-specific behavior to a protocol gateway.
- Requires clear policy, tests, observability, and rollback.
- Receiver detection can be brittle if based only on domains.

## Recommendation

Do not replace `Article` globally.

The next implementation slice should be a bounded compatibility adapter that
can create a Note companion only for explicitly configured pilot cases. It
should be disabled by default and should not affect broad production outbound.

## Implemented Slice

PR-ready code now implements the recommended bounded adapter:

- `Article` remains the primary object and still delivers to all selected
  recipients.
- `compatibility.noteCompanion.enabled` defaults to `false`.
- Companion delivery requires an explicit actor allowlist and receiver domain
  allowlist.
- The companion is emitted only for outbound `Create(Article)`.
- The companion object is a short `Note` with title/summary and the canonical
  Matters article URL.
- The companion receives its own stable `/ap/notes/*-note-companion` id.
- The outbox create response includes a `noteCompanion` block when a companion
  was emitted.
- Automated coverage verifies the adapter only targets `threads.net` recipients
  when configured and leaves the primary Article fanout intact.

Still intentionally deferred:

- Automatic companion Update/Delete handling.
- Broad production enablement.
- Receiver-side Threads proof for the new companion in the live pilot.

Minimum safe slice:

1. Keep canonical `Article` as the primary object.
2. Add config for `noteCompanion.enabled=false` by default.
3. Add an allowlist for pilot actor handles and/or receiver domains.
4. Generate companion `Note` content from Article title/summary plus canonical
   Matters short URL.
5. Give the companion its own stable id under `/ap/notes/`.
6. Record relation metadata linking companion Note to the canonical Article.
7. Do not send companion Notes to all receivers by default.
8. Add tests for Create, delivery records, and primary Article preservation.
   Update/Delete, local-content projection, and dead-letter/replay behavior are
   follow-up coverage for broader enablement.
9. Document that Threads reply remains blocked by UI until Threads changes that
   receiver capability.

## Remaining Decision Needed

Before implementation, choose one:

- Keep Article-only and accept that Threads may show only the Note probes for
  now.
- Build the bounded Note companion adapter for pilot testing.

The bounded adapter has been implemented. The remaining decision is whether to
enable it for the live `mashbeanmatters` pilot with `receiverDomainAllowlist:
["threads.net"]` and run one public companion proof.
