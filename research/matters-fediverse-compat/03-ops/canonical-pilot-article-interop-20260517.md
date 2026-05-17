# Canonical Pilot Article Interop Run 2026-05-17

## Scope

This run verifies the canonical pilot actor `acct:mashbeanmatters@matters.town`
before production-wide rollout. It does not enable full production federation
for all authors.

Approved pilot constraints:

- Threads is not a launch blocker.
- Production preparation may proceed, but full outbound delivery is not enabled.
- The first production-facing path stays limited to record-only plus pilot
  author observation.
- Pilot author: `mashbean`.
- Gateway actor keys should use a fresh versioned key id, not the old Worker
  demo `#main-key`.

## Article Delivery

Pilot Article:

- Object: `https://matters.town/ap/articles/canonical-pilot-article-20260517t042821z`
- Activity: `https://matters.town/ap/activities/1778992102102-create-mashbeanmatters`
- Actor: `https://matters.town/ap/users/mashbeanmatters`

Delivery results:

| Target | Result |
| --- | --- |
| `https://g0v.social/users/mashbean` | delivered |
| `https://gyutte.site/users/819de678273e9b120fd654b5` | delivered |

Platform readback:

| Platform | Evidence |
| --- | --- |
| Mastodon / g0v.social | API readback found status `116588026424982635` with URI `https://matters.town/ap/articles/canonical-pilot-article-20260517t042821z` |
| Misskey / gyutte.site | `users/notes` found note `819e34313973c61ee9c1da0e` with URI and URL set to the pilot Article object |

Interpretation: the canonical pilot Article is visible on both Mastodon and
Misskey.

## Interaction Return

Misskey interactions were sent from `https://gyutte.site/@mashbean` to the
canonical pilot Article.

| Interaction | Platform object | Gateway trace result |
| --- | --- | --- |
| Reply | `https://gyutte.site/notes/819e3432509b85525fb5db37/activity` | `reply.stored` |
| Reaction / Like | `https://gyutte.site/likes/819e343250f7d796cd6589a4` | `like.stored` |
| Renote / Boost | `https://gyutte.site/notes/819e34325149224d4f2fb3a3/activity` | `announce.stored` |

Gateway state summary after the run:

- Outbound queue rows are delivered.
- The pilot Article has 1 matching inbound object.
- The pilot Article has 2 matching inbound engagements.

Interpretation: Misskey reply, like, and boost-style interaction return paths
work through gateway-core and are persisted in SQLite.

## Mastodon Interaction Gap

Mastodon article visibility passed, but the available g0v.social token is
read-only. An API attempt to reply returned `403` with:

`This action is outside the authorized scopes`

Mastodon reply / like / boost return testing therefore requires either:

- a write-scoped Mastodon test token, or
- manual browser interaction from a logged-in test account.

This is a test credential limitation, not a gateway failure.

## Production Implication

This run supports moving into production preparation for a narrow pilot:

- keep author federation default-off,
- keep `record_only` before real production export,
- observe only the pilot author first,
- keep Threads out of the blocker list,
- preserve the versioned key id strategy for production actor keys.

It does not approve all-author outbound delivery.
