import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFile = promisify(execFileCallback);
const nodeBin = process.execPath;

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createDiscoveryServer({ handle = "alice", acceptedHost = null } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const host = request.headers.host;
    const baseUrl = `http://${host}`;
    const actorUrl = `${baseUrl}/users/${handle}`;
    const accountHost = acceptedHost ?? host;
    const stagingAcct = `acct:${handle}@${accountHost}`;

    requests.push({
      url: request.url,
      userAgent: request.headers["user-agent"],
    });

    if (requestUrl.pathname === "/.well-known/webfinger") {
      const resource = requestUrl.searchParams.get("resource");
      response.setHeader("cache-control", "no-store");
      response.setHeader("cf-cache-status", "DYNAMIC");
      if (resource !== stagingAcct) {
        response.writeHead(404, { "content-type": "application/jrd+json" });
        response.end(JSON.stringify({ error: "unknown_resource", accepted: [stagingAcct] }));
        return;
      }
      response.writeHead(200, { "content-type": "application/jrd+json" });
      response.end(
        JSON.stringify({
          subject: stagingAcct,
          aliases: [`${baseUrl}/@${handle}`],
          links: [{ rel: "self", type: "application/activity+json", href: actorUrl }],
        }),
      );
      return;
    }

    if (requestUrl.pathname === `/users/${handle}`) {
      response.writeHead(200, { "content-type": "application/activity+json", "cache-control": "no-store" });
      response.end(
        JSON.stringify({
          "@context": [
            "https://www.w3.org/ns/activitystreams",
            { toot: "http://joinmastodon.org/ns#", discoverable: "toot:discoverable" },
          ],
          id: actorUrl,
          type: "Person",
          preferredUsername: handle,
          inbox: `${actorUrl}/inbox`,
          outbox: `${actorUrl}/outbox`,
          followers: `${actorUrl}/followers`,
          discoverable: true,
          indexable: true,
        }),
      );
      return;
    }

    if (requestUrl.pathname === `/users/${handle}/outbox`) {
      response.writeHead(200, { "content-type": "application/activity+json" });
      response.end(
        JSON.stringify({
          "@context": "https://www.w3.org/ns/activitystreams",
          id: `${actorUrl}/outbox`,
          type: "OrderedCollection",
          totalItems: 0,
          orderedItems: [],
        }),
      );
      return;
    }

    if (requestUrl.pathname === "/.well-known/nodeinfo") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: `${baseUrl}/nodeinfo/2.1` }],
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  return {
    requests,
    server,
  };
}

test("threads discovery diagnostics passes staging surface and warns on canonical mismatch", async () => {
  const discovery = createDiscoveryServer();
  const baseUrl = await listen(discovery.server);

  try {
    const { stdout } = await execFile(
      nodeBin,
      [
        "scripts/run-threads-discovery-diagnostics.mjs",
        "--base-url",
        baseUrl,
        "--handle",
        "alice",
        "--canonical-domain",
        "matters.town",
      ],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const report = JSON.parse(stdout);
    assert.equal(report.ok, true);
    assert.equal(report.scope.stagingAcct, `acct:alice@${new URL(baseUrl).host}`);
    assert.equal(report.scope.canonicalAcct, "acct:alice@matters.town");
    assert.equal(report.evaluation.failures.length, 0);
    assert.equal(report.evaluation.warnings.some((warning) => warning.includes("acct:alice@matters.town")), true);
    assert.equal(report.probes.some((probe) => probe.userAgentName === "facebookexternalua"), true);
    assert.equal(discovery.requests.some((entry) => entry.userAgent === "facebookexternalua"), true);
  } finally {
    await closeServer(discovery.server);
  }
});

test("threads discovery diagnostics can probe the real canonical base separately", async () => {
  const staging = createDiscoveryServer();
  const canonical = createDiscoveryServer({ acceptedHost: "matters.town" });
  const stagingBaseUrl = await listen(staging.server);
  const canonicalBaseUrl = await listen(canonical.server);

  try {
    const { stdout } = await execFile(
      nodeBin,
      [
        "scripts/run-threads-discovery-diagnostics.mjs",
        "--base-url",
        stagingBaseUrl,
        "--handle",
        "alice",
        "--canonical-domain",
        "matters.town",
        "--canonical-base-url",
        canonicalBaseUrl,
      ],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const report = JSON.parse(stdout);
    assert.equal(report.ok, true);
    assert.equal(report.scope.canonicalBaseUrl, canonicalBaseUrl);
    assert.equal(
      report.probes.some((probe) => probe.name === "webfinger-canonical" && probe.status === 200),
      true,
    );
    assert.equal(
      report.probes.some((probe) => probe.name === "webfinger-canonical-on-staging" && probe.status === 404),
      true,
    );
    assert.equal(canonical.requests.some((entry) => entry.url.includes("acct%3Aalice%40matters.town")), true);
  } finally {
    await closeServer(staging.server);
    await closeServer(canonical.server);
  }
});
