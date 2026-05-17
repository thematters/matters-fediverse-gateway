import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../scripts/check-production-record-only-preflight.mjs";

function responseJson(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "cf-cache-status": "DYNAMIC",
    },
  });
}

function createFetch({ keyId = "https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517" } = {}) {
  return async (url) => {
    const requestUrl = new URL(url);
    const actorUrl = "https://matters.town/ap/users/mashbeanmatters";

    if (requestUrl.pathname === "/ap/healthz") {
      return responseJson({
        ok: true,
        runtime: {
          component: "gateway-core",
          mode: "gateway-core-proxy",
          storeDriver: "sqlite",
          inboxMode: "persistent",
          followReadiness: "ready",
        },
      });
    }

    if (requestUrl.pathname === "/.well-known/webfinger") {
      return responseJson({
        subject: "acct:mashbeanmatters@matters.town",
        aliases: ["https://matters.town/@mashbeanmatters"],
        links: [{ rel: "self", type: "application/activity+json", href: actorUrl }],
      });
    }

    if (requestUrl.pathname === "/ap/users/mashbeanmatters") {
      return responseJson({
        id: actorUrl,
        type: "Person",
        preferredUsername: "mashbeanmatters",
        inbox: `${actorUrl}/inbox`,
        outbox: `${actorUrl}/outbox`,
        followers: `${actorUrl}/followers`,
        following: `${actorUrl}/following`,
        publicKey: {
          id: keyId,
          owner: actorUrl,
          publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
        },
      });
    }

    if (requestUrl.pathname === "/ap/users/mashbeanmatters/outbox") {
      return responseJson({
        id: `${actorUrl}/outbox`,
        type: "OrderedCollection",
        totalItems: 1,
        orderedItems: [],
      });
    }

    if (requestUrl.pathname === "/ap/users/mashbeanmatters/followers") {
      return responseJson({
        id: `${actorUrl}/followers`,
        type: "OrderedCollection",
        totalItems: 2,
        orderedItems: ["https://g0v.social/users/mashbean", "https://gyutte.site/users/test"],
      });
    }

    return responseJson({ error: "not found" }, 404);
  };
}

test("production record-only preflight passes the canonical pilot baseline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetch();

  try {
    const report = await run({
      baseUrl: "https://matters.town",
      handle: "mashbeanmatters",
      pilotAuthor: "mashbean",
      triggerMode: "record_only",
      fullOutboundEnabled: false,
    });

    assert.equal(report.ok, true);
    assert.deepEqual(report.evaluation.failures, []);
    assert.equal(report.probes.actor.publicKeyId, "https://matters.town/ap/users/mashbeanmatters#gateway-core-20260517");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production record-only preflight rejects unsafe rollout assumptions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetch({ keyId: "https://matters.town/ap/users/mashbeanmatters#main-key" });

  try {
    const report = await run({
      baseUrl: "https://matters.town",
      handle: "mashbeanmatters",
      pilotAuthor: "all-authors",
      triggerMode: "federating",
      fullOutboundEnabled: true,
    });

    assert.equal(report.ok, false);
    assert.equal(
      report.evaluation.failures.some((failure) => failure.includes("record_only")),
      true,
    );
    assert.equal(
      report.evaluation.failures.some((failure) => failure.includes("full outbound")),
      true,
    );
    assert.equal(
      report.evaluation.failures.some((failure) => failure.includes("#main-key")),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
