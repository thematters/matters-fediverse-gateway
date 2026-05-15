import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "../scripts/run-mastodon-readback.mjs";

test("mastodon readback resolves remote account and checks expected URL", async () => {
  const originalFetch = globalThis.fetch;
  const tmpDir = await mkdtemp(path.join(tmpdir(), "mastodon-readback-"));
  const tokenFile = path.join(tmpDir, "token");
  await writeFile(tokenFile, "test-token\n");

  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.authorization, "Bearer test-token");
    const requestUrl = new URL(url);

    if (requestUrl.pathname === "/api/v1/accounts/verify_credentials") {
      return Response.json({ id: "local-1", acct: "mashbean", username: "mashbean", url: "https://g0v.social/@mashbean" });
    }
    if (requestUrl.pathname === "/api/v2/search") {
      assert.equal(requestUrl.searchParams.get("q"), "@alice@staging-gateway.example");
      return Response.json({
        accounts: [
          {
            id: "remote-1",
            acct: "alice@staging-gateway.example",
            username: "alice",
            url: "https://g0v.social/@alice@staging-gateway.example",
            uri: "https://staging-gateway.example/users/alice",
            followers_count: 2,
            statuses_count: 1,
          },
        ],
      });
    }
    if (requestUrl.pathname === "/api/v1/accounts/remote-1/statuses") {
      return Response.json([
        {
          id: "status-1",
          created_at: "2026-05-15T00:00:00.000Z",
          uri: "https://staging-gateway.example/articles/readback-proof",
          url: "https://staging-gateway.example/articles/readback-proof",
          content: "<p>readback proof</p>",
          replies_count: 0,
          reblogs_count: 0,
          favourites_count: 0,
        },
      ]);
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };

  try {
    const report = await run({
      mastodonBaseUrl: "https://g0v.social",
      accessToken: null,
      tokenFile,
      acct: "alice@staging-gateway.example",
      expectedUrl: "https://staging-gateway.example/articles/readback-proof",
      outputFile: null,
      limit: 20,
    });

    assert.equal(report.ok, true);
    assert.equal(report.remoteAccount.acct, "alice@staging-gateway.example");
    assert.equal(report.statuses[0].uri, "https://staging-gateway.example/articles/readback-proof");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
