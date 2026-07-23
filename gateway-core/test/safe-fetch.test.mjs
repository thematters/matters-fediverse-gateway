import assert from "node:assert/strict";
import test from "node:test";

import {
  createSafeLookup,
  readLimitedJson,
  safeFederationFetch,
  validateFederationUrl,
} from "../src/lib/safe-fetch.mjs";
import { createRemoteActorDirectory } from "../src/lib/remote-actors.mjs";

test("federation URL policy rejects unsafe schemes, credentials, and networks", () => {
  for (const value of [
    "http://remote.example/actor",
    "https://user:password@remote.example/actor",
    "https://localhost/actor",
    "https://service.internal/actor",
    "https://127.0.0.1/actor",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/actor",
    "https://[64:ff9b::a00:1]/actor",
    "https://[2002:0a00:0001::]/actor",
  ]) {
    assert.throws(
      () => validateFederationUrl(value),
      (error) => error?.temporary === false,
    );
  }

  assert.equal(
    validateFederationUrl("https://remote.example/actor").href,
    "https://remote.example/actor",
  );
  assert.equal(
    validateFederationUrl("https://[2606:4700:4700::1111]/actor").hostname,
    "[2606:4700:4700::1111]",
  );
});

test("safe DNS lookup rejects a hostname when any answer is private", async () => {
  const lookup = createSafeLookup({
    lookup(_hostname, _options, callback) {
      callback(null, [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ]);
    },
  });

  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup("remote.example", { all: true }, (error, records) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(records);
      });
    }),
    (error) => error?.code === "federation_dns_network_forbidden",
  );
});

test("safe federation fetch validates every redirect before following it", async () => {
  const requests = [];

  await assert.rejects(
    safeFederationFetch(
      "https://remote.example/actor",
      {},
      {
        fetchImpl: async (url) => {
          requests.push(url);
          return new Response(null, {
            status: 302,
            headers: {
              location: "https://127.0.0.1/internal",
            },
          });
        },
      },
    ),
    (error) => error?.code === "federation_url_network_forbidden",
  );

  assert.deepEqual(requests, ["https://remote.example/actor"]);
});

test("federation JSON reader enforces a bounded response body", async () => {
  const response = new Response(
    JSON.stringify({
      content: "x".repeat(64),
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    },
  );

  await assert.rejects(
    readLimitedJson(response, { maxBytes: 32 }),
    (error) => error?.code === "federation_response_too_large",
  );
});

test("remote actor discovery rejects an unsafe inbox from a valid actor URL", async () => {
  const directory = createRemoteActorDirectory({
    actorDocumentLoader: async () => ({
      id: "https://remote.example/users/alice",
      type: "Person",
      inbox: "https://169.254.169.254/inbox",
      publicKey: {
        id: "https://remote.example/users/alice#main-key",
        owner: "https://remote.example/users/alice",
        publicKeyPem: "test-public-key",
      },
    }),
  });

  await assert.rejects(
    directory.resolve("https://remote.example/users/alice"),
    (error) => error?.code === "federation_url_network_forbidden",
  );
});
