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

async function createGatewayProbeServer({ handle = "alice", remoteFollower = "https://gyutte.site/users/test" } = {}) {
  const requests = [];
  let createPayload = null;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: request.method,
      url: request.url,
      body: body ? JSON.parse(body) : null,
    });

    if (request.method === "GET" && requestUrl.pathname === `/users/${handle}/followers`) {
      response.writeHead(200, { "content-type": "application/activity+json" });
      response.end(
        JSON.stringify({
          "@context": "https://www.w3.org/ns/activitystreams",
          id: `http://${request.headers.host}/users/${handle}/followers`,
          type: "OrderedCollection",
          totalItems: 1,
          orderedItems: [remoteFollower],
        }),
      );
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === `/users/${handle}/outbox/create`) {
      createPayload = body ? JSON.parse(body) : null;
      response.writeHead(202, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "queued",
          activityId: `${createPayload.object.id}#activity`,
          recipients: [remoteFollower],
          deliveries: [{ id: "delivery-1", status: "delivered", targetActorId: remoteFollower }],
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    requests,
    get createPayload() {
      return createPayload;
    },
    close: () => closeServer(server),
  };
}

async function createMisskeyDisplayServer({ token, gatewayHost, getCreatePayload, handle = "alice" }) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    const payload = body ? JSON.parse(body) : {};
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: payload,
    });

    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (request.url === "/api/ap/show") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          type: "User",
          object: {
            id: "misskey-remote-user-1",
            username: handle,
            host: gatewayHost,
            uri: `http://${gatewayHost}/users/${handle}`,
            url: `http://${gatewayHost}/@${handle}`,
          },
        }),
      );
      return;
    }

    if (request.url === "/api/users/notes") {
      const createPayload = getCreatePayload();
      const files = (Array.isArray(createPayload?.object?.attachment) ? createPayload.object.attachment : []).map((attachment, index) => ({
        id: `file-${index + 1}`,
        type: attachment.mediaType,
        name: attachment.name,
        url: attachment.url?.startsWith("ipfs://")
          ? `https://ipfs.io/ipfs/${attachment.url.slice("ipfs://".length)}`
          : attachment.url,
        thumbnailUrl: attachment.url?.startsWith("ipfs://")
          ? `https://ipfs.io/ipfs/${attachment.url.slice("ipfs://".length)}`
          : attachment.url,
      }));
      const notes = createPayload
        ? [
            {
              id: "note-1",
              uri: createPayload.object.id,
              url: createPayload.object.url,
              text: createPayload.object.name,
              createdAt: "2026-05-02T00:00:01.000Z",
              files,
            },
          ]
        : [];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(notes));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    requests,
    close: () => closeServer(server),
  };
}

test("misskey article display probe defaults to dry-run without publishing", async () => {
  const gatewayServer = await createGatewayProbeServer();
  const gatewayHost = new URL(gatewayServer.baseUrl).host;
  const misskeyServer = await createMisskeyDisplayServer({
    token: "misskey-display-secret",
    gatewayHost,
    getCreatePayload: () => gatewayServer.createPayload,
  });

  try {
    const { stdout } = await execFile(
      nodeBin,
      ["scripts/run-misskey-article-display-probe.mjs", "--now", "2026-05-02T00:00:00.000Z"],
      {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          MISSKEY_BASE_URL: misskeyServer.baseUrl,
          MISSKEY_ACCESS_TOKEN: "misskey-display-secret",
          GATEWAY_PUBLIC_BASE_URL: gatewayServer.baseUrl,
          GATEWAY_HANDLE: "alice",
        },
      },
    );

    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "dry-run");
    assert.equal(payload.publicActionRequired, true);
    assert.match(payload.report.plannedCreate.objectId, /w4a-misskey-display-probe-20260502t000000z/);
    assert.equal(gatewayServer.createPayload, null);
    assert.equal(stdout.includes("misskey-display-secret"), false);
    assert.deepEqual(
      gatewayServer.requests.map((entry) => `${entry.method} ${entry.url}`),
      ["GET /users/alice/followers"],
    );
  } finally {
    await gatewayServer.close();
    await misskeyServer.close();
  }
});

test("misskey article display probe prepares media fixture without publishing by default", async () => {
  const gatewayServer = await createGatewayProbeServer();
  const gatewayHost = new URL(gatewayServer.baseUrl).host;
  const misskeyServer = await createMisskeyDisplayServer({
    token: "misskey-display-secret",
    gatewayHost,
    getCreatePayload: () => gatewayServer.createPayload,
  });

  try {
    const { stdout } = await execFile(
      nodeBin,
      ["scripts/run-misskey-article-display-probe.mjs", "--fixture", "media", "--slug", "w4a-media-test"],
      {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          MISSKEY_BASE_URL: misskeyServer.baseUrl,
          MISSKEY_ACCESS_TOKEN: "misskey-display-secret",
          GATEWAY_PUBLIC_BASE_URL: gatewayServer.baseUrl,
          GATEWAY_HANDLE: "alice",
        },
      },
    );

    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "dry-run");
    assert.equal(payload.report.plannedCreate.fixture, "media");
    assert.equal(payload.report.plannedCreate.payload.object.attachment.length, 2);
    assert.deepEqual(payload.report.plannedCreate.expectedAttachmentUrls, [
      "https://www.w3.org/assets/logos/w3c-2025-transitional/w3c-72x48.png",
      "https://ipfs.io/ipfs/bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom",
    ]);
    assert.equal(gatewayServer.createPayload, null);
    assert.equal(stdout.includes("misskey-display-secret"), false);
  } finally {
    await gatewayServer.close();
    await misskeyServer.close();
  }
});

test("misskey article display probe sends only with explicit public-create confirmation", async () => {
  const gatewayServer = await createGatewayProbeServer();
  const gatewayHost = new URL(gatewayServer.baseUrl).host;
  const misskeyServer = await createMisskeyDisplayServer({
    token: "misskey-display-secret",
    gatewayHost,
    getCreatePayload: () => gatewayServer.createPayload,
  });

  try {
    const { stdout } = await execFile(
      nodeBin,
      [
        "scripts/run-misskey-article-display-probe.mjs",
        "--send",
        "--confirm-public-create",
        "--slug",
        "w4a-test",
        "--now",
        "2026-05-02T00:00:00.000Z",
      ],
      {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          MISSKEY_BASE_URL: misskeyServer.baseUrl,
          MISSKEY_ACCESS_TOKEN: "misskey-display-secret",
          GATEWAY_PUBLIC_BASE_URL: gatewayServer.baseUrl,
          GATEWAY_HANDLE: "alice",
          MISSKEY_DISPLAY_POLL_ATTEMPTS: "1",
          MISSKEY_DISPLAY_POLL_INTERVAL_MS: "1",
        },
      },
    );

    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "send");
    assert.equal(payload.publicActionRequired, false);
    assert.equal(payload.report.create.status, "queued");
    assert.equal(payload.report.misskey.matchedNote.id, "note-1");
    assert.equal(gatewayServer.createPayload.object.id, `${gatewayServer.baseUrl}/articles/w4a-test`);
    assert.equal(stdout.includes("misskey-display-secret"), false);
  } finally {
    await gatewayServer.close();
    await misskeyServer.close();
  }
});

test("misskey article display probe checks media fixture files after send", async () => {
  const gatewayServer = await createGatewayProbeServer();
  const gatewayHost = new URL(gatewayServer.baseUrl).host;
  const misskeyServer = await createMisskeyDisplayServer({
    token: "misskey-display-secret",
    gatewayHost,
    getCreatePayload: () => gatewayServer.createPayload,
  });

  try {
    const { stdout } = await execFile(
      nodeBin,
      [
        "scripts/run-misskey-article-display-probe.mjs",
        "--fixture",
        "media",
        "--send",
        "--confirm-public-create",
        "--slug",
        "w4a-media-test",
        "--now",
        "2026-05-02T00:00:00.000Z",
      ],
      {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          MISSKEY_BASE_URL: misskeyServer.baseUrl,
          MISSKEY_ACCESS_TOKEN: "misskey-display-secret",
          GATEWAY_PUBLIC_BASE_URL: gatewayServer.baseUrl,
          GATEWAY_HANDLE: "alice",
          MISSKEY_DISPLAY_POLL_ATTEMPTS: "1",
          MISSKEY_DISPLAY_POLL_INTERVAL_MS: "1",
        },
      },
    );

    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "send");
    assert.equal(payload.report.misskey.matchedNote.files.length, 2);
    assert.deepEqual(
      payload.report.misskey.matchedNote.files.map((file) => file.url),
      [
        "https://www.w3.org/assets/logos/w3c-2025-transitional/w3c-72x48.png",
        "https://ipfs.io/ipfs/bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom",
      ],
    );
    assert.equal(gatewayServer.createPayload.object.attachment.length, 2);
    assert.equal(stdout.includes("misskey-display-secret"), false);
  } finally {
    await gatewayServer.close();
    await misskeyServer.close();
  }
});

test("misskey article display probe rejects send without public-create confirmation", async () => {
  await assert.rejects(
    execFile(nodeBin, ["scripts/run-misskey-article-display-probe.mjs", "--send"], {
      cwd: path.resolve(process.cwd()),
      env: {
        ...process.env,
        MISSKEY_BASE_URL: "http://127.0.0.1:1",
        MISSKEY_ACCESS_TOKEN: "misskey-display-secret",
        GATEWAY_PUBLIC_BASE_URL: "http://127.0.0.1:2",
      },
    }),
    /--send requires --confirm-public-create/,
  );
});

test("misskey article display probe rejects unknown fixture", async () => {
  await assert.rejects(
    execFile(nodeBin, ["scripts/run-misskey-article-display-probe.mjs", "--fixture", "unknown"], {
      cwd: path.resolve(process.cwd()),
    }),
    /--fixture must be text or media/,
  );
});
