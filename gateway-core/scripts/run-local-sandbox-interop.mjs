import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signHttpRequest } from "../src/security/http-signatures.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(moduleDir, "..");
const canonicalActorUrl = "https://matters.example/users/alice";
const receivedActivities = [];

async function reserveAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    const handleError = () => {
      server.listen(0, "127.0.0.1");
    };

    server.once("error", handleError);
    server.listen(preferredPort, "127.0.0.1", () => {
      server.removeListener("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine reserved port"));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function jsonResponse(res, body, status = 200, contentType = "application/json") {
  res.writeHead(status, {
    "content-type": `${contentType}; charset=utf-8`,
  });
  res.end(JSON.stringify(body, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function createRemoteActorDocument({ publicKeyPem, sandboxBaseUrl, remoteActorId, remoteInboxUrl }) {
  return {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
    ],
    id: remoteActorId,
    type: "Person",
    preferredUsername: "zoe",
    inbox: remoteInboxUrl,
    outbox: `${sandboxBaseUrl}/users/zoe/outbox`,
    followers: `${sandboxBaseUrl}/users/zoe/followers`,
    following: `${sandboxBaseUrl}/users/zoe/following`,
    publicKey: {
      id: `${remoteActorId}#main-key`,
      owner: remoteActorId,
      publicKeyPem,
    },
  };
}

async function startSandboxServer({ publicKeyPem, sandboxPort, sandboxBaseUrl, remoteActorId, remoteInboxUrl }) {
  const actorDocument = createRemoteActorDocument({ publicKeyPem, sandboxBaseUrl, remoteActorId, remoteInboxUrl });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, sandboxBaseUrl);

    if (req.method === "GET" && url.pathname === "/users/zoe") {
      jsonResponse(res, actorDocument, 200, "application/activity+json");
      return;
    }

    if (req.method === "POST" && url.pathname === "/users/zoe/inbox") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        receivedActivities.push({
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        });
        jsonResponse(res, { status: "received" }, 202);
      });
      return;
    }

    jsonResponse(res, { error: "Not found" }, 404);
  });

  server.listen(sandboxPort);
  await once(server, "listening");
  return server;
}

function startGatewayServer(gatewayPort) {
  return spawn("node", ["src/server.mjs", "--config", "./config/dev.instance.json", "--port", String(gatewayPort), "--host", "127.0.0.1"], {
    cwd: gatewayDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function readJson(url, expectedType = null) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  if (expectedType && !response.headers.get("content-type")?.includes(expectedType)) {
    throw new Error(`GET ${url} returned unexpected content type ${response.headers.get("content-type")}`);
  }

  return response.json();
}

async function sendFollow({ privateKeyPem, gatewayBaseUrl, remoteActorId }) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${remoteActorId}/activities/follow-${nonce}`,
    type: "Follow",
    actor: remoteActorId,
    object: canonicalActorUrl,
  };
  const body = JSON.stringify(activity);
  const inboxUrl = `${gatewayBaseUrl}/users/alice/inbox`;
  const signedHeaders = signHttpRequest({
    method: "POST",
    url: inboxUrl,
    body,
    keyId: `${remoteActorId}#main-key`,
    privateKeyPem,
  });

  const response = await fetch(inboxUrl, {
    method: "POST",
    headers: {
      "content-type": "application/activity+json",
      ...signedHeaders,
    },
    body,
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  const gatewayPort = await reserveAvailablePort(Number.parseInt(process.env.GATEWAY_PORT ?? "8787", 10));
  const sandboxPort = await reserveAvailablePort(Number.parseInt(process.env.SANDBOX_PORT ?? "8790", 10));
  const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
  const sandboxBaseUrl = `http://127.0.0.1:${sandboxPort}`;
  const remoteActorId = `${sandboxBaseUrl}/users/zoe`;
  const remoteInboxUrl = `${sandboxBaseUrl}/users/zoe/inbox`;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

  const sandboxServer = await startSandboxServer({
    publicKeyPem,
    sandboxPort,
    sandboxBaseUrl,
    remoteActorId,
    remoteInboxUrl,
  });
  const gatewayServer = startGatewayServer(gatewayPort);
  let stdout = "";
  let stderr = "";
  gatewayServer.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  gatewayServer.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForUrl(`${gatewayBaseUrl}/.well-known/webfinger?resource=acct:alice@matters.example`);

    const webfinger = await readJson(
      `${gatewayBaseUrl}/.well-known/webfinger?resource=acct:alice@matters.example`,
      "application/jrd+json",
    );
    const actor = await readJson(`${gatewayBaseUrl}/users/alice`, "application/activity+json");
    const outbox = await readJson(`${gatewayBaseUrl}/users/alice/outbox`, "application/activity+json");
    const followResult = await sendFollow({
      privateKeyPem,
      gatewayBaseUrl,
      remoteActorId,
    });

    for (let attempt = 0; attempt < 20 && receivedActivities.length === 0; attempt += 1) {
      await sleep(250);
    }

    if (receivedActivities.length === 0) {
      throw new Error(
        `Gateway did not deliver Accept to sandbox inbox\nfollowResult=${JSON.stringify(followResult)}\nstdout=${stdout}\nstderr=${stderr}`,
      );
    }

    const acceptActivity = receivedActivities[0].body;
    const report = {
      discovery: {
        subject: webfinger.subject,
        actorHref: webfinger.links.find((link) => link.rel === "self")?.href ?? null,
        actorId: actor.id,
        followers: actor.followers,
        outboxId: outbox.id,
        outboxTotalItems: outbox.totalItems,
        outboxFirstActor: outbox.orderedItems?.[0]?.actor ?? null,
      },
      follow: {
        followResponseStatus: followResult.status,
        followResponseBody: followResult.body,
        acceptReceived: acceptActivity?.type === "Accept",
        acceptActor: acceptActivity?.actor ?? null,
        acceptObjectType: acceptActivity?.object?.type ?? null,
      },
    };

    const failures = [];
    if (webfinger.subject !== "acct:alice@matters.example") {
      failures.push("webfinger subject mismatch");
    }
    if (actor.id !== canonicalActorUrl) {
      failures.push("actor id mismatch");
    }
    if (outbox.id !== `${canonicalActorUrl}/outbox`) {
      failures.push("outbox id mismatch");
    }
    if (outbox.orderedItems?.[0]?.actor !== canonicalActorUrl) {
      failures.push("outbox actor was not rewritten to canonical actor");
    }
    if (followResult.status !== 202) {
      failures.push("Follow did not return HTTP 202");
    }
    if (acceptActivity?.type !== "Accept") {
      failures.push("sandbox inbox did not receive Accept");
    }

    process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2)}\n`);
    process.exitCode = failures.length === 0 ? 0 : 1;
  } finally {
    gatewayServer.kill("SIGTERM");
    sandboxServer.close();
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
