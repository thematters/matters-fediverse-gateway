import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFile = promisify(execFileCallback);
const nodeBin = process.execPath;
const contentId = "https://matters.example/ap/notes/threads-companion";

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

function createAdminServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json");

    if (requestUrl.pathname === "/admin/queues/outbound") {
      response.end(
        JSON.stringify({
          queue: {
            summary: {
              total: 3,
              pending: 0,
              processing: 0,
              delivered: 3,
              deadLetter: 0,
            },
          },
        }),
      );
      return;
    }

    if (requestUrl.pathname === "/admin/local-notifications") {
      const category = requestUrl.searchParams.get("category");
      if (category === "like") {
        response.end(
          JSON.stringify({
            notifications: [
              {
                contentId,
                threadId: contentId,
                activityId: "https://threads.net/ap/users/123/#likes/456",
                remoteActorIds: ["https://threads.net/ap/users/123/"],
              },
            ],
          }),
        );
        return;
      }
      if (category === "reply") {
        response.end(
          JSON.stringify({
            notifications: [
              {
                contentId: "https://matters.example/ap/articles/other",
                activityId: "https://gyutte.site/notes/reply/activity",
                remoteActorIds: ["https://gyutte.site/users/abc"],
              },
            ],
          }),
        );
        return;
      }
    }

    if (requestUrl.pathname === "/admin/local-content") {
      response.end(
        JSON.stringify({
          items: [
            {
              contentId: "https://matters.example/a/source-article",
              latestObjectId: contentId,
              status: "resolved",
              delivery: {
                delivered: 1,
                pending: 0,
                deadLetter: 0,
              },
              metrics: {
                likes: 0,
                replies: 0,
                announces: 0,
              },
              relations: {
                engagementIds: [],
              },
            },
            {
              contentId,
              status: "partial",
              delivery: {
                delivered: 1,
                pending: 0,
                deadLetter: 0,
              },
              metrics: {
                likes: 1,
                replies: 0,
                announces: 0,
              },
              relations: {
                engagementIds: ["https://threads.net/ap/users/123/#likes/456"],
              },
            },
          ],
        }),
      );
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: "not_found" }));
  });

  return server;
}

test("threads receiver visible readback summarizes gateway evidence and open gates", async () => {
  const server = createAdminServer();
  const baseUrl = await listen(server);

  try {
    const { stdout } = await execFile(
      nodeBin,
      [
        "scripts/run-threads-receiver-visible-readback.mjs",
        "--admin-base-url",
        baseUrl,
        "--actor-handle",
        "alice",
        "--content-id",
        contentId,
      ],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const report = JSON.parse(stdout);
    assert.equal(report.ok, true);
    assert.equal(report.evaluation.passed.includes("Threads-origin Like return"), true);
    assert.equal(report.evaluation.open.includes("Threads-origin Reply return"), true);
    assert.equal(report.evaluation.open.includes("Threads single-post permalink / copyable URL"), true);
    assert.equal(report.notifications.like.threadsMatching, 1);
    assert.equal(report.notifications.reply.threadsMatching, 0);
    assert.equal(report.content[0].metrics.likes, 1);
    assert.deepEqual(report.content[0].threadsEngagementIds, ["https://threads.net/ap/users/123/#likes/456"]);
  } finally {
    await closeServer(server);
  }
});
