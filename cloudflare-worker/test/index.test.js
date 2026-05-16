import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const canonicalEnv = {
  PUBLIC_BASE_URL: "https://matters.town",
  MATTERS_PROFILE_URL: "https://matters.town",
};

async function fetchWorker(path, env = canonicalEnv) {
  return worker.fetch(new Request(`https://matters.town${path}`), env);
}

test("canonical pilot handle is closed unless explicitly configured", async () => {
  const response = await fetchWorker(
    "/.well-known/webfinger?resource=acct:mashbeanmatters@matters.town",
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "unknown_resource");
  assert.deepEqual(body.accepted, [
    "acct:matters@matters.town",
    "acct:mattersprobe02@matters.town",
  ]);
});

test("configured canonical pilot handle exposes WebFinger and actor routes", async () => {
  const env = {
    ...canonicalEnv,
    CANONICAL_PILOT_HANDLES: "mashbeanmatters",
  };

  const webfingerResponse = await fetchWorker(
    "/.well-known/webfinger?resource=acct:mashbeanmatters@matters.town",
    env,
  );
  const webfinger = await webfingerResponse.json();

  assert.equal(webfingerResponse.status, 200);
  assert.equal(webfinger.subject, "acct:mashbeanmatters@matters.town");
  assert.equal(
    webfinger.links.some(
      (link) =>
        link.rel === "self" &&
        link.href === "https://matters.town/ap/users/mashbeanmatters",
    ),
    true,
  );

  const actorResponse = await fetchWorker("/ap/users/mashbeanmatters", env);
  const actor = await actorResponse.json();

  assert.equal(actorResponse.status, 200);
  assert.equal(actor.type, "Person");
  assert.equal(actor.id, "https://matters.town/ap/users/mashbeanmatters");
  assert.equal(actor.inbox, "https://matters.town/ap/users/mashbeanmatters/inbox");
  assert.equal(actor.outbox, "https://matters.town/ap/users/mashbeanmatters/outbox");
  assert.equal(actor.publicKey.owner, actor.id);
});

test("pilot handle list ignores malformed handles", async () => {
  const env = {
    ...canonicalEnv,
    CANONICAL_PILOT_HANDLES: "mashbeanmatters, bad/handle, also_ok",
  };

  const landingResponse = await fetchWorker("/", env);
  const landing = await landingResponse.json();

  assert.deepEqual(landing.pilotActors, [
    "acct:mashbeanmatters@matters.town",
    "acct:also_ok@matters.town",
  ]);
});

test("canonical healthz reports edge demo follow readiness when gateway-core origin is absent", async () => {
  const response = await fetchWorker("/ap/healthz");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.runtime, {
    mode: "edge-demo",
    inboxMode: "accepted-not-persistent",
    followReadiness: "blocked",
  });
});

test("canonical healthz reports gateway-core follow readiness when origin is configured", async () => {
  const response = await fetchWorker("/ap/healthz", {
    ...canonicalEnv,
    GATEWAY_CORE_ORIGIN: "https://gateway-origin.example.test/",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.runtime, {
    mode: "gateway-core-proxy",
    inboxMode: "persistent",
    followReadiness: "ready",
  });
});
