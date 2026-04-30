# Matters x Fediverse Development Roadmap

Last updated: 2026-04-30

Decision premise: long-form publishing federates as ActivityPub `Article`; Matters is the official operator of the first gateway deployment, not a third-party proposer.

---

## 1. Project Nature

Matters is a long-form writing platform. The Fediverse is an open federated network that includes Mastodon, Threads, Misskey, GoToSocial, and other interoperable services. This project places an official gateway in front of Matters, code-named `gateway-core`, so that:

- Fediverse users can discover Matters authors, follow them, receive new public articles, reply, like, and boost.
- Those interactions can flow back into Matters.
- Long-form writing is exposed as ActivityPub `Article` objects, not collapsed into microblog excerpts.
- Paid, encrypted, private, and message-like content does not federate; at most, it can be represented by safe navigation links where the product policy allows it.

The first public prototype is available at `https://gateway-demo.matters.town` and demonstrates WebFinger, ActivityPub actor, outbox, Article, ActivityPub seed bundle, and NodeInfo endpoints.

---

## 2. Three Product Goals

### G1 - Official Federation Reference Release

One-line goal: give Matters an official federation gateway that Matters can run itself and other publishers can inspect, reuse, and self-host.

Deliverable: a staging-ready reference release that interoperates bidirectionally with Mastodon, Misskey, and GoToSocial, includes a full moderation boundary, and ships with observability and incident runbooks.

Timeline: 3 months, May 2026 to July 2026.

Engineering staffing: 1 FTE backend engineer plus 0.25 FTE ops review.

Estimated cost: NT$450k-600k, approximately EUR 13k-17k for engineering only.

### G2 - Matters Production Integration

One-line goal: connect the gateway to `matters.town` so Matters' community of more than 280,000 registered users can be discoverable from the Fediverse and interact with external federated users.

Deliverable: Matters author accounts resolve as `@user@matters.town`; Matters Web/App surfaces Fediverse replies and follows; rollout moves from selected-author pilot to beta to broader availability.

Timeline: 4-6 months, August 2026 to December 2026 or January 2027.

Engineering staffing: 1 FTE backend engineer, 0.5 FTE frontend engineer, and 0.5 FTE PM/Ops.

Estimated cost: NT$2.0M-3.0M, approximately EUR 55k-85k. This is a Matters product investment and is outside the core grant scope.

### G3 - Second-Instance Reuse Validation

One-line goal: prove the gateway can serve a second independent publishing site, such as a Chinese-language independent media pilot or community instance.

Deliverable: a second test instance federates publicly; registry and namespace isolation pass black-box validation; launch harnesses can be rerun.

Timeline: 2 months, potentially in parallel with the later part of G2, around October 2026 to November 2026.

Engineering staffing: 1 FTE backend engineer.

Estimated cost: NT$300k-400k, approximately EUR 8k-12k.

---

## 3. G1 Scope

G1 is scoped around long-form `Article` federation and official Matters operation.

### Required G1 Work

| # | Work Item | Person-Weeks | Plain-English Description |
|---|---|---:|---|
| W1 | Staging observability drill | 1 | Connect alerts, metrics, logs, and webhooks in a real staging environment and produce a drill report. |
| W3 | Misskey and GoToSocial interoperability | 1 | Validate two additional major Fediverse implementations beyond Mastodon. |
| W4a | Long-form Article systematization | 2.5 | Finalize `Article` as the public object type; implement HTML sanitizer policy, summary/excerpt strategy, attachment mapping, and canonical URL handling. |
| W5 | Paid/encrypted/private boundary enforcement | 1.5 | Add a visibility gate at the static outbox bridge, cover it with tests, and make the admin state inspectable. |
| W6 | Key rotation flow | 1 | Support key overlap windows, rotation scripts, and operator runbooks. |
| W2 | Consistency scan | 1 | Reconcile followers and inbound objects, then produce difference reports. |
| W8 | Incident runbooks and tabletop drill | 1 | Ship launch runbook, incident playbook, rollback plan, and one tabletop drill. |

Subtotal: 9 person-weeks, roughly 2.25 months of engineering plus 2 weeks of review/buffer, for a 3-month G1 delivery window.

### Out of G1 Scope

- W7 legacy field cleanup: useful technical debt, but not launch-critical.
- Prometheus, OTLP, and PagerDuty exporters: webhooks are sufficient until the staging drill proves otherwise.
- Multi-instance registry: reserved for G3.
- Real `matters.town` frontend integration: reserved for G2.

### Hidden G1 Prerequisites

Matters must provide:

- A staging environment: one VM, one subdomain, and TLS.
- An `ipns-site-generator` test bundle.
- One test Matters author identity.
- Two or three real author accounts for W3 interoperability trials, if available.

---

## 4. G2 Work Breakdown

Detailed G2 planning should be finalized when G2 starts. The current estimate is:

| Phase | Work | Engineering Weeks |
|---|---|---:|
| G2-A | Connect real IPNS output instead of fixtures | 2-3 |
| G2-B | Finalize canonical URL strategy and connect the account system | 4-6 |
| G2-C | Surface federated interactions in Matters Web/App | 8-12 |
| G2-D | Pilot alpha with 50-100 invited authors | 4-6 |
| G2-E | Beta to GA rollout and user migration communication | 4-8 |

Key product decision for G2-B:

- Option A: `acct:user@matters.town`. This has the strongest brand and user recognition, but requires touching the main site's WebFinger path.
- Option B: `acct:user@webf.matters.town`. This is easier to isolate and switch off, but splits the public identity.

Decision: use Option A for the long-term canonical identity. Earlier notes considered a B-to-A migration path, but the current decision is to implement `acct:user@matters.town` directly when G2 starts.

---

## 5. G3 Work Breakdown

| Phase | Work | Engineering Weeks |
|---|---|---:|
| G3-A | Implement Stage 06: instance registry, per-instance config, and namespace isolation | 3 |
| G3-B | Deploy second test instance and run black-box acceptance | 2 |
| G3-C | Make launch harness rerunnable across discovery, follow, social, boundary, and moderation checks | 2 |
| G3-D | Package documentation and reference deployment | 1 |

Subtotal: 8 person-weeks, roughly 2 months.

---

## 6. Timeline

```text
2026  | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan 2027 |
G1    |====================|                                      |
G2    |                    |=================================     |
G3    |                                |=============             |
```

Key milestones:

- End of May 2026: W1 and W3 complete; Matters can state that multi-implementation interoperability checks have passed.
- End of July 2026: G1 complete; reference release published; grant mid-point delivery milestone.
- October 2026: G2 pilot alpha with the first selected authors.
- November 2026: G3 complete; second instance accepted.
- December 2026 to January 2027: G2 general availability and grant closeout.

---

## 7. Cost Estimate

| Item | Engineering Weeks | Cost (NT$) | Cost (EUR) | Funding Source |
|---|---:|---:|---:|---|
| G1 | 9 plus buffer | 450k-600k | EUR 13k-17k | Grant plus Matters co-funding |
| G2 | 22-35 | 2.0M-3.0M | EUR 55k-85k | Matters product investment |
| G3 | 8 | 300k-400k | EUR 8k-12k | Grant plus Matters co-funding |
| Total | 39-52 | NT$2.8M-4.0M | EUR 76k-114k | Mixed |

Grant-suitable scope: G1, G3, documentation, release packaging, and interoperability validation. A realistic grant request is approximately EUR 30k-35k, within the common range for NLnet NGI Fediversity / Commons-style public-interest infrastructure work.

---

## 8. Product Decisions

The following decisions were made on 2026-04-25 by mashbean, General Manager of Matters. See `decisions/` for the original decision notes.

| # | Topic | Decision | Affected Work |
|---|---|---|---|
| 01 | Canonical URL strategy | Use `acct:user@matters.town` | G2-B |
| 02 | Article HTML sanitizer | Balanced sanitizer policy; use `ipfs.io` gateway for IPFS links; include original Matters link | W4a |
| 03 | Paid article external representation | Fully invisible to federation | W5 |
| 04 | Existing-user federation adoption | Staged opt-in plus per-article granularity | G2-D / G2-E |
| 05 | Gateway repository location | Public AGPL-3.0 repository under `thematters/matters-fediverse-gateway`; no CLA for the current release | G1 / G2-A |

Implementation impact:

- W4a sanitizer allowlist follows the balanced policy; IPFS hashes are converted to `ipfs.io` URLs where appropriate; public articles include an original `matters.town` link.
- W5 visibility gate is binary for the first release: non-public content is dropped and does not produce preview cards or title-only federation objects.
- G2-A now starts from the public `thematters/matters-fediverse-gateway` repository.
- G2-B connects the account system directly to `acct:user@matters.town`.
- G2-D pilot authors will be manually selected by Matters before the pilot starts.
- Terms of Service and privacy policy updates are handled before G2 production launch, not inside G1.

Still pending, but not blocking the first reference release:

- Terms of Service and privacy policy revisions before G2 launch.
- Final G2-D pilot author list.
- Legal review and notification buffer before full open availability.
