import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createStateStore } from "../src/store/create-state-store.mjs";

const execFile = promisify(execFileCallback);
const nodeBin = process.execPath;
const THREADS_ACTOR_ID = "https://threads.net/ap/users/17841401579146452/";

function pemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

async function createProbeHarness() {
  const tmpDir = path.join(os.tmpdir(), `threads-note-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const keys = pemPair();
  const sqliteFile = path.join(tmpDir, "runtime.sqlite");
  const configPath = path.join(tmpDir, "gateway.instance.json");
  const config = {
    instance: {
      domain: "matters.example",
      activityPathPrefix: "/ap",
    },
    actors: {
      mashbeanmatters: {
        displayName: "mashbeanmatters",
        publicKeyPem: keys.publicKeyPem,
        privateKeyPem: keys.privateKeyPem,
        keyId: "https://matters.example/ap/users/mashbeanmatters#test-key",
      },
    },
    runtime: {
      storeDriver: "sqlite",
      sqliteFile,
    },
    delivery: {
      userAgent: "MattersGatewayCore/Test",
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const store = createStateStore(config.runtime);
  await store.init();
  await store.upsertFollower("mashbeanmatters", {
    remoteActorId: THREADS_ACTOR_ID,
    status: "accepted",
    inbox: "https://threads.net/ap/users/17841401579146452/inbox",
    sharedInbox: "https://threads.net/ap/inbox/",
    followedAt: "2026-06-02T00:00:00.000Z",
  });
  store.close?.();

  return {
    configPath,
    sqliteFile,
    runtimeConfig: config.runtime,
  };
}

test("threads note visibility probe defaults to dry-run without publishing", async () => {
  const harness = await createProbeHarness();
  const { stdout } = await execFile(
    nodeBin,
    [
      "scripts/run-threads-note-visibility-probe.mjs",
      "--config",
      harness.configPath,
      "--now",
      "2026-06-02T00:00:00.000Z",
    ],
    {
      cwd: path.resolve(process.cwd()),
    },
  );

  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.probe, "threads-note-visibility");
  assert.equal(payload.target.selectedInbox, "https://threads.net/ap/inbox/");
  assert.equal(payload.activity.type, "Create");
  assert.equal(payload.activity.object.type, "Note");
  assert.match(payload.activity.object.content, /Threads visibility test/);

  const store = createStateStore(harness.runtimeConfig);
  await store.init();
  try {
    assert.equal(store.getOutboundItem(payload.queueItem.id), null);
  } finally {
    store.close?.();
  }
});

test("threads note visibility probe rejects send without public-create confirmation", async () => {
  await assert.rejects(
    execFile(nodeBin, ["scripts/run-threads-note-visibility-probe.mjs", "--send"], {
      cwd: path.resolve(process.cwd()),
    }),
    /--send requires --confirm-public-create/,
  );
});
