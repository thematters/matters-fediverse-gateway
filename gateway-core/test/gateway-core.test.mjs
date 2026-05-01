import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import { promisify } from "node:util";
import { createGatewayApp } from "../src/app.mjs";
import { normalizeArticleObject } from "../src/lib/article-normalization.mjs";
import { normalizeContentDeliveryReviewSnapshot } from "../src/lib/content-delivery-ops.mjs";
import { signHttpRequest } from "../src/security/http-signatures.mjs";
import { FileStateStore } from "../src/store/file-state-store.mjs";
import { SqliteStateStore } from "../src/store/sqlite-state-store.mjs";

const execFile = promisify(execFileCallback);

function pemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

async function createHarness() {
  const localKeys = pemPair();
  const remoteKeys = pemPair();
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-core-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  const config = {
    instance: {
      domain: "matters.example",
      baseUrl: "https://matters.example",
      title: "Matters Example",
      summary: "Test instance",
      softwareName: "matters-gateway-core",
      softwareVersion: "0.1.0",
      openRegistrations: false,
    },
    actors: {
      alice: {
        handle: "alice",
        displayName: "Alice",
        summary: "Test actor",
        autoAcceptFollows: true,
        aliases: ["https://matters.town/@alice"],
        profileUrl: "https://matters.example/@alice",
        actorUrl: "https://matters.example/users/alice",
        inboxUrl: "https://matters.example/users/alice/inbox",
        outboxUrl: "https://matters.example/users/alice/outbox",
        followersUrl: "https://matters.example/users/alice/followers",
        followingUrl: "https://matters.example/users/alice/following",
        publicKeyPem: localKeys.publicKeyPem,
        privateKeyPem: localKeys.privateKeyPem,
        keyId: "https://matters.example/users/alice#main-key",
      },
      bob: {
        handle: "bob",
        displayName: "Bob",
        summary: "Manual approvals",
        autoAcceptFollows: false,
        aliases: [],
        profileUrl: "https://matters.example/@bob",
        actorUrl: "https://matters.example/users/bob",
        inboxUrl: "https://matters.example/users/bob/inbox",
        outboxUrl: "https://matters.example/users/bob/outbox",
        followersUrl: "https://matters.example/users/bob/followers",
        followingUrl: "https://matters.example/users/bob/following",
        publicKeyPem: localKeys.publicKeyPem,
        privateKeyPem: localKeys.privateKeyPem,
        keyId: "https://matters.example/users/bob#main-key",
      },
    },
    remoteActors: {
      "https://remote.example/users/zoe": {
        keyId: "https://remote.example/users/zoe#main-key",
        inbox: "https://remote.example/users/zoe/inbox",
        sharedInbox: "https://remote.example/inbox",
        publicKeyPem: remoteKeys.publicKeyPem,
      },
      "https://reply.example/users/mika": {
        keyId: "https://reply.example/users/mika#main-key",
        inbox: "https://reply.example/users/mika/inbox",
        sharedInbox: "https://reply.example/inbox",
        publicKeyPem: remoteKeys.publicKeyPem,
      },
    },
    remoteDiscovery: {
      cacheTtlMs: 60 * 60 * 1000,
    },
    delivery: {
      maxAttempts: 2,
      userAgent: "MattersGatewayCore/Test",
    },
  };

  const store = new FileStateStore({
    stateFile: path.join(tmpDir, "state.json"),
  });
  await store.init();

  const deliveries = [];
  const deliveryClient = {
    async deliver({ item }) {
      deliveries.push(item);
      return { status: 202 };
    },
  };

  return {
    config,
    store,
    deliveries,
    remoteKeys,
    app: createGatewayApp({ config, store, deliveryClient }),
  };
}

async function createSqliteStoreHarness() {
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-sqlite-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const sqliteFile = path.join(tmpDir, "state.sqlite");
  const store = new SqliteStateStore({ sqliteFile });
  await store.init();
  return { store, sqliteFile };
}

async function createWebhookCaptureServer({ statusCode = 202, responseBody = { status: "accepted" } } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }

    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    });

    response.writeHead(statusCode, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(responseBody));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}/runtime-alerts`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function signedRequest({ method, url, body, keyId, privateKeyPem }) {
  const signatureHeaders = signHttpRequest({
    method,
    url,
    body,
    keyId,
    privateKeyPem,
  });

  return new Request(url, {
    method,
    headers: {
      "content-type": "application/activity+json",
      ...signatureHeaders,
    },
    body,
  });
}

async function seedContentDeliveryReviewFixture(store, actorHandle = "alice") {
  store.ensureActor(actorHandle);
  await store.replaceLocalContents(actorHandle, [
    {
      actorHandle,
      contentId: "https://remote.example/notes/review-queue-1",
      threadId: "https://remote.example/notes/review-queue-1",
      threadRootId: "https://remote.example/notes/review-queue-1",
      rootObjectId: "https://remote.example/notes/review-queue-1",
      rootObjectType: "Note",
      rootMapping: "create",
      visibility: "public",
      status: "resolved",
      url: "https://remote.example/notes/review-queue-1",
      headline: "review queue root",
      preview: "review queue root",
      latestObjectId: "https://remote.example/notes/review-queue-1",
      latestPublishedAt: "2026-03-21T00:00:00.000Z",
      participantActorIds: ["https://remote.example/users/zoe"],
      localParticipantHandles: [actorHandle],
      mentionActorIds: [],
      metrics: {
        objects: 1,
        replies: 0,
        engagements: 0,
        likes: 0,
        announces: 0,
      },
      actionMatrix: {
        inbound: {
          create: 1,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: 1,
          localParticipants: 1,
          mentions: 0,
          unresolvedObjects: 0,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved: true,
        },
      },
      relations: {
        inReplyTo: null,
        replyObjectIds: [],
        engagementIds: [],
        identityObjectIds: ["https://remote.example/notes/review-queue-1"],
      },
      updatedAt: "2026-03-21T00:00:00.000Z",
    },
  ]);

  const activity = {
    id: "https://matters.example/activities/create-review-queue-1",
    type: "Create",
    actor: "https://matters.example/users/alice",
    object: {
      id: "https://remote.example/notes/review-queue-1",
      type: "Note",
      inReplyTo: null,
    },
  };

  await store.enqueueOutbound({
    id: "https://matters.example/activities/create-review-queue-1::0-remote",
    status: "delivered",
    attempts: 0,
    actorHandle,
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity,
    createdAt: "2026-03-21T00:01:00.000Z",
    deliveredAt: "2026-03-21T00:02:00.000Z",
  });
  await store.enqueueOutbound({
    id: "https://matters.example/activities/create-review-queue-1::1-remote",
    status: "dead-letter",
    attempts: 1,
    actorHandle,
    targetActorId: "https://remote.example/users/mika",
    targetInbox: "https://reply.example/inbox",
    activity,
    createdAt: "2026-03-21T00:01:30.000Z",
    deadLetteredAt: "2026-03-21T00:03:00.000Z",
    lastError: "delivery failed",
  });
  await store.reconcileStorage();
}

test("webfinger resolves a single canonical actor", async () => {
  const { app } = await createHarness();
  const response = await app.handle(
    new Request("https://matters.example/.well-known/webfinger?resource=acct:alice@matters.example"),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.subject, "acct:alice@matters.example");
  assert.equal(payload.links[0].href, "https://matters.example/users/alice");
});

test("content delivery review snapshot normalizer backfills canonical contract fields", () => {
  const snapshot = normalizeContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    appliedFilters: {
      actorHandle: "alice",
      status: "partial",
      replayedOnly: false,
      replayableOnly: false,
      limit: 20,
    },
    summary: {
      actors: 1,
      contents: 2,
      activities: { total: 2, delivered: 0, pending: 0, retryPending: 0, deadLetter: 0, partial: 2 },
      uniqueActivities: { total: 1, delivered: 0, pending: 0, retryPending: 0, deadLetter: 0, partial: 1 },
      replayableItems: 1,
      contentsWithIssues: 2,
      recipients: { total: 2, delivered: 0, pending: 0, retryPending: 0, deadLetter: 1 },
    },
    filteredSummary: {
      actors: 1,
      contents: 2,
      activities: { total: 2, delivered: 0, pending: 0, retryPending: 0, deadLetter: 0, partial: 2 },
      uniqueActivities: { total: 1, delivered: 0, pending: 0, retryPending: 0, deadLetter: 0, partial: 1 },
      replayableItems: 1,
      contentsWithIssues: 2,
      recipients: { total: 2, delivered: 0, pending: 0, retryPending: 0, deadLetter: 1 },
    },
    items: [],
    recentReplays: [],
  });

  assert.equal(snapshot.contractVersion, 1);
  assert.equal(snapshot.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.currentSummaryMode, "filtered");
  assert.deepEqual(snapshot.legacySummaryKeys, ["summary", "fullSummary", "filteredSummary", "viewSummary"]);
  assert.equal(snapshot.contract.version, 1);
  assert.equal(snapshot.contract.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.contract.currentSummaryMode, "filtered");
  assert.equal(snapshot.contract.legacyFields.summary.replacement, "summaries.full");
  assert.equal(snapshot.contract.legacyFields.viewSummary.replacement, "summaries.current");
  assert.equal(snapshot.viewSummary.contents, snapshot.filteredSummary.contents);
  assert.equal(snapshot.summaries.current.contents, snapshot.filteredSummary.contents);
});

test("file state store exposes content delivery review snapshot", async () => {
  const { store } = await createHarness();
  await seedContentDeliveryReviewFixture(store);

  const snapshot = store.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    status: "partial",
  });

  assert.equal(snapshot.actorHandle, "alice");
  assert.equal(snapshot.summary.contents, 1);
  assert.equal(snapshot.summary.activities.total, 1);
  assert.equal(snapshot.summary.activities.partial, 1);
  assert.equal(snapshot.summary.uniqueActivities.total, 1);
  assert.equal(snapshot.summary.uniqueActivities.partial, 1);
  assert.equal(snapshot.summary.replayableItems, 1);
  assert.equal(snapshot.filteredSummary.contents, 1);
  assert.equal(snapshot.filteredSummary.activities.partial, 1);
  assert.equal(snapshot.filteredSummary.replayableItems, 1);
  assert.equal(snapshot.contractVersion, 1);
  assert.equal(snapshot.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.currentSummaryMode, "filtered");
  assert.deepEqual(snapshot.legacySummaryKeys, ["summary", "fullSummary", "filteredSummary", "viewSummary"]);
  assert.equal(snapshot.contract.version, 1);
  assert.equal(snapshot.contract.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.contract.currentSummaryMode, "filtered");
  assert.equal(snapshot.contract.legacyFields.summary.replacement, "summaries.full");
  assert.equal(snapshot.contract.legacyFields.viewSummary.replacement, "summaries.current");
  assert.equal(snapshot.summaryAliases.summary, "summaries.full");
  assert.equal(snapshot.summaryAliases.viewSummary, "summaries.current");
  assert.equal(snapshot.summaries.current.contents, snapshot.filteredSummary.contents);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].contentId, "https://remote.example/notes/review-queue-1");
  assert.equal(snapshot.items[0].delivery.total, 1);
  assert.equal(snapshot.items[0].delivery.partial, 1);
  assert.equal(snapshot.items[0].delivery.recipients.total, 2);
  assert.equal(snapshot.items[0].activities[0].delivery.replayableQueueItemIds.length, 1);
  assert.equal(snapshot.items[0].ops.replayableItems, 1);
  assert.equal(snapshot.items[0].ops.replayCount, 0);
  assert.equal(snapshot.items[0].ops.lastReplayAt, null);
  assert.equal(snapshot.items[0].ops.staleSince, "2026-03-21T00:01:00.000Z");
  assert.equal(store.getContentDeliveryProjection("alice").review.summary.contents, 1);
  assert.equal(store.getContentDeliveryProjection("alice").contents.length, 1);
  assert.equal(
    store.getContentDeliveryProjection("alice").contents[0].activities[0].activityId,
    "https://matters.example/activities/create-review-queue-1",
  );
  assert.equal(store.getSnapshot().contentDeliveryProjections.alice.review.summary.contents, 1);

  const filteredSnapshot = store.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    status: "delivered",
  });
  assert.equal(filteredSnapshot.items.length, 0);

  const replayableSnapshot = store.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    replayableOnly: true,
  });
  assert.equal(replayableSnapshot.items.length, 1);
  assert.equal(replayableSnapshot.items[0].ops.replayableItems, 1);

  const replayRecord = {
    replayedAt: "2026-03-21T00:04:00.000Z",
    replayedBy: "tester",
    reason: "content delivery ops read model",
  };
  await store.replayDeadLetter("https://matters.example/activities/create-review-queue-1::1-remote", replayRecord);
  await store.recordAuditEvent({
    timestamp: replayRecord.replayedAt,
    event: "dead-letter.replayed",
    actorHandle: "alice",
    itemId: "https://matters.example/activities/create-review-queue-1::1-remote",
    replayedBy: replayRecord.replayedBy,
    reason: replayRecord.reason,
    surface: "admin-review-queue",
  });

  const replayedProjection = store.getContentDeliveryProjection("alice");
  assert.equal(replayedProjection.review.recentReplays.length, 1);
});

test("file state store recovers stale processing outbound delivery back to pending", async () => {
  const { store } = await createHarness();
  await store.enqueueOutbound({
    id: "queue-file-processing-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/file-processing-1",
      type: "Create",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  await store.claimOutboundDelivery("queue-file-processing-1", {
    leaseId: "lease-file-1",
    leasedAt: "2026-03-21T00:01:00.000Z",
  });
  assert.equal(store.getOutboundItem("queue-file-processing-1").status, "processing");
  assert.equal(store.getQueueSnapshot().summary.processing, 1);

  const recovered = await store.recoverStaleOutboundDeliveries({
    now: "2026-03-21T00:20:00.000Z",
    maxLeaseAgeMs: 5 * 60 * 1000,
  });

  assert.equal(recovered.length, 1);
  assert.equal(store.getOutboundItem("queue-file-processing-1").status, "pending");
  assert.equal(store.getOutboundItem("queue-file-processing-1").deliveryLease, undefined);
  assert.equal(store.getOutboundItem("queue-file-processing-1").recoveredDeliveryCount, 1);
  assert.equal(store.getQueueSnapshot().summary.processing, 0);
});

test("sqlite state store persists follower and outbound state across reopen", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  store.ensureActor("alice");
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });
  await store.enqueueOutbound({
    id: "https://matters.example/activities/update-1::0-remote",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-1",
      type: "Update",
      object: {
        id: "https://remote.example/notes/thread-1",
        type: "Note",
      },
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:00:00.000Z",
    direction: "outbound",
    event: "update.fanned-out",
  });
  await store.upsertMentionResolution("@mia@elsewhere.example", {
    account: "@mia@elsewhere.example",
    actorHandle: "alice",
    surface: "outbox-create",
    objectId: "https://matters.example/notes/post-1",
    status: "retryable_error",
    actorId: null,
    source: "webfinger",
    attempts: 1,
    successCount: 0,
    failureCount: 1,
    lastAttemptAt: "2026-03-21T00:00:00.000Z",
    lastStatusChangedAt: "2026-03-21T00:00:00.000Z",
    lastSuccessAt: null,
    lastFailureAt: "2026-03-21T00:00:00.000Z",
    nextRetryAt: "2026-03-21T00:05:00.000Z",
    failure: {
      code: "webfinger_http_error",
      stage: "webfinger",
      statusCode: 503,
      retryable: true,
    },
  });
  await store.recordEvidence({
    id: "evidence-1",
    status: "retained",
    category: "delivery-dead-letter",
    actorHandle: "alice",
    queueItemId: "https://matters.example/activities/update-1::0-remote",
    retainedAt: "2026-03-21T00:00:00.000Z",
    retentionUntil: "2027-03-21T00:00:00.000Z",
    snapshot: {
      note: "sqlite persistence check",
    },
  });
  await store.replaceLocalConversations("alice", [
    {
      threadId: "https://remote.example/notes/thread-1",
      threadRootId: "https://remote.example/notes/thread-1",
      objectIds: ["https://remote.example/notes/thread-1"],
      engagementIds: [],
      objectCount: 1,
      replyCount: 0,
      engagementCount: 0,
      engagementCounts: {
        like: 0,
        announce: 0,
      },
      unresolvedObjectIds: [],
      participantActorIds: ["https://remote.example/users/zoe"],
      localParticipantHandles: ["alice"],
      mentionActorIds: [],
      actionMatrix: {
        inbound: {
          create: 1,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: 1,
          localParticipants: 1,
          mentions: 0,
          unresolvedObjects: 0,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved: true,
        },
      },
      latestObjectId: "https://remote.example/notes/thread-1",
      latestPublishedAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
    },
  ]);
  await store.replaceLocalContents("alice", [
    {
      contentId: "https://remote.example/notes/thread-1",
      threadId: "https://remote.example/notes/thread-1",
      threadRootId: "https://remote.example/notes/thread-1",
      rootObjectId: "https://remote.example/notes/thread-1",
      rootObjectType: "Note",
      rootMapping: "create",
      visibility: "public",
      status: "resolved",
      url: "https://remote.example/notes/thread-1",
      headline: "sqlite snapshot",
      preview: "sqlite snapshot",
      latestObjectId: "https://remote.example/notes/thread-1",
      latestPublishedAt: "2026-03-21T00:00:00.000Z",
      participantActorIds: ["https://remote.example/users/zoe"],
      localParticipantHandles: ["alice"],
      mentionActorIds: [],
      metrics: {
        objects: 1,
        replies: 0,
        engagements: 0,
        likes: 0,
        announces: 0,
      },
      actionMatrix: {
        inbound: {
          create: 1,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: 1,
          localParticipants: 1,
          mentions: 0,
          unresolvedObjects: 0,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved: true,
        },
      },
      relations: {
        inReplyTo: null,
        replyObjectIds: [],
        engagementIds: [],
      },
      updatedAt: "2026-03-21T00:00:00.000Z",
    },
  ]);

  const reopened = new SqliteStateStore({ sqliteFile });
  await reopened.init();
  const snapshot = reopened.getSnapshot();
  assert.equal(snapshot.actors.alice.followers["https://remote.example/users/zoe"].status, "accepted");
  assert.equal(snapshot.outboundQueue[0].activity.type, "Update");
  assert.equal(snapshot.traces[0].event, "update.fanned-out");
  assert.equal(snapshot.mentionResolutions["@mia@elsewhere.example"].status, "retryable_error");
  assert.equal(snapshot.evidenceRecords[0].category, "delivery-dead-letter");
  assert.equal(snapshot.actors.alice.localContents["https://remote.example/notes/thread-1"].headline, "sqlite snapshot");
  assert.equal(snapshot.contentDeliveryProjections.alice.review.summary.contents, 1);
});

test("sqlite state store recovers stale processing outbound delivery across reopen", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await store.enqueueOutbound({
    id: "queue-sqlite-processing-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/sqlite-processing-1",
      type: "Create",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await store.claimOutboundDelivery("queue-sqlite-processing-1", {
    leaseId: "lease-sqlite-1",
    leasedAt: "2026-03-21T00:01:00.000Z",
  });
  assert.equal(store.getOutboundItem("queue-sqlite-processing-1").status, "processing");
  store.close();

  const reopened = new SqliteStateStore({ sqliteFile });
  await reopened.init();
  assert.equal(reopened.getOutboundItem("queue-sqlite-processing-1").status, "processing");
  const recovered = await reopened.recoverStaleOutboundDeliveries({
    now: "2026-03-21T00:20:00.000Z",
    maxLeaseAgeMs: 5 * 60 * 1000,
  });

  assert.equal(recovered.length, 1);
  assert.equal(reopened.getOutboundItem("queue-sqlite-processing-1").status, "pending");
  assert.equal(reopened.getOutboundItem("queue-sqlite-processing-1").deliveryLease, undefined);
  assert.equal(reopened.getOutboundItem("queue-sqlite-processing-1").recoveredDeliveryCount, 1);
  assert.equal(reopened.getQueueSnapshot().summary.processing, 0);
  reopened.close();
});

test("sqlite backup preserves queue state and updates runtime metadata", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await store.enqueueOutbound({
    id: "https://matters.example/activities/update-backup-1::0-remote",
    status: "pending",
    attempts: 1,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-backup-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const backupFile = path.join(path.dirname(sqliteFile), "backup.sqlite");
  const backup = await store.createBackup(backupFile);
  assert.equal(backup.driver, "sqlite");
  assert.equal(path.basename(backup.backupFile), "backup.sqlite");
  assert.ok(store.getRuntimeMetadata().lastBackupAt);

  const reopened = new SqliteStateStore({ sqliteFile: backupFile });
  await reopened.init();
  const snapshot = reopened.getSnapshot();
  assert.equal(snapshot.outboundQueue[0].activity.type, "Update");
  reopened.close?.();
  store.close?.();
});

test("sqlite state store exposes content delivery review snapshot", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await seedContentDeliveryReviewFixture(store);

  const reopened = new SqliteStateStore({ sqliteFile });
  await reopened.init();
  const snapshot = reopened.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    status: "partial",
  });

  assert.equal(snapshot.actorHandle, "alice");
  assert.equal(snapshot.summary.contents, 1);
  assert.equal(snapshot.summary.activities.total, 1);
  assert.equal(snapshot.summary.activities.partial, 1);
  assert.equal(snapshot.summary.uniqueActivities.total, 1);
  assert.equal(snapshot.summary.uniqueActivities.partial, 1);
  assert.equal(snapshot.summary.replayableItems, 1);
  assert.equal(snapshot.filteredSummary.contents, 1);
  assert.equal(snapshot.filteredSummary.activities.partial, 1);
  assert.equal(snapshot.filteredSummary.replayableItems, 1);
  assert.equal(snapshot.contractVersion, 1);
  assert.equal(snapshot.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.currentSummaryMode, "filtered");
  assert.deepEqual(snapshot.legacySummaryKeys, ["summary", "fullSummary", "filteredSummary", "viewSummary"]);
  assert.equal(snapshot.contract.version, 1);
  assert.equal(snapshot.contract.canonicalSummaryKey, "summaries.current");
  assert.equal(snapshot.contract.currentSummaryMode, "filtered");
  assert.equal(snapshot.contract.legacyFields.summary.replacement, "summaries.full");
  assert.equal(snapshot.contract.legacyFields.viewSummary.replacement, "summaries.current");
  assert.equal(snapshot.summaryAliases.summary, "summaries.full");
  assert.equal(snapshot.summaryAliases.viewSummary, "summaries.current");
  assert.equal(snapshot.summaries.current.contents, snapshot.filteredSummary.contents);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].contentId, "https://remote.example/notes/review-queue-1");
  assert.equal(snapshot.items[0].delivery.total, 1);
  assert.equal(snapshot.items[0].delivery.partial, 1);
  assert.equal(snapshot.items[0].delivery.recipients.total, 2);
  assert.equal(snapshot.items[0].activities[0].delivery.replayableQueueItemIds.length, 1);
  assert.equal(snapshot.items[0].ops.replayableItems, 1);
  assert.equal(snapshot.items[0].ops.replayCount, 0);
  assert.equal(snapshot.items[0].ops.lastReplayAt, null);
  assert.equal(snapshot.items[0].ops.staleSince, "2026-03-21T00:01:00.000Z");
  assert.equal(reopened.getContentDeliveryProjection("alice").review.summary.contents, 1);
  assert.equal(reopened.getContentDeliveryProjection("alice").contents.length, 1);
  assert.equal(
    reopened.getContentDeliveryProjection("alice").contents[0].activities[0].activityId,
    "https://matters.example/activities/create-review-queue-1",
  );

  const filteredSnapshot = reopened.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    status: "delivered",
  });
  assert.equal(filteredSnapshot.items.length, 0);

  const replayableSnapshot = reopened.getContentDeliveryReviewSnapshot({
    actorHandle: "alice",
    replayableOnly: true,
  });
  assert.equal(replayableSnapshot.items.length, 1);
  assert.equal(replayableSnapshot.items[0].ops.replayableItems, 1);

  const replayRecord = {
    replayedAt: "2026-03-21T00:04:00.000Z",
    replayedBy: "tester",
    reason: "content delivery ops read model",
  };
  await reopened.replayDeadLetter("https://matters.example/activities/create-review-queue-1::1-remote", replayRecord);
  await reopened.recordAuditEvent({
    timestamp: replayRecord.replayedAt,
    event: "dead-letter.replayed",
    actorHandle: "alice",
    itemId: "https://matters.example/activities/create-review-queue-1::1-remote",
    replayedBy: replayRecord.replayedBy,
    reason: replayRecord.reason,
    surface: "admin-review-queue",
  });

  const replayedProjection = reopened.getContentDeliveryProjection("alice");
  assert.equal(replayedProjection.review.recentReplays.length, 1);
});

test("sqlite state store exposes content delivery activity index", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await seedContentDeliveryReviewFixture(store);

  const reopened = new SqliteStateStore({ sqliteFile });
  await reopened.init();
  const index = reopened.getContentDeliveryActivityIndex({
    actorHandle: "alice",
    status: "partial",
    activityId: "https://matters.example/activities/create-review-queue-1",
  });

  assert.equal(index.actorHandle, "alice");
  assert.equal(index.summary.total, 1);
  assert.equal(index.summary.partial, 1);
  assert.equal(index.items.length, 1);
  assert.equal(index.items[0].activityId, "https://matters.example/activities/create-review-queue-1");
  assert.equal(index.items[0].delivery.status, "partial");
  assert.equal(index.items[0].contentRefs.length, 1);
  assert.equal(index.items[0].contentRefs[0].contentId, "https://remote.example/notes/review-queue-1");
});

test("sqlite state store exposes runtime metadata and queue snapshot", async () => {
  const { store } = await createSqliteStoreHarness();
  await store.enqueueOutbound({
    id: "queue-pending-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-queue-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await store.enqueueOutbound({
    id: "queue-delivered-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-queue-2",
      type: "Update",
    },
    createdAt: "2026-03-21T00:01:00.000Z",
  });
  await store.markOutboundDelivered("queue-delivered-1", { lastStatusCode: 202 });
  await store.enqueueOutbound({
    id: "queue-dead-letter-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-queue-3",
      type: "Delete",
    },
    createdAt: "2026-03-21T00:02:00.000Z",
  });
  await store.moveOutboundToDeadLetter("queue-dead-letter-1", new Error("dead letter for observability"));
  await store.recordTrace({
    timestamp: "2026-03-21T00:03:00.000Z",
    direction: "outbound",
    event: "delivery.delivered",
    itemId: "queue-delivered-1",
  });

  const runtime = store.getRuntimeMetadata();
  const queue = store.getQueueSnapshot({ traceLimit: 5 });
  assert.equal(runtime.driver, "sqlite");
  assert.equal(runtime.schemaVersion, 6);
  assert.equal(queue.summary.total, 3);
  assert.equal(queue.summary.pending, 1);
  assert.equal(queue.summary.processing, 0);
  assert.equal(queue.summary.delivered, 1);
  assert.equal(queue.summary.deadLetter, 1);
  assert.equal(queue.deadLetters.open, 1);
  assert.equal(queue.recentDeliveryTraces[0].event, "delivery.delivered");
});

test("sqlite reconcile backfills dead letters and exposes storage alerts", async () => {
  const { store } = await createSqliteStoreHarness();
  const pendingItem = {
    id: "queue-pending-alert-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-alert-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  };
  const deadLetterItem = {
    id: "queue-dead-backfill-1",
    status: "dead-letter",
    attempts: 2,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/update-dead-backfill-1",
      type: "Delete",
    },
    createdAt: "2026-03-21T00:05:00.000Z",
    deadLetteredAt: "2026-03-21T00:10:00.000Z",
    lastError: "reconcile me",
  };

  await store.enqueueOutbound(pendingItem);
  store.db
    .prepare("INSERT OR REPLACE INTO outbound_queue (id, status, item_json) VALUES (?, ?, ?)")
    .run(deadLetterItem.id, deadLetterItem.status, JSON.stringify(deadLetterItem));

  const alertsBefore = store.getStorageAlerts({
    now: "2026-03-21T02:00:00.000Z",
    thresholds: {
      backupStaleMs: 60 * 60 * 1000,
      pendingAgeMs: 30 * 60 * 1000,
      openDeadLetters: 1,
      pendingQueue: 10,
    },
  });
  assert.equal(alertsBefore.items.some((entry) => entry.code === "storage.backup.missing"), true);
  assert.equal(alertsBefore.items.some((entry) => entry.code === "storage.queue.pending-age"), true);

  const report = await store.reconcileStorage({ now: "2026-03-21T02:05:00.000Z" });
  assert.equal(report.summary.backfilledDeadLetters, 1);
  assert.equal(store.getDeadLetter(deadLetterItem.id)?.status, "open");
  assert.equal(store.getRuntimeMetadata().lastReconciledAt, "2026-03-21T02:05:00.000Z");

  const alertsAfter = store.getStorageAlerts({
    now: "2026-03-21T02:06:00.000Z",
    thresholds: {
      backupStaleMs: 60 * 60 * 1000,
      pendingAgeMs: 30 * 60 * 1000,
      openDeadLetters: 1,
      pendingQueue: 10,
    },
  });
  assert.equal(alertsAfter.items.some((entry) => entry.code === "storage.dead-letter.open"), true);
});

test("sqlite metrics snapshot exposes structured counts", async () => {
  const { store } = await createSqliteStoreHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-metrics-1",
  });
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/metrics-1",
    activityId: "https://remote.example/activities/create-metrics-1",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "reply",
    content: "metrics content",
    visibility: "public",
    receivedAt: "2026-03-21T00:10:00.000Z",
  });
  await store.upsertInboundEngagement("alice", {
    activityId: "https://remote.example/activities/like-metrics-1",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Like",
    mapping: "like",
    objectId: "https://matters.example/notes/1",
    receivedAt: "2026-03-21T00:11:00.000Z",
  });
  await store.recordAbuseCase({
    id: "abuse-metrics-1",
    status: "open",
    category: "domain-block",
    actorHandle: "alice",
    createdAt: "2026-03-21T00:12:00.000Z",
  });
  await store.recordAuditEvent({
    timestamp: "2026-03-21T00:13:00.000Z",
    event: "metrics.test",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:14:00.000Z",
    event: "metrics.trace",
  });

  const metrics = store.getMetricsSnapshot({ now: "2026-03-21T00:15:00.000Z" });
  assert.equal(metrics.activity.followers, 1);
  assert.equal(metrics.activity.inboundObjects, 1);
  assert.equal(metrics.activity.inboundEngagements, 1);
  assert.equal(metrics.moderation.abuseCasesOpen, 1);
  assert.equal(metrics.audit.auditEvents, 1);
  assert.equal(metrics.audit.traces, 1);
});

test("blocked remote domain is rejected and recorded in abuse queue", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertDomainBlock({
    domain: "remote.example",
    reason: "spam wave",
    source: "test",
    blockedAt: "2026-03-21T00:00:00.000Z",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-blocked-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.domain, "remote.example");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.abuseQueue.length, 1);
  assert.equal(snapshot.abuseQueue[0].remoteDomain, "remote.example");
  assert.equal(snapshot.auditLog[0].event, "domain-block.inbound-enforced");
  assert.equal(snapshot.evidenceRecords.length, 1);
  assert.equal(snapshot.evidenceRecords[0].category, "domain-block");
  assert.equal(snapshot.evidenceRecords[0].abuseCaseId, snapshot.abuseQueue[0].id);
});

test("remote actor deny policy blocks inbound activity", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertRemoteActorPolicy({
    actorId: "https://remote.example/users/zoe",
    inboundAction: "deny",
    outboundAction: "allow",
    reason: "targeted harassment",
    source: "test",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-deny-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(activity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.remoteActorId, "https://remote.example/users/zoe");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.abuseQueue.at(-1).category, "remote-actor-policy");
  assert.equal(snapshot.evidenceRecords.at(-1).category, "remote-actor-policy");
  assert.equal(snapshot.actors.alice.followers["https://remote.example/users/zoe"], undefined);
});

test("remote actor review policy queues inbound activity for review", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertRemoteActorPolicy({
    actorId: "https://remote.example/users/zoe",
    inboundAction: "review",
    outboundAction: "allow",
    reason: "needs moderation review",
    source: "test",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-review-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(activity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, "queued-review");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.processedActivities["https://remote.example/activities/follow-review-1"].disposition, "queued-review");
  assert.equal(snapshot.abuseQueue.at(-1).category, "remote-actor-policy");
});

test("outbox bridge rewrites static publisher output to canonical actor URLs", async () => {
  const harness = await createHarness();
  const fixturePath = path.resolve(process.cwd(), "test/fixtures/static-outbox.json");
  const outboxApp = createGatewayApp({
    config: {
      ...harness.config,
      actors: {
        ...harness.config.actors,
        alice: {
          ...harness.config.actors.alice,
          staticOutboxFile: fixturePath,
        },
      },
    },
    store: harness.store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });
  const response = await outboxApp.handle(
    new Request("https://matters.example/users/alice/outbox"),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.id, "https://matters.example/users/alice/outbox");
  assert.equal(payload.totalItems, 1);
  assert.equal(payload.orderedItems[0].actor, "https://matters.example/users/alice");
  assert.equal(
    payload.orderedItems[0].object.attributedTo,
    "https://matters.example/users/alice",
  );
  assert.equal(payload.orderedItems[0].object.type, "Article");
  assert.match(payload.orderedItems[0].object.content, /Original Matters link:/);
  assert.equal(
    payload.orderedItems[0].cc[0],
    "https://matters.example/users/alice/followers",
  );
});

test("outbox bridge drops non-public static items and records visibility audit", async () => {
  const harness = await createHarness();
  const fixturePath = path.join(os.tmpdir(), `static-outbox-visibility-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const publicAudience = "https://www.w3.org/ns/activitystreams#Public";
  const createItem = (suffix, objectOverrides = {}, itemOverrides = {}) => ({
    id: `https://example.eth.limo/activities/${suffix}`,
    type: "Create",
    actor: "https://example.eth.limo/about.jsonld",
    to: [publicAudience],
    object: {
      id: `https://example.eth.limo/articles/${suffix}`,
      type: "Note",
      name: `${suffix} headline`,
      content: `${suffix} body`,
      url: `https://example.eth.limo/articles/${suffix}`,
      to: [publicAudience],
      ...objectOverrides,
    },
    ...itemOverrides,
  });
  await writeFile(
    fixturePath,
    JSON.stringify({
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "https://example.eth.limo/outbox.jsonld",
      type: "OrderedCollection",
      orderedItems: [
        createItem("public"),
        createItem("paid", { visibility: "paid", name: "Paid headline should not leak", content: "Paid premium body should not leak" }),
        createItem("encrypted", { encrypted: true, content: "Encrypted body should not leak" }),
        createItem("private", { visibility: "private", content: "Private body should not leak" }),
        createItem("draft", { status: "draft", content: "Draft body should not leak" }),
        createItem("message", { type: "ChatMessage", content: "Message body should not leak" }),
        createItem("mixed-thread", { threadVisibility: "private", content: "Mixed thread body should not leak" }),
      ],
    }),
  );
  const outboxApp = createGatewayApp({
    config: {
      ...harness.config,
      actors: {
        ...harness.config.actors,
        alice: {
          ...harness.config.actors.alice,
          staticOutboxFile: fixturePath,
        },
      },
    },
    store: harness.store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
    clock: () => new Date("2026-05-01T12:00:00.000Z"),
  });

  const response = await outboxApp.handle(
    new Request("https://matters.example/users/alice/outbox"),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.totalItems, 1);
  assert.equal(payload.orderedItems[0].object.id, "https://example.eth.limo/articles/public");
  assert.equal(payload.orderedItems[0].object.attributedTo, "https://matters.example/users/alice");
  assert.doesNotMatch(JSON.stringify(payload), /Paid premium body|Encrypted body|Private body|Draft body|Message body|Mixed thread body/);

  const auditResponse = await outboxApp.handle(
    new Request("https://matters.example/admin/visibility-audit?actorHandle=alice&limit=20"),
  );
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.items.length, 7);
  assert.equal(auditPayload.items.filter((entry) => entry.decision === "included").length, 1);
  assert.equal(auditPayload.items.filter((entry) => entry.decision === "excluded").length, 6);
  assert.deepEqual(
    auditPayload.items.filter((entry) => entry.decision === "excluded").map((entry) => entry.reason).sort(),
    [
      "encrypted-content",
      "message-like-content",
      "status-not-public",
      "thread-not-public",
      "visibility-not-public",
      "visibility-not-public",
    ],
  );
  assert.doesNotMatch(JSON.stringify(auditPayload), /Paid headline should not leak|Paid premium body|Encrypted body|Private body|Draft body|Message body|Mixed thread body/);
});

test("article normalization keeps safe longform HTML and moves IPFS images to attachments", () => {
  const article = normalizeArticleObject({
    actor: { actorUrl: "https://matters.example/users/alice" },
    object: {
      id: "https://matters.example/articles/ipfs-image",
      type: "Article",
      name: "IPFS image article",
      summary: "A safe summary",
      url: "https://matters.town/@alice/ipfs-image",
      content: [
        "<h2>Heading</h2>",
        "<p>Hello <strong>fediverse</strong> <a href=\"https://example.com\" target=\"_blank\">link</a></p>",
        "<iframe src=\"https://video.example/embed\"></iframe>",
        "<img src=\"ipfs://bafycover/cover.png\" alt=\"Cover image\">",
      ].join(""),
    },
  });

  assert.equal(article.type, "Article");
  assert.match(article.content, /<h2>Heading<\/h2>/);
  assert.match(article.content, /<strong>fediverse<\/strong>/);
  assert.match(article.content, /rel="noopener noreferrer ugc"/);
  assert.doesNotMatch(article.content, /iframe|<img/i);
  assert.match(article.content, /Original Matters link:/);
  assert.equal(article.attachment[0].type, "Document");
  assert.equal(article.attachment[0].url, "https://ipfs.io/ipfs/bafycover/cover.png");
  assert.equal(article.attachment[0]["ipfs:hash"], "bafycover");
});

test("article normalization maps existing external image attachments to Document", () => {
  const article = normalizeArticleObject({
    object: {
      id: "https://matters.example/articles/external-image",
      type: "Article",
      url: "https://matters.town/@alice/external-image",
      content: "<p>External image</p>",
      attachment: {
        type: "Image",
        mediaType: "image/webp",
        url: "https://cdn.example/image.webp",
        name: "External cover",
      },
    },
  });

  assert.equal(article.attachment.length, 1);
  assert.equal(article.attachment[0].type, "Document");
  assert.equal(article.attachment[0].mediaType, "image/webp");
  assert.equal(article.attachment[0].url, "https://cdn.example/image.webp");
});

test("article normalization truncates long summaries deterministically", () => {
  const article = normalizeArticleObject({
    object: {
      id: "https://matters.example/articles/long-summary",
      type: "Article",
      url: "https://matters.town/@alice/long-summary",
      summary: "a".repeat(400),
      content: "<p>Body</p>",
    },
  });

  assert.equal(article.summary.length, 280);
  assert.match(article.summary, /\.\.\.$/);
});

test("article normalization derives an empty summary from content text", () => {
  const article = normalizeArticleObject({
    object: {
      id: "https://matters.example/articles/empty-summary",
      type: "Article",
      url: "https://matters.town/@alice/empty-summary",
      summary: "",
      content: "<p>Derived <em>summary</em> text</p>",
    },
  });

  assert.equal(article.summary, "Derived summary text");
});

test("article normalization preserves code language class and strips unsafe attributes", () => {
  const article = normalizeArticleObject({
    object: {
      id: "https://matters.example/articles/code-block",
      type: "Article",
      url: "https://matters.town/@alice/code-block",
      content: "<pre><code class=\"language-js extra\" onclick=\"bad()\">const ok = true;</code></pre>",
    },
  });

  assert.match(article.content, /<pre><code class="language-js">const ok = true;<\/code><\/pre>/);
  assert.doesNotMatch(article.content, /onclick|extra/);
});

test("article normalization preserves cross-language summary text", () => {
  const article = normalizeArticleObject({
    object: {
      id: "https://matters.example/articles/multilingual",
      type: "Article",
      name: "Multilingual",
      url: "https://matters.town/@alice/multilingual",
      content: "<p>中文段落 English paragraph 日本語の段落</p>",
    },
  });

  assert.equal(article.summary, "中文段落 English paragraph 日本語の段落");
  assert.equal(article.name, "Multilingual");
});

test("admin domain block and abuse endpoints expose moderation state", async () => {
  const { app, store } = await createHarness();
  await store.recordAbuseCase({
    id: "abuse-1",
    status: "open",
    category: "domain-block",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    remoteDomain: "remote.example",
    activityId: "https://remote.example/activities/follow-1",
    activityType: "Follow",
    reason: "spam wave",
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const createBlockResponse = await app.handle(
    new Request("https://matters.example/admin/domain-blocks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        domain: "bad.example",
        reason: "malware",
        createdBy: "tester",
      }),
    }),
  );
  assert.equal(createBlockResponse.status, 201);

  const listBlocksResponse = await app.handle(new Request("https://matters.example/admin/domain-blocks"));
  const blocksPayload = await listBlocksResponse.json();
  assert.equal(blocksPayload.items[0].domain, "bad.example");

  const resolveResponse = await app.handle(
    new Request("https://matters.example/admin/abuse-queue/resolve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "abuse-1",
        resolution: "triaged",
        resolvedBy: "tester",
      }),
    }),
  );
  assert.equal(resolveResponse.status, 200);

  const abuseResponse = await app.handle(new Request("https://matters.example/admin/abuse-queue?status=resolved"));
  const abusePayload = await abuseResponse.json();
  assert.equal(abusePayload.items.length, 1);
  assert.equal(abusePayload.items[0].resolution.resolution, "triaged");

  const auditResponse = await app.handle(new Request("https://matters.example/admin/audit-log?limit=10"));
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.items.at(-1).event, "abuse-case.resolved");
});

test("admin remote actor policy endpoints expose moderation state", async () => {
  const { app } = await createHarness();

  const createResponse = await app.handle(
    new Request("https://matters.example/admin/remote-actor-policies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorId: "https://remote.example/users/zoe",
        inboundAction: "review",
        outboundAction: "deny",
        reason: "escalated moderation",
        createdBy: "tester",
      }),
    }),
  );
  assert.equal(createResponse.status, 201);

  const listResponse = await app.handle(new Request("https://matters.example/admin/remote-actor-policies"));
  const listPayload = await listResponse.json();
  assert.equal(listPayload.items.length, 1);
  assert.equal(listPayload.items[0].actorId, "https://remote.example/users/zoe");
  assert.equal(listPayload.items[0].outboundAction, "deny");
});

test("admin runtime storage, queue observability, and backup endpoints expose persistence state", async () => {
  const { app, remoteKeys } = await createHarness();
  const followActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-observability-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(followActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const runtimeResponse = await app.handle(new Request("https://matters.example/admin/runtime/storage"));
  const runtimePayload = await runtimeResponse.json();
  assert.equal(runtimePayload.runtime.driver, "file");

  const queueResponse = await app.handle(new Request("https://matters.example/admin/queues/outbound?traceLimit=5"));
  const queuePayload = await queueResponse.json();
  assert.equal(queuePayload.queue.summary.total, 1);
  assert.equal(queuePayload.queue.summary.delivered, 1);
  assert.ok(queuePayload.queue.recentDeliveryTraces.length >= 1);

  const tmpDir = path.join(os.tmpdir(), `matters-gateway-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const backupResponse = await app.handle(
    new Request("https://matters.example/admin/runtime/storage/backup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        outputFile: path.join(tmpDir, "state-backup.json"),
        requestedBy: "tester",
      }),
    }),
  );
  assert.equal(backupResponse.status, 201);
  const backupPayload = await backupResponse.json();
  assert.equal(backupPayload.backup.driver, "file");
  assert.equal(path.basename(backupPayload.backup.backupFile), "state-backup.json");
});

test("admin queue endpoint exposes outbound summary and delivery traces", async () => {
  const { app, store } = await createHarness();
  await store.enqueueOutbound({
    id: "queue-admin-pending",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-queue-pending",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await store.enqueueOutbound({
    id: "queue-admin-dead",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-queue-dead",
      type: "Delete",
    },
    createdAt: "2026-03-21T00:01:00.000Z",
  });
  await store.moveOutboundToDeadLetter("queue-admin-dead", new Error("admin queue failure"));
  await store.recordTrace({
    timestamp: "2026-03-21T00:02:00.000Z",
    direction: "outbound",
    event: "delivery.dead-letter",
    itemId: "queue-admin-dead",
  });

  const response = await app.handle(new Request("https://matters.example/admin/queues/outbound?traceLimit=5"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.queue.summary.pending, 1);
  assert.equal(payload.queue.summary.deadLetter, 1);
  assert.equal(payload.queue.deadLetters.open, 1);
  assert.equal(payload.queue.recentDeliveryTraces.at(-1).event, "delivery.dead-letter");
});

test("delivery job recovers stale processing items before dispatch", async () => {
  const harness = await createHarness();
  const deliveries = [];
  const app = createGatewayApp({
    config: {
      ...harness.config,
      delivery: {
        ...harness.config.delivery,
        processingLeaseTimeoutMs: 5 * 60 * 1000,
      },
    },
    store: harness.store,
    clock: () => new Date("2026-03-21T00:20:00.000Z"),
    deliveryClient: {
      async deliver({ item }) {
        deliveries.push(item.id);
        return { status: 202 };
      },
    },
  });

  await harness.store.enqueueOutbound({
    id: "queue-recover-before-job-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/recover-before-job-1",
      type: "Create",
      object: {
        id: "https://matters.example/notes/recover-before-job-1",
        type: "Note",
      },
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await harness.store.claimOutboundDelivery("queue-recover-before-job-1", {
    leaseId: "stale-lease-1",
    leasedAt: "2026-03-21T00:01:00.000Z",
  });

  const response = await app.handle(
    new Request("https://matters.example/jobs/delivery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.processed, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0], "queue-recover-before-job-1");
  assert.equal(harness.store.getOutboundItem("queue-recover-before-job-1").status, "delivered");
  const recoveryTrace = harness.store.getTraces({ limit: 10 }).find((entry) => entry.event === "delivery.recovered");
  assert.equal(recoveryTrace.itemId, "queue-recover-before-job-1");
  const recoveryAudit = harness.store.getAuditLog(10).find((entry) => entry.event === "delivery.recovered");
  assert.equal(recoveryAudit.itemId, "queue-recover-before-job-1");
});

test("admin runtime storage endpoint exposes sqlite metadata", async () => {
  const harness = await createHarness();
  const { store } = await createSqliteStoreHarness();
  const config = {
    ...harness.config,
    runtime: {
      alerting: {
        backupMaxAgeHours: 1,
        pendingQueueMaxAgeMinutes: 10,
        openDeadLetterThreshold: 1,
        openAbuseCaseThreshold: 0,
        pendingQueueThreshold: 10,
      },
    },
  };
  await store.enqueueOutbound({
    id: "sqlite-runtime-admin-pending",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/sqlite-runtime-admin-pending",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  store.db
    .prepare("INSERT OR REPLACE INTO outbound_queue (id, status, item_json) VALUES (?, ?, ?)")
    .run(
      "sqlite-runtime-admin-dead",
      "dead-letter",
      JSON.stringify({
        id: "sqlite-runtime-admin-dead",
        status: "dead-letter",
        attempts: 1,
        actorHandle: "alice",
        targetActorId: "https://remote.example/users/zoe",
        targetInbox: "https://remote.example/inbox",
        activity: {
          id: "https://matters.example/activities/sqlite-runtime-admin-dead",
          type: "Delete",
        },
        createdAt: "2026-03-21T00:05:00.000Z",
        deadLetteredAt: "2026-03-21T00:06:00.000Z",
      }),
    );
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });

  const response = await app.handle(new Request("https://matters.example/admin/runtime/storage"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.runtime.driver, "sqlite");
  assert.equal(payload.runtime.schemaVersion, 6);
  assert.equal(payload.runtime.journalMode, "wal");
  assert.equal(payload.alerts.items.some((entry) => entry.code === "storage.backup.missing"), true);

  const reconcileResponse = await app.handle(
    new Request("https://matters.example/admin/runtime/storage/reconcile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestedBy: "tester",
      }),
    }),
  );
  assert.equal(reconcileResponse.status, 200);
  const reconcilePayload = await reconcileResponse.json();
  assert.equal(reconcilePayload.report.summary.backfilledDeadLetters, 1);

  const refreshed = await app.handle(new Request("https://matters.example/admin/runtime/storage"));
  const refreshedPayload = await refreshed.json();
  assert.ok(refreshedPayload.runtime.lastReconciledAt);
  assert.equal(refreshedPayload.alerts.items.some((entry) => entry.code === "storage.dead-letter.open"), true);
});

test("admin runtime metrics endpoint exposes queue and moderation metrics", async () => {
  const harness = await createHarness();
  const { store } = await createSqliteStoreHarness();
  const app = createGatewayApp({
    config: {
      ...harness.config,
      runtime: {
        alerting: {
          backupMaxAgeHours: 24,
          pendingQueueMaxAgeMinutes: 30,
          openDeadLetterThreshold: 1,
          openAbuseCaseThreshold: 0,
          pendingQueueThreshold: 10,
        },
      },
    },
    store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });

  await store.recordAbuseCase({
    id: "abuse-admin-metrics-1",
    status: "open",
    category: "domain-block",
    actorHandle: "alice",
    createdAt: "2026-03-21T00:20:00.000Z",
  });
  await store.enqueueOutbound({
    id: "queue-admin-metrics-1",
    status: "pending",
    attempts: 1,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-metrics-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:21:00.000Z",
  });

  const response = await app.handle(new Request("https://matters.example/admin/runtime/metrics"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.metrics.storage.driver, "sqlite");
  assert.equal(payload.metrics.delivery.queueSummary.pending, 1);
  assert.equal(payload.metrics.moderation.abuseCasesOpen, 1);
});

test("admin runtime metrics dispatch writes file and posts webhook bundle", async () => {
  const harness = await createHarness();
  const { store } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  const app = createGatewayApp({
    config: {
      ...harness.config,
      runtime: {
        alerting: {
          backupMaxAgeHours: 24,
          pendingQueueMaxAgeMinutes: 30,
          openDeadLetterThreshold: 1,
          openAbuseCaseThreshold: 0,
          pendingQueueThreshold: 10,
        },
        metrics: {
          dispatch: {
            webhookUrl: webhookServer.url,
          },
        },
      },
    },
    store,
    clock: () => new Date("2026-03-21T02:00:00.000Z"),
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });

  await store.enqueueOutbound({
    id: "queue-admin-metrics-dispatch-1",
    status: "pending",
    attempts: 1,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-metrics-dispatch-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:21:00.000Z",
  });

  const tmpDir = path.join(os.tmpdir(), `matters-gateway-runtime-metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const outputFile = path.join(tmpDir, "runtime-metrics.json");

  try {
    const dispatchResponse = await app.handle(
      new Request("https://matters.example/admin/runtime/metrics/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          outputFile,
          webhookBearerToken: "metrics-secret",
          webhookHeaders: {
            "x-metrics-source": "gateway-test",
          },
          requestedBy: "tester",
        }),
      }),
    );
    assert.equal(dispatchResponse.status, 201);
    const dispatchPayload = await dispatchResponse.json();
    assert.equal(dispatchPayload.status, "dispatched");
    assert.deepEqual(dispatchPayload.sinkTypes, ["file", "webhook"]);
    assert.equal(dispatchPayload.bundle.metrics.storage.driver, "sqlite");

    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(writtenPayload.metrics.storage.driver, "sqlite");
    assert.equal(writtenPayload.metrics.delivery.queueSummary.pending, 1);
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer metrics-secret");
    assert.equal(webhookServer.requests[0].headers["x-metrics-source"], "gateway-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookPayload.metrics.delivery.queueSummary.pending, 1);
    const auditEntry = store.getAuditLog(5).at(-1);
    assert.equal(auditEntry.event, "runtime-metrics.dispatched");
    assert.deepEqual(auditEntry.sinkTypes, ["file", "webhook"]);
    assert.equal(auditEntry.webhookStatus, 202);
  } finally {
    await webhookServer.close();
  }
});

test("admin runtime logs dispatch writes file and posts webhook bundle", async () => {
  const harness = await createHarness();
  const { store } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  const app = createGatewayApp({
    config: {
      ...harness.config,
      runtime: {
        alerting: {
          backupMaxAgeHours: 24,
          pendingQueueMaxAgeMinutes: 30,
          openDeadLetterThreshold: 1,
          openAbuseCaseThreshold: 0,
          pendingQueueThreshold: 10,
        },
        logs: {
          dispatch: {
            webhookUrl: webhookServer.url,
            auditLimit: 10,
            traceLimit: 10,
          },
        },
      },
    },
    store,
    clock: () => new Date("2026-03-21T02:00:00.000Z"),
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });

  await store.recordAuditEvent({
    timestamp: "2026-03-21T00:00:00.000Z",
    event: "logs.audit.test",
    actorHandle: "alice",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:01:00.000Z",
    direction: "internal",
    event: "logs.trace.test",
    actorHandle: "alice",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:02:00.000Z",
    direction: "internal",
    event: "metrics.trace.ignore",
    actorHandle: "alice",
  });

  const tmpDir = path.join(os.tmpdir(), `matters-gateway-runtime-logs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const outputFile = path.join(tmpDir, "runtime-logs.json");

  try {
    const dispatchResponse = await app.handle(
      new Request("https://matters.example/admin/runtime/logs/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          outputFile,
          traceEventPrefix: "logs.",
          webhookBearerToken: "logs-secret",
          webhookHeaders: {
            "x-logs-source": "gateway-test",
          },
          requestedBy: "tester",
        }),
      }),
    );
    assert.equal(dispatchResponse.status, 201);
    const dispatchPayload = await dispatchResponse.json();
    assert.equal(dispatchPayload.status, "dispatched");
    assert.deepEqual(dispatchPayload.sinkTypes, ["file", "webhook"]);
    assert.equal(dispatchPayload.bundle.audit.total, 1);
    assert.equal(dispatchPayload.bundle.traces.total, 1);
    assert.equal(dispatchPayload.bundle.traces.items[0].event, "logs.trace.test");

    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(writtenPayload.audit.total, 1);
    assert.equal(writtenPayload.traces.total, 1);
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer logs-secret");
    assert.equal(webhookServer.requests[0].headers["x-logs-source"], "gateway-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.audit.total, 1);
    assert.equal(webhookPayload.traces.total, 1);
    assert.equal(webhookPayload.traces.items[0].event, "logs.trace.test");
    const auditEntry = store.getAuditLog(10).at(-1);
    assert.equal(auditEntry.event, "runtime-logs.dispatched");
    assert.deepEqual(auditEntry.sinkTypes, ["file", "webhook"]);
    assert.equal(auditEntry.webhookStatus, 202);
  } finally {
    await webhookServer.close();
  }
});

test("admin runtime alerts endpoints filter and dispatch alert bundles", async () => {
  const harness = await createHarness();
  const { store } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  const app = createGatewayApp({
    config: {
      ...harness.config,
      runtime: {
        alerting: {
          backupMaxAgeHours: 24,
          pendingQueueMaxAgeMinutes: 30,
          openDeadLetterThreshold: 1,
          openAbuseCaseThreshold: 0,
          pendingQueueThreshold: 10,
        },
      },
    },
    store,
    clock: () => new Date("2026-03-21T02:00:00.000Z"),
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
  });

  await store.enqueueOutbound({
    id: "queue-admin-alerts-1",
    status: "pending",
    attempts: 1,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-alerts-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:21:00.000Z",
  });
  store.db
    .prepare("INSERT OR REPLACE INTO outbound_queue (id, status, item_json) VALUES (?, ?, ?)")
    .run(
      "queue-admin-alerts-dead",
      "dead-letter",
      JSON.stringify({
        id: "queue-admin-alerts-dead",
        status: "dead-letter",
        attempts: 2,
        actorHandle: "alice",
        targetActorId: "https://remote.example/users/zoe",
        targetInbox: "https://remote.example/inbox",
        activity: {
          id: "https://matters.example/activities/admin-alerts-dead",
          type: "Delete",
        },
        createdAt: "2026-03-21T00:10:00.000Z",
        deadLetteredAt: "2026-03-21T00:15:00.000Z",
      }),
    );
  await store.reconcileStorage({ now: "2026-03-21T02:00:00.000Z" });

  const alertsResponse = await app.handle(
    new Request("https://matters.example/admin/runtime/alerts?minimumSeverity=warn"),
  );
  assert.equal(alertsResponse.status, 200);
  const alertsPayload = await alertsResponse.json();
  assert.equal(alertsPayload.alerts.items.some((entry) => entry.code === "storage.backup.missing"), true);
  assert.equal(alertsPayload.alerts.items.some((entry) => entry.code === "storage.dead-letter.open"), true);
  assert.equal(alertsPayload.metrics.storage.driver, "sqlite");

  const tmpDir = path.join(os.tmpdir(), `matters-gateway-runtime-alerts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const outputFile = path.join(tmpDir, "runtime-alerts.json");
  try {
    const dispatchResponse = await app.handle(
      new Request("https://matters.example/admin/runtime/alerts/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          minimumSeverity: "warn",
          outputFile,
          webhookUrl: webhookServer.url,
          webhookBearerToken: "dispatch-secret",
          webhookHeaders: {
            "x-alert-source": "gateway-test",
          },
          requestedBy: "tester",
        }),
      }),
    );
    assert.equal(dispatchResponse.status, 201);
    const dispatchPayload = await dispatchResponse.json();
    assert.equal(dispatchPayload.status, "dispatched");
    assert.deepEqual(dispatchPayload.sinkTypes, ["file", "webhook"]);
    assert.equal(dispatchPayload.webhook.host.startsWith("127.0.0.1:"), true);
    assert.equal(dispatchPayload.webhook.status, 202);
    assert.equal(dispatchPayload.bundle.alerts.items.some((entry) => entry.code === "storage.backup.missing"), true);

    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(writtenPayload.metrics.storage.driver, "sqlite");
    assert.equal(writtenPayload.alerts.items.some((entry) => entry.code === "storage.dead-letter.open"), true);
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].method, "POST");
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer dispatch-secret");
    assert.equal(webhookServer.requests[0].headers["x-alert-source"], "gateway-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookPayload.alerts.items.some((entry) => entry.code === "storage.dead-letter.open"), true);
    const auditEntry = store.getAuditLog(5).at(-1);
    assert.equal(auditEntry.event, "runtime-alerts.dispatched");
    assert.deepEqual(auditEntry.sinkTypes, ["file", "webhook"]);
    assert.equal(auditEntry.webhookStatus, 202);
  } finally {
    await webhookServer.close();
  }
});

test("admin runtime alerts dispatch posts Slack webhook payload", async () => {
  const harness = await createHarness();
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const slackServer = await createWebhookCaptureServer();
  await store.enqueueOutbound({
    id: "queue-admin-alerts-slack-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/admin-alerts-slack-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const app = createGatewayApp({
    config: {
      ...harness.config,
      runtime: {
        storeDriver: "sqlite",
        sqliteFile,
        alerting: {
          backupMaxAgeHours: 24,
          pendingQueueMaxAgeMinutes: 30,
          openDeadLetterThreshold: 1,
          openAbuseCaseThreshold: 0,
          pendingQueueThreshold: 10,
        },
      },
    },
    store,
    clock: () => new Date("2026-03-21T02:00:00.000Z"),
  });

  try {
    const response = await app.handle(
      new Request("https://matters.example/admin/runtime/alerts/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          minimumSeverity: "warn",
          slackWebhookUrl: slackServer.url,
          slackChannel: "#gateway-alerts",
          slackUsername: "matters-gateway",
          slackIconEmoji: ":satellite:",
          requestedBy: "tester",
        }),
      }),
    );
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.status, "dispatched");
    assert.deepEqual(payload.sinkTypes, ["slack"]);
    assert.equal(payload.slack.host.startsWith("127.0.0.1:"), true);
    assert.equal(payload.slack.status, 202);
    assert.equal(slackServer.requests.length, 1);
    const slackPayload = JSON.parse(slackServer.requests[0].body);
    assert.equal(slackPayload.channel, "#gateway-alerts");
    assert.equal(slackPayload.username, "matters-gateway");
    assert.equal(slackPayload.icon_emoji, ":satellite:");
    assert.equal(slackPayload.text.includes("[matters.example] runtime alerts"), true);
    assert.equal(slackPayload.blocks[0].text.text.includes("minimum severity"), true);
    const auditEntry = store.getAuditLog(5).at(-1);
    assert.equal(auditEntry.event, "runtime-alerts.dispatched");
    assert.deepEqual(auditEntry.sinkTypes, ["slack"]);
    assert.equal(auditEntry.slackStatus, 202);
  } finally {
    await slackServer.close();
  }
});

test("instance inbound rate limit blocks second inbound activity", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertRateLimitPolicy({
    policyKey: "instance-inbound",
    limit: 1,
    windowMs: 60 * 1000,
    enabled: true,
    source: "test",
    scope: "instance-inbound",
  });

  const followAlice = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-rate-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const firstResponse = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(followAlice),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  assert.equal(firstResponse.status, 202);

  const followBob = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-rate-2",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/bob",
  };
  const secondResponse = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/bob/inbox",
      body: JSON.stringify(followBob),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  assert.equal(secondResponse.status, 429);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.policyKey, "instance-inbound");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.abuseQueue.at(-1).category, "rate-limit");
  assert.equal(snapshot.auditLog.at(-1).event, "rate-limit.enforced");
});

test("suspended actor blocks inbox and outbox update", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertActorSuspension({
    actorHandle: "alice",
    reason: "policy review",
    source: "test",
    suspendedAt: "2026-03-21T00:00:00.000Z",
  });

  const followActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-suspended-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const inboxResponse = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(followActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  assert.equal(inboxResponse.status, 403);

  const outboxResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/suspended-update",
          type: "Article",
          content: "content",
        },
      }),
    }),
  );
  assert.equal(outboxResponse.status, 403);

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.auditLog.at(-1).event, "actor-suspension.enforced");
});

test("signed Follow is accepted, persisted, and queued for delivery", async () => {
  const { app, store, deliveries, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, "accepted");
  assert.equal(deliveries.length, 1);

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors.alice.followers["https://remote.example/users/zoe"].status, "accepted");
  assert.equal(snapshot.outboundQueue[0].status, "delivered");
});

test("public Create reply is stored as inbound reply state", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/create-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: ["https://matters.example/users/alice/followers"],
    object: {
      id: "https://remote.example/notes/reply-1",
      type: "Note",
      published: "2026-03-21T00:00:00.000Z",
      content: "Hello from the fediverse reply",
      summary: "Reply summary",
      url: "https://remote.example/@zoe/reply-1",
      inReplyTo: "https://matters.example/articles/hello-fediverse",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: ["https://matters.example/users/alice/followers"],
      tag: ["reply", "fediverse"],
    },
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, "stored");
  assert.equal(payload.mapping, "reply");

  const snapshot = store.getSnapshot();
  const inboundObject = snapshot.actors.alice.inboundObjects["https://remote.example/notes/reply-1"];
  assert.equal(inboundObject.mapping, "reply");
  assert.equal(inboundObject.remoteActorId, "https://remote.example/users/zoe");
  assert.equal(inboundObject.inReplyTo, "https://matters.example/articles/hello-fediverse");
  assert.equal(inboundObject.visibility, "public");
  assert.equal(inboundObject.threadRootId, "https://matters.example/articles/hello-fediverse");
  assert.equal(inboundObject.threadResolved, false);
  assert.equal(inboundObject.replyDepth, 1);
});

test("non-public Create is ignored by public-only boundary", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/create-2",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://matters.example/users/alice"],
    object: {
      id: "https://remote.example/notes/private-1",
      type: "Note",
      content: "Private note should be ignored",
      url: "https://remote.example/@zoe/private-1",
      to: ["https://matters.example/users/alice"],
      cc: [],
    },
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, "ignored");

  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.actors.alice.inboundObjects, {});
});

test("nested replies reconstruct thread state and local mentions", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/create-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: ["https://matters.example/users/alice/followers"],
    object: {
      id: "https://remote.example/notes/thread-root-1",
      type: "Note",
      published: "2026-03-21T00:00:00.000Z",
      content: "Hello @bob@matters.example",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: ["https://matters.example/users/alice/followers"],
      tag: [
        {
          type: "Mention",
          href: "https://matters.example/users/bob",
          name: "@bob@matters.example",
        },
      ],
    },
  };
  const replyActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/create-root-2",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: ["https://matters.example/users/alice/followers"],
    object: {
      id: "https://remote.example/notes/thread-reply-1",
      type: "Note",
      published: "2026-03-21T00:01:00.000Z",
      content: "Nested reply",
      inReplyTo: "https://remote.example/notes/thread-root-1",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: ["https://matters.example/users/alice/followers"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(replyActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const snapshot = store.getSnapshot();
  const root = snapshot.actors.alice.inboundObjects["https://remote.example/notes/thread-root-1"];
  const reply = snapshot.actors.alice.inboundObjects["https://remote.example/notes/thread-reply-1"];

  assert.equal(root.threadRootId, "https://remote.example/notes/thread-root-1");
  assert.equal(root.replyDepth, 0);
  assert.equal(root.threadResolved, true);
  assert.equal(root.mentions[0].actorId, "https://matters.example/users/bob");
  assert.deepEqual(root.localParticipantHandles.sort(), ["alice", "bob"]);
  assert.equal(reply.threadRootId, "https://remote.example/notes/thread-root-1");
  assert.equal(reply.replyDepth, 1);
  assert.equal(reply.threadResolved, true);
});

test("orphan reply keeps unresolved thread root from inReplyTo", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/create-orphan-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: ["https://matters.example/users/alice/followers"],
    object: {
      id: "https://remote.example/notes/orphan-reply-1",
      type: "Note",
      published: "2026-03-21T00:00:00.000Z",
      content: "Orphan reply",
      inReplyTo: "https://remote.example/notes/missing-root",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: ["https://matters.example/users/alice/followers"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(activity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const snapshot = store.getSnapshot();
  const record = snapshot.actors.alice.inboundObjects["https://remote.example/notes/orphan-reply-1"];
  assert.equal(record.threadRootId, "https://remote.example/notes/missing-root");
  assert.equal(record.threadResolved, false);
  assert.equal(record.replyDepth, 1);
});

test("Like is stored as inbound engagement state", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/articles/hello-fediverse",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "like");

  const snapshot = store.getSnapshot();
  const engagement = snapshot.actors.alice.inboundEngagements["https://remote.example/activities/like-1"];
  assert.equal(engagement.mapping, "like");
  assert.equal(engagement.objectId, "https://matters.example/articles/hello-fediverse");
  assert.equal(engagement.threadRootId, "https://matters.example/articles/hello-fediverse");
  assert.equal(engagement.threadResolved, false);
});

test("Announce is stored as inbound engagement state", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/announce-1",
    type: "Announce",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/articles/hello-fediverse",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "announce");

  const snapshot = store.getSnapshot();
  const engagement = snapshot.actors.alice.inboundEngagements["https://remote.example/activities/announce-1"];
  assert.equal(engagement.mapping, "announce");
  assert.equal(engagement.objectId, "https://matters.example/articles/hello-fediverse");
});

test("Like inherits known thread root from reply object", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/thread-reply-like-target",
    activityId: "https://remote.example/activities/create-thread-like-target",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "reply",
    content: "reply target",
    summary: "",
    url: null,
    inReplyTo: "https://remote.example/notes/thread-root-like-target",
    conversationId: null,
    threadId: "https://remote.example/notes/thread-root-like-target",
    threadRootId: "https://remote.example/notes/thread-root-like-target",
    threadResolved: true,
    replyDepth: 1,
    participantActorIds: ["https://remote.example/users/zoe", "https://matters.example/users/alice"],
    localParticipantHandles: ["alice"],
    mentions: [],
    publishedAt: "2026-03-21T00:00:00.000Z",
    tags: [],
    visibility: "public",
    receivedAt: "2026-03-21T00:00:00.000Z",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/like-thread-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/thread-reply-like-target",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(activity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const snapshot = store.getSnapshot();
  const engagement = snapshot.actors.alice.inboundEngagements["https://remote.example/activities/like-thread-1"];
  assert.equal(engagement.threadRootId, "https://remote.example/notes/thread-root-like-target");
  assert.equal(engagement.threadResolved, true);
});

test("Undo removes accepted follower state", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-undo-target",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/undo-follow-1",
    type: "Undo",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/activities/follow-undo-target",
      type: "Follow",
      actor: "https://remote.example/users/zoe",
      object: "https://matters.example/users/alice",
    },
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "follow");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors.alice.followers["https://remote.example/users/zoe"], undefined);
});

test("Undo removes inbound Like engagement state", async () => {
  const { app, store, remoteKeys } = await createHarness();
  await store.upsertInboundEngagement("alice", {
    activityId: "https://remote.example/activities/like-undo-target",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Like",
    mapping: "like",
    objectId: "https://matters.example/articles/hello-fediverse",
    receivedAt: "2026-03-21T00:00:00.000Z",
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/undo-like-1",
    type: "Undo",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/activities/like-undo-target",
      type: "Like",
      actor: "https://remote.example/users/zoe",
      object: "https://matters.example/articles/hello-fediverse",
    },
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "like");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors.alice.inboundEngagements["https://remote.example/activities/like-undo-target"], undefined);
});

test("outbox Update fans out to accepted followers", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/hello-fediverse",
          type: "Article",
          name: "Hello Fediverse",
          content: "Updated content",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "update");
  assert.equal(payload.deliveries.length, 1);
  assert.equal(deliveries[0].activity.type, "Update");
  assert.equal(deliveries[0].activity.object.id, "https://matters.example/articles/hello-fediverse");
});

test("outbox Update normalizes Article content before fanout", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/normalized-update",
          type: "Article",
          url: "https://matters.town/@alice/normalized-update",
          content: "<h3>Update</h3><img src=\"ipfs://bafyupdate/photo.jpg\" alt=\"Update photo\"><script>bad()</script>",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const object = deliveries[0].activity.object;
  assert.equal(object.type, "Article");
  assert.match(object.content, /<h3>Update<\/h3>/);
  assert.doesNotMatch(object.content, /img|script|bad\(\)/);
  assert.equal(object.attachment[0].url, "https://ipfs.io/ipfs/bafyupdate/photo.jpg");
});

test("outbox Create normalizes public Article before fanout", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/normalized-create",
          type: "Article",
          name: "Normalized Create",
          url: "https://matters.town/@alice/normalized-create",
          content: "<p>Create body</p><a href=\"javascript:bad()\">bad link</a>",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const object = deliveries[0].activity.object;
  assert.equal(object.type, "Article");
  assert.equal(object.name, "Normalized Create");
  assert.doesNotMatch(object.content, /javascript:|<\/a>bad link/);
  assert.match(object.content, /Original Matters link:/);
});

test("outbox Create reply fans out to followers, explicit targets, and mention recipients", async () => {
  const { config, store, deliveries } = await createHarness();
  config.remoteActors["https://elsewhere.example/users/mia"] = {
    keyId: "https://elsewhere.example/users/mia#main-key",
    inbox: "https://elsewhere.example/users/mia/inbox",
    sharedInbox: "https://elsewhere.example/inbox",
    publicKeyPem: pemPair().publicKeyPem,
  };
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        deliveries.push(item);
        return { status: 202 };
      },
    },
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/replies/reply-1",
          type: "Note",
          content: "reply body",
          inReplyTo: "https://remote.example/objects/post-1",
        },
        targetActorIds: ["https://remote.example/users/zoe"],
        mentions: [
          {
            actorId: "https://elsewhere.example/users/mia",
            name: "@mia@elsewhere.example",
          },
        ],
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "reply");
  assert.equal(payload.recipients.length, 2);
  assert.equal(payload.mentions[0], "https://elsewhere.example/users/mia");
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].activity.type, "Create");
  assert.equal(deliveries[0].activity.object.inReplyTo, "https://remote.example/objects/post-1");
  assert.equal(
    deliveries[0].activity.object.tag.some((entry) => entry.type === "Mention" && entry.href === "https://elsewhere.example/users/mia"),
    true,
  );
});

test("outbox Create resolves local mention handles into mention tags without remote delivery", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/replies/reply-2",
          type: "Note",
          content: "Ping @bob@matters.example",
        },
        targetActorIds: ["https://remote.example/users/zoe"],
        mentions: [{ acct: "@bob@matters.example" }],
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mentions.includes("https://matters.example/users/bob"), true);
  assert.equal(payload.recipients.length, 1);
  assert.equal(payload.recipients[0], "https://remote.example/users/zoe");
  assert.equal(
    deliveries[0].activity.object.tag.some((entry) => entry.type === "Mention" && entry.href === "https://matters.example/users/bob"),
    true,
  );
});

test("admin threads endpoint returns reconstructed thread summary", async () => {
  const { app, store } = await createHarness();
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/admin-thread-root",
    activityId: "https://remote.example/activities/admin-thread-root",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "create",
    content: "root",
    summary: "",
    url: null,
    inReplyTo: null,
    conversationId: null,
    threadId: "https://remote.example/notes/admin-thread-root",
    threadRootId: "https://remote.example/notes/admin-thread-root",
    threadResolved: true,
    replyDepth: 0,
    participantActorIds: ["https://remote.example/users/zoe", "https://matters.example/users/alice"],
    localParticipantHandles: ["alice"],
    mentions: [],
    publishedAt: "2026-03-21T00:00:00.000Z",
    tags: [],
    visibility: "public",
    receivedAt: "2026-03-21T00:00:00.000Z",
  });
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/admin-thread-reply",
    activityId: "https://remote.example/activities/admin-thread-reply",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "reply",
    content: "reply",
    summary: "",
    url: null,
    inReplyTo: "https://remote.example/notes/admin-thread-root",
    conversationId: null,
    threadId: "https://remote.example/notes/admin-thread-root",
    threadRootId: "https://remote.example/notes/admin-thread-root",
    threadResolved: true,
    replyDepth: 1,
    participantActorIds: ["https://remote.example/users/zoe", "https://matters.example/users/alice"],
    localParticipantHandles: ["alice"],
    mentions: [],
    publishedAt: "2026-03-21T00:01:00.000Z",
    tags: [],
    visibility: "public",
    receivedAt: "2026-03-21T00:01:00.000Z",
  });

  const response = await app.handle(
    new Request("https://matters.example/admin/threads?actorHandle=alice&objectId=https://remote.example/notes/admin-thread-reply"),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.threadId, "https://remote.example/notes/admin-thread-root");
  assert.equal(payload.objectCount, 2);
  assert.equal(payload.rootObjectId, "https://remote.example/notes/admin-thread-root");
});

test("inbound social activity syncs local conversation projection", async () => {
  const { app, store, remoteKeys } = await createHarness();
  const createActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/local-conversation-create-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: ["https://matters.example/users/alice/followers"],
    object: {
      id: "https://remote.example/notes/local-conversation-root-1",
      type: "Note",
      published: "2026-03-21T00:00:00.000Z",
      content: "Hello @bob@matters.example",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: ["https://matters.example/users/alice/followers"],
    },
  };
  const likeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/local-conversation-like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/local-conversation-root-1",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(createActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(likeActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const snapshot = store.getSnapshot();
  const conversation = snapshot.actors.alice.localConversations["https://remote.example/notes/local-conversation-root-1"];
  assert.equal(conversation.objectCount, 1);
  assert.equal(conversation.engagementCount, 1);
  assert.equal(conversation.engagementCounts.like, 1);
  assert.equal(conversation.actionMatrix.inbound.create, 1);
  assert.equal(conversation.actionMatrix.inbound.like, 1);
  assert.equal(conversation.mentionActorIds.includes("https://matters.example/users/bob"), true);
});

test("admin local content exposes content projection and action matrix", async () => {
  const { app, remoteKeys } = await createHarness();
  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/content-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/content-root-1",
      type: "Note",
      content: "Root body",
      summary: "Root summary",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const replyActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/content-reply-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/content-reply-1",
      type: "Note",
      content: "Reply body @bob@matters.example",
      inReplyTo: "https://remote.example/notes/content-root-1",
      published: "2026-03-21T00:01:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const likeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/content-like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/content-root-1",
  };
  const announceActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/content-announce-1",
    type: "Announce",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/content-root-1",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(replyActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(likeActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(announceActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/content-root-1",
    ),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.headline, "Root summary");
  assert.equal(payload.item.metrics.objects, 2);
  assert.equal(payload.item.metrics.replies, 1);
  assert.equal(payload.item.metrics.likes, 1);
  assert.equal(payload.item.metrics.announces, 1);
  assert.equal(payload.item.actionMatrix.inbound.create, 1);
  assert.equal(payload.item.actionMatrix.inbound.reply, 1);
  assert.equal(payload.item.actionMatrix.inbound.like, 1);
  assert.equal(payload.item.actionMatrix.inbound.announce, 1);
  assert.equal(payload.item.relations.replyObjectIds.includes("https://remote.example/notes/content-reply-1"), true);
  assert.equal(payload.item.mentionActorIds.includes("https://matters.example/users/bob"), true);
  assert.equal(payload.item.status, "resolved");
});

test("admin local content projects outbound-authored root content", async () => {
  const { app } = await createHarness();

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/authored-root-1",
          type: "Note",
          summary: "Authored summary",
          content: "Authored body",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );
  assert.equal(response.status, 202);

  const contentResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://matters.example/notes/authored-root-1",
    ),
  );
  assert.equal(contentResponse.status, 200);
  const payload = await contentResponse.json();
  assert.equal(payload.item.contentId, "https://matters.example/notes/authored-root-1");
  assert.equal(payload.item.rootObjectId, "https://matters.example/notes/authored-root-1");
  assert.equal(payload.item.rootMapping, "create");
  assert.equal(payload.item.headline, "Authored summary");
  assert.equal(payload.item.localParticipantHandles.includes("alice"), true);
  assert.equal(payload.item.actionMatrix.outbound.create, 1);
  assert.equal(payload.item.actionMatrix.delivery.total, 1);
  assert.equal(payload.item.actionMatrix.delivery.delivered, 1);
});

test("admin local notifications projects reply, mention, like, and announce events", async () => {
  const { app, remoteKeys } = await createHarness();
  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/notification-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/notification-root-1",
      type: "Note",
      content: "Hello @alice@matters.example",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const replyActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/notification-reply-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/notification-reply-1",
      type: "Note",
      content: "Reply body",
      inReplyTo: "https://remote.example/notes/notification-root-1",
      published: "2026-03-21T00:01:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const likeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/notification-like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/notification-root-1",
  };
  const announceActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/notification-announce-1",
    type: "Announce",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/notification-root-1",
  };

  for (const activity of [rootActivity, replyActivity, likeActivity, announceActivity]) {
    await app.handle(
      signedRequest({
        method: "POST",
        url: "https://matters.example/users/alice/inbox",
        body: JSON.stringify(activity),
        keyId: "https://remote.example/users/zoe#main-key",
        privateKeyPem: remoteKeys.privateKeyPem,
      }),
    );
  }

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-notifications?actorHandle=alice&contentId=https://remote.example/notes/notification-root-1",
    ),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 4);
  assert.equal(payload.items.some((entry) => entry.primaryCategory === "mention"), true);
  assert.equal(payload.items.some((entry) => entry.primaryCategory === "reply"), true);
  assert.equal(payload.items.some((entry) => entry.primaryCategory === "like"), true);
  assert.equal(payload.items.some((entry) => entry.primaryCategory === "announce"), true);

  const contentResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/notification-root-1",
    ),
  );
  assert.equal(contentResponse.status, 200);
  const contentPayload = await contentResponse.json();
  assert.equal(contentPayload.item.notifications.total, 4);
  assert.equal(contentPayload.item.notifications.mention, 1);
  assert.equal(contentPayload.item.notifications.reply, 1);
  assert.equal(contentPayload.item.notifications.like, 1);
  assert.equal(contentPayload.item.notifications.announce, 1);
  assert.equal(contentPayload.item.actionMatrix.notifications.total, 4);
});

test("admin local notifications preserves read state and reopens grouped notifications on new events", async () => {
  const { app, remoteKeys } = await createHarness();
  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/read-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/read-root-1",
      type: "Note",
      content: "Read-state root",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const firstLikeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/read-like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/read-root-1",
  };
  const secondLikeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://reply.example/activities/read-like-2",
    type: "Like",
    actor: "https://reply.example/users/mika",
    object: "https://remote.example/notes/read-root-1",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(firstLikeActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const notificationId = "like::https://remote.example/notes/read-root-1";
  const initialResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-notifications?actorHandle=alice&notificationId=${encodeURIComponent(notificationId)}`,
    ),
  );
  assert.equal(initialResponse.status, 200);
  const initialPayload = await initialResponse.json();
  assert.equal(initialPayload.item.eventCount, 1);
  assert.equal(initialPayload.item.unreadCount, 1);
  assert.equal(initialPayload.item.state.read, false);

  const markReadResponse = await app.handle(
    new Request("https://matters.example/admin/local-notifications/read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
        notificationId,
        updatedBy: "tester",
      }),
    }),
  );
  assert.equal(markReadResponse.status, 200);
  const markReadPayload = await markReadResponse.json();
  assert.equal(markReadPayload.items[0].state.read, true);
  assert.equal(markReadPayload.items[0].unreadCount, 0);

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(secondLikeActivity),
      keyId: "https://reply.example/users/mika#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const reopenedResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-notifications?actorHandle=alice&notificationId=${encodeURIComponent(notificationId)}`,
    ),
  );
  assert.equal(reopenedResponse.status, 200);
  const reopenedPayload = await reopenedResponse.json();
  assert.equal(reopenedPayload.item.eventCount, 2);
  assert.equal(reopenedPayload.item.unreadCount, 1);
  assert.equal(reopenedPayload.item.state.read, false);
  assert.equal(reopenedPayload.item.remoteActorIds.length, 2);

  const unreadResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-notifications?actorHandle=alice&unreadOnly=true&category=like",
    ),
  );
  assert.equal(unreadResponse.status, 200);
  const unreadPayload = await unreadResponse.json();
  assert.equal(unreadPayload.items.length, 1);
  assert.equal(unreadPayload.items[0].notificationId, notificationId);

  const contentResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/read-root-1",
    ),
  );
  assert.equal(contentResponse.status, 200);
  const contentPayload = await contentResponse.json();
  assert.equal(contentPayload.item.notifications.like, 2);
  assert.equal(contentPayload.item.notifications.unreadLike, 1);
  assert.equal(contentPayload.item.notifications.unreadTotal, 1);
});

test("admin local content keeps outbound-authored reply identity separate from parent thread notifications", async () => {
  const { app, remoteKeys } = await createHarness();
  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/authored-reply-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/authored-reply-root-1",
      type: "Note",
      content: "Remote root",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const likeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://reply.example/activities/authored-reply-like-1",
    type: "Like",
    actor: "https://reply.example/users/mika",
    object: "https://remote.example/notes/authored-reply-root-1",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  const replyResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/authored-reply-1",
          type: "Note",
          content: "Local authored reply",
          inReplyTo: "https://remote.example/notes/authored-reply-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );
  assert.equal(replyResponse.status, 202);

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(likeActivity),
      keyId: "https://reply.example/users/mika#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const authoredContentResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://matters.example/notes/authored-reply-1",
    ),
  );
  assert.equal(authoredContentResponse.status, 200);
  const authoredPayload = await authoredContentResponse.json();
  assert.equal(authoredPayload.item.threadRootId, "https://remote.example/notes/authored-reply-root-1");
  assert.equal(authoredPayload.item.relations.inReplyTo, "https://remote.example/notes/authored-reply-root-1");
  assert.equal(authoredPayload.item.actionMatrix.outbound.reply, 1);
  assert.equal(authoredPayload.item.notifications.like, 0);

  const rootContentResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/authored-reply-root-1",
    ),
  );
  assert.equal(rootContentResponse.status, 200);
  const rootPayload = await rootContentResponse.json();
  assert.equal(rootPayload.item.actionMatrix.outbound.reply, 1);
  assert.equal(rootPayload.item.notifications.like, 1);
});

test("admin local content includes delivery-aware outbound action matrix", async () => {
  const { config, store, remoteKeys } = await createHarness();
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("Delivery failed with status 503");
          error.status = 503;
          error.temporary = true;
          throw error;
        }

        return { status: 202 };
      },
    },
  });

  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/delivery-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/delivery-root-1",
      type: "Note",
      content: "Remote root body",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/delivery-reply-1",
          type: "Note",
          content: "Local reply body",
          inReplyTo: "https://remote.example/notes/delivery-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );

  await app.handle(
    new Request("https://matters.example/users/alice/outbox/engagement", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "Like",
        objectId: "https://remote.example/notes/delivery-root-1",
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/delivery-root-1",
    ),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.actionMatrix.outbound.reply, 1);
  assert.equal(payload.item.actionMatrix.outbound.like, 1);
  assert.equal(payload.item.actionMatrix.delivery.total, 2);
  assert.equal(payload.item.actionMatrix.delivery.delivered, 1);
  assert.equal(payload.item.actionMatrix.delivery.pending, 0);
  assert.equal(payload.item.actionMatrix.delivery.retryPending, 0);
  assert.equal(payload.item.actionMatrix.delivery.deadLetter, 0);
  assert.equal(payload.item.actionMatrix.delivery.partial, 1);
  assert.equal(payload.item.delivery.recipientCount, 2);
  assert.equal(payload.item.delivery.recipients.total, 3);
  assert.equal(payload.item.delivery.recipients.delivered, 2);
  assert.equal(payload.item.delivery.recipients.pending, 1);
  assert.equal(payload.item.delivery.recipients.retryPending, 1);
  assert.equal(payload.item.delivery.recipients.deadLetter, 0);
  assert.equal(Boolean(payload.item.delivery.lastFailureAt), true);
  assert.equal(payload.item.delivery.lastError, "Delivery failed with status 503");
});

test("admin local content delivery drilldown exposes activity summaries and filters", async () => {
  const { config, store, remoteKeys } = await createHarness();
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("Delivery failed with status 503");
          error.status = 503;
          error.temporary = true;
          throw error;
        }

        return { status: 202 };
      },
    },
  });

  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/drilldown-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/drilldown-root-1",
      type: "Note",
      content: "Remote root body",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const replyResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/drilldown-reply-1",
          type: "Note",
          content: "Local reply body",
          inReplyTo: "https://remote.example/notes/drilldown-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );
  const replyPayload = await replyResponse.json();

  await app.handle(
    new Request("https://matters.example/users/alice/outbox/engagement", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "Like",
        objectId: "https://remote.example/notes/drilldown-root-1",
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=https://remote.example/notes/drilldown-root-1",
    ),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.summary.total, 2);
  assert.equal(payload.summary.delivered, 1);
  assert.equal(payload.summary.partial, 1);
  assert.equal(payload.summary.recipients.total, 3);
  assert.equal(payload.items.length, 2);

  const filteredResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=https://remote.example/notes/drilldown-root-1&status=partial&actionType=reply",
    ),
  );
  assert.equal(filteredResponse.status, 200);
  const filteredPayload = await filteredResponse.json();
  assert.equal(filteredPayload.items.length, 1);
  assert.equal(filteredPayload.items[0].activityId, replyPayload.activityId);
  assert.equal(filteredPayload.items[0].delivery.status, "partial");
  assert.equal(filteredPayload.items[0].delivery.recipients.pending, 1);

  const itemResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=${encodeURIComponent("https://remote.example/notes/drilldown-root-1")}&activityId=${encodeURIComponent(replyPayload.activityId)}`,
    ),
  );
  assert.equal(itemResponse.status, 200);
  const itemPayload = await itemResponse.json();
  assert.equal(itemPayload.item.activityId, replyPayload.activityId);
  assert.equal(itemPayload.item.recipients.length, 2);
});

test("admin local content delivery replay replays dead-letter recipients for a content", async () => {
  const { config, store, remoteKeys } = await createHarness();
  const attempts = new Map();
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        const count = (attempts.get(item.targetActorId) ?? 0) + 1;
        attempts.set(item.targetActorId, count);
        if (count <= 2) {
          const error = new Error("Delivery failed with status 503");
          error.status = 503;
          error.temporary = true;
          throw error;
        }
        return { status: 202 };
      },
    },
  });

  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/replay-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/replay-root-1",
      type: "Note",
      content: "Remote root body",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const createResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/replay-reply-1",
          type: "Note",
          content: "Local reply body",
          inReplyTo: "https://remote.example/notes/replay-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );
  assert.equal(createResponse.status, 202);
  const createPayload = await createResponse.json();

  const jobResponse = await app.handle(
    new Request("https://matters.example/jobs/delivery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ids: [createPayload.deliveries[0].id],
      }),
    }),
  );
  assert.equal(jobResponse.status, 200);

  const beforeReplayResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=https://remote.example/notes/replay-root-1&status=deadLetter",
    ),
  );
  assert.equal(beforeReplayResponse.status, 200);
  const beforeReplayPayload = await beforeReplayResponse.json();
  assert.equal(beforeReplayPayload.items.length, 1);
  assert.equal(beforeReplayPayload.items[0].delivery.replayableQueueItemIds.length, 1);

  const replayResponse = await app.handle(
    new Request("https://matters.example/admin/local-content/delivery/replay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
        contentId: "https://remote.example/notes/replay-root-1",
        replayedBy: "tester",
      }),
    }),
  );
  assert.equal(replayResponse.status, 200);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.items.length, 1);
  assert.equal(replayPayload.items[0].delivery.status, "delivered");

  const afterReplayResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=${encodeURIComponent("https://remote.example/notes/replay-root-1")}&activityId=${encodeURIComponent(createPayload.activityId)}`,
    ),
  );
  assert.equal(afterReplayResponse.status, 200);
  const afterReplayPayload = await afterReplayResponse.json();
  assert.equal(afterReplayPayload.item.delivery.status, "delivered");
  assert.equal(afterReplayPayload.item.delivery.recipients.deadLetter, 0);
});

test("admin queue and content delivery surfaces expose dead letters and recent replay traces", async () => {
  const harness = await createHarness();
  const { config, store, remoteKeys } = harness;
  let shouldFail = true;
  const replayDeliveries = [];
  const app = createGatewayApp({
    config: {
      ...config,
      delivery: {
        ...config.delivery,
        maxAttempts: 1,
      },
    },
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (shouldFail && item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("temporary outage");
          error.status = 503;
          error.temporary = true;
          throw error;
        }

        replayDeliveries.push(item);
        return { status: 202 };
      },
    },
  });

  const rootActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/dashboard-root-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/dashboard-root-1",
      type: "Note",
      content: "Dashboard root body",
      published: "2026-03-21T00:00:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(rootActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  assert.equal(response.status, 202);

  const replyResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/dashboard-reply-1",
          type: "Note",
          content: "Dashboard reply body",
          inReplyTo: "https://remote.example/notes/dashboard-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );
  assert.equal(replyResponse.status, 202);
  const replyPayload = await replyResponse.json();

  const deadLetterResponse = await app.handle(new Request("https://matters.example/admin/dead-letters"));
  assert.equal(deadLetterResponse.status, 200);
  const deadLetterPayload = await deadLetterResponse.json();
  assert.equal(deadLetterPayload.items.length, 1);
  assert.equal(deadLetterPayload.items[0].status, "open");

  const queueResponse = await app.handle(new Request("https://matters.example/admin/queues/outbound?traceLimit=5"));
  assert.equal(queueResponse.status, 200);
  const queuePayload = await queueResponse.json();
  assert.equal(queuePayload.queue.summary.deadLetter, 1);
  assert.equal(queuePayload.queue.deadLetters.open, 1);
  assert.equal(queuePayload.queue.recentDeliveryTraces.at(-1).event, "delivery.dead-letter");

  shouldFail = false;
  const replayResponse = await app.handle(
    new Request("https://matters.example/admin/dead-letters/replay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: deadLetterPayload.items[0].id,
        replayedBy: "tester",
        reason: "dashboard recovery",
      }),
    }),
  );
  assert.equal(replayResponse.status, 202);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.status, "replayed");
  assert.equal(replayPayload.delivery.status, "delivered");
  assert.equal(replayDeliveries.length, 2);

  const refreshedQueueResponse = await app.handle(new Request("https://matters.example/admin/queues/outbound?traceLimit=5"));
  assert.equal(refreshedQueueResponse.status, 200);
  const refreshedQueuePayload = await refreshedQueueResponse.json();
  assert.equal(refreshedQueuePayload.queue.summary.delivered, 2);
  assert.equal(refreshedQueuePayload.queue.deadLetters.replayed, 1);
  assert.equal(
    refreshedQueuePayload.queue.recentDeliveryTraces.some((entry) => entry.event === "delivery.delivered"),
    true,
  );

  const auditResponse = await app.handle(new Request("https://matters.example/admin/audit-log?limit=5"));
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.equal(auditPayload.items.some((entry) => entry.event === "dead-letter.replayed"), true);

  const contentDeliveryResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery?actorHandle=alice&contentId=https://remote.example/notes/dashboard-root-1",
    ),
  );
  assert.equal(contentDeliveryResponse.status, 200);
  const contentDeliveryPayload = await contentDeliveryResponse.json();
  assert.equal(contentDeliveryPayload.summary.total, 1);
  assert.equal(contentDeliveryPayload.summary.deadLetter, 0);
  assert.equal(contentDeliveryPayload.summary.delivered, 1);
  assert.equal(contentDeliveryPayload.items[0].activityId, replyPayload.activityId);
  assert.equal(contentDeliveryPayload.items[0].delivery.status, "delivered");

  const dashboardResponse = await app.handle(new Request("https://matters.example/admin/dashboard?actorHandle=alice&limit=5"));
  assert.equal(dashboardResponse.status, 200);
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload.contentDelivery.summary.contents, 2);
  assert.equal(dashboardPayload.contentDelivery.summary.contentsWithIssues, 0);
  assert.equal(dashboardPayload.contentDelivery.summary.activities.total, 2);
  assert.equal(dashboardPayload.contentDelivery.summary.uniqueActivities.total, 1);
  assert.equal(dashboardPayload.contentDelivery.summary.uniqueActivities.delivered, 1);
  assert.equal(dashboardPayload.contentDelivery.contractVersion, 1);
  assert.equal(dashboardPayload.contentDelivery.canonicalSummaryKey, "summaries.current");
  assert.equal(dashboardPayload.contentDelivery.currentSummaryMode, "full");
  assert.deepEqual(dashboardPayload.contentDelivery.legacySummaryKeys, [
    "summary",
    "fullSummary",
    "filteredSummary",
    "viewSummary",
  ]);
  assert.equal(dashboardPayload.contentDelivery.contract.version, 1);
  assert.equal(dashboardPayload.contentDelivery.contract.canonicalSummaryKey, "summaries.current");
  assert.equal(dashboardPayload.contentDelivery.contract.currentSummaryMode, "full");
  assert.equal(dashboardPayload.contentDelivery.contract.legacyFields.summary.replacement, "summaries.full");
  assert.equal(dashboardPayload.contentDelivery.contract.legacyFields.viewSummary.replacement, "summaries.current");
  assert.equal(dashboardPayload.contentDelivery.summaryAliases.summary, "summaries.full");
  assert.equal(dashboardPayload.contentDelivery.summaryAliases.viewSummary, "summaries.current");
  assert.equal(
    dashboardPayload.contentDelivery.summaries.current.contents,
    dashboardPayload.contentDelivery.summary.contents,
  );
  assert.equal(dashboardPayload.contentDelivery.viewSummary.contents, dashboardPayload.contentDelivery.summary.contents);
  assert.equal(dashboardPayload.contentDelivery.recentReplays.length, 1);
  assert.equal(dashboardPayload.contentDelivery.recentReplays[0].surface, "admin-dead-letter-replay");

  const replayedQueueResponse = await app.handle(
    new Request("https://matters.example/admin/review-queue?surface=content-delivery&actorHandle=alice&replayedOnly=true"),
  );
  assert.equal(replayedQueueResponse.status, 200);
  const replayedQueuePayload = await replayedQueueResponse.json();
  assert.equal(replayedQueuePayload.items.length, 0);
});

test("admin review queue lists content delivery issues and replayable items", async () => {
  const harness = await createHarness();
  const { config, store, remoteKeys } = harness;
  const app = createGatewayApp({
    config: {
      ...config,
      delivery: {
        ...config.delivery,
        maxAttempts: 1,
      },
    },
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("temporary outage");
          error.status = 503;
          error.temporary = true;
          throw error;
        }
        return { status: 202 };
      },
    },
  });

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify({
        "@context": "https://www.w3.org/ns/activitystreams",
        id: "https://remote.example/activities/review-queue-root-1",
        type: "Create",
        actor: "https://remote.example/users/zoe",
        object: {
          id: "https://remote.example/notes/review-queue-root-1",
          type: "Note",
          content: "Review queue root body",
          published: "2026-03-21T00:00:00.000Z",
          to: ["https://www.w3.org/ns/activitystreams#Public"],
        },
      }),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const createResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/review-queue-reply-1",
          type: "Note",
          content: "Review queue reply body",
          inReplyTo: "https://remote.example/notes/review-queue-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );
  assert.equal(createResponse.status, 202);

  const reviewQueueResponse = await app.handle(
    new Request("https://matters.example/admin/review-queue?surface=content-delivery&actorHandle=alice&status=partial"),
  );
  assert.equal(reviewQueueResponse.status, 200);
  const reviewQueuePayload = await reviewQueueResponse.json();
  assert.equal(reviewQueuePayload.appliedFilters.actorHandle, "alice");
  assert.equal(reviewQueuePayload.appliedFilters.status, "partial");
  assert.equal(reviewQueuePayload.appliedFilters.replayedOnly, false);
  assert.equal(reviewQueuePayload.appliedFilters.replayableOnly, false);
  assert.equal(reviewQueuePayload.summary.contentsWithIssues, 2);
  assert.equal(reviewQueuePayload.summary.activities.total, 2);
  assert.equal(reviewQueuePayload.summary.activities.partial, 2);
  assert.equal(reviewQueuePayload.summary.uniqueActivities.total, 1);
  assert.equal(reviewQueuePayload.summary.uniqueActivities.partial, 1);
  assert.equal(reviewQueuePayload.summary.replayableItems, 1);
  assert.equal(reviewQueuePayload.fullSummary.contentsWithIssues, reviewQueuePayload.summary.contentsWithIssues);
  assert.equal(reviewQueuePayload.contractVersion, 1);
  assert.equal(reviewQueuePayload.canonicalSummaryKey, "summaries.current");
  assert.equal(reviewQueuePayload.currentSummaryMode, "filtered");
  assert.deepEqual(reviewQueuePayload.legacySummaryKeys, [
    "summary",
    "fullSummary",
    "filteredSummary",
    "viewSummary",
  ]);
  assert.equal(reviewQueuePayload.contract.version, 1);
  assert.equal(reviewQueuePayload.contract.canonicalSummaryKey, "summaries.current");
  assert.equal(reviewQueuePayload.contract.currentSummaryMode, "filtered");
  assert.equal(reviewQueuePayload.contract.legacyFields.summary.replacement, "summaries.full");
  assert.equal(reviewQueuePayload.contract.legacyFields.viewSummary.replacement, "summaries.current");
  assert.equal(reviewQueuePayload.summaryAliases.summary, "summaries.full");
  assert.equal(reviewQueuePayload.summaryAliases.viewSummary, "summaries.current");
  assert.equal(reviewQueuePayload.summaries.full.contentsWithIssues, reviewQueuePayload.fullSummary.contentsWithIssues);
  assert.equal(reviewQueuePayload.filteredSummary.contents, 2);
  assert.equal(reviewQueuePayload.summaries.filtered.contents, reviewQueuePayload.filteredSummary.contents);
  assert.equal(reviewQueuePayload.summaries.current.contents, reviewQueuePayload.filteredSummary.contents);
  assert.equal(reviewQueuePayload.viewSummary.contents, reviewQueuePayload.filteredSummary.contents);
  assert.equal(reviewQueuePayload.filteredSummary.activities.partial, 2);
  assert.equal(reviewQueuePayload.filteredSummary.replayableItems, 1);
  assert.equal(reviewQueuePayload.items.length, 2);
  assert.equal(
    reviewQueuePayload.items.some((entry) => entry.contentId === "https://remote.example/notes/review-queue-root-1"),
    true,
  );
  assert.equal(
    reviewQueuePayload.items.some((entry) => entry.contentId === "https://matters.example/notes/review-queue-reply-1"),
    true,
  );
  assert.equal(reviewQueuePayload.items[0].activities[0].delivery.status, "partial");
  assert.equal(reviewQueuePayload.items[0].activities[0].delivery.recipients.deadLetter, 1);
  assert.equal(reviewQueuePayload.items[0].ops.replayableItems, 1);
  assert.equal(reviewQueuePayload.items[0].ops.replayCount, 0);
  assert.equal(reviewQueuePayload.items[0].ops.staleSince !== null, true);

  const replayableQueueResponse = await app.handle(
    new Request("https://matters.example/admin/review-queue?surface=content-delivery&actorHandle=alice&replayableOnly=true"),
  );
  assert.equal(replayableQueueResponse.status, 200);
  const replayableQueuePayload = await replayableQueueResponse.json();
  assert.equal(replayableQueuePayload.items.length, 2);
  assert.equal(replayableQueuePayload.filteredSummary.contents, 2);
  assert.equal(replayableQueuePayload.filteredSummary.replayableItems, 1);
  assert.equal(replayableQueuePayload.items.every((item) => item.ops.replayableItems > 0), true);

  const deadLetterId = store.getDeadLetters({ limit: 5 })[0].id;
  const replayRecord = {
    replayedAt: "2026-03-21T00:04:00.000Z",
    replayedBy: "tester",
    reason: "review queue replay filter",
  };
  await store.replayDeadLetter(deadLetterId, replayRecord);
  await store.recordAuditEvent({
    timestamp: replayRecord.replayedAt,
    event: "dead-letter.replayed",
    actorHandle: "alice",
    itemId: deadLetterId,
    replayedBy: replayRecord.replayedBy,
    reason: replayRecord.reason,
    surface: "admin-review-queue",
  });

  const replayedQueueResponse = await app.handle(
    new Request("https://matters.example/admin/review-queue?surface=content-delivery&actorHandle=alice&replayedOnly=true"),
  );
  assert.equal(replayedQueueResponse.status, 200);
  const replayedQueuePayload = await replayedQueueResponse.json();
  assert.equal(replayedQueuePayload.items.length, 2);
  assert.equal(replayedQueuePayload.filteredSummary.contents, 2);
  assert.equal(replayedQueuePayload.filteredSummary.activities.total, 2);
  assert.equal(replayedQueuePayload.items.every((item) => item.ops.replayCount === 1), true);
  assert.equal(replayedQueuePayload.items.every((item) => item.ops.lastReplayAt === replayRecord.replayedAt), true);

  const replayedDashboardResponse = await app.handle(
    new Request("https://matters.example/admin/dashboard?actorHandle=alice&replayedOnly=true"),
  );
  assert.equal(replayedDashboardResponse.status, 200);
  const replayedDashboardPayload = await replayedDashboardResponse.json();
  assert.equal(replayedDashboardPayload.contentDelivery.appliedFilters.actorHandle, "alice");
  assert.equal(replayedDashboardPayload.contentDelivery.appliedFilters.replayedOnly, true);
  assert.equal(replayedDashboardPayload.contentDelivery.appliedFilters.replayableOnly, false);
  assert.equal(
    replayedDashboardPayload.contentDelivery.fullSummary.contentsWithIssues,
    replayedDashboardPayload.contentDelivery.summary.contentsWithIssues,
  );
  assert.equal(
    replayedDashboardPayload.contentDelivery.summaries.full.contentsWithIssues,
    replayedDashboardPayload.contentDelivery.fullSummary.contentsWithIssues,
  );
  assert.equal(replayedDashboardPayload.contentDelivery.filteredSummary.contents, 2);
  assert.equal(
    replayedDashboardPayload.contentDelivery.summaries.filtered.contents,
    replayedDashboardPayload.contentDelivery.filteredSummary.contents,
  );
  assert.equal(
    replayedDashboardPayload.contentDelivery.summaries.current.contents,
    replayedDashboardPayload.contentDelivery.filteredSummary.contents,
  );
  assert.equal(
    replayedDashboardPayload.contentDelivery.viewSummary.contents,
    replayedDashboardPayload.contentDelivery.filteredSummary.contents,
  );
  assert.equal(replayedDashboardPayload.contentDelivery.filteredSummary.activities.total, 2);
  assert.equal(replayedDashboardPayload.contentDelivery.items.length, 2);
});

test("admin local content delivery activities dedupes cross-content activity context", async () => {
  const harness = await createHarness();
  const { config, store, remoteKeys } = harness;
  const app = createGatewayApp({
    config: {
      ...config,
      delivery: {
        ...config.delivery,
        maxAttempts: 1,
      },
    },
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("temporary outage");
          error.status = 503;
          error.temporary = true;
          throw error;
        }
        return { status: 202 };
      },
    },
  });

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify({
        "@context": "https://www.w3.org/ns/activitystreams",
        id: "https://remote.example/activities/activity-index-root-1",
        type: "Create",
        actor: "https://remote.example/users/zoe",
        object: {
          id: "https://remote.example/notes/activity-index-root-1",
          type: "Note",
          content: "Activity index root body",
          published: "2026-03-21T00:00:00.000Z",
          to: ["https://www.w3.org/ns/activitystreams#Public"],
        },
      }),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const createResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/activity-index-reply-1",
          type: "Note",
          content: "Activity index reply body",
          inReplyTo: "https://remote.example/notes/activity-index-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );
  assert.equal(createResponse.status, 202);

  const activityIndexResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery/activities?actorHandle=alice&status=partial&actionType=reply",
    ),
  );
  assert.equal(activityIndexResponse.status, 200);
  const activityIndexPayload = await activityIndexResponse.json();
  assert.equal(activityIndexPayload.summary.total, 1);
  assert.equal(activityIndexPayload.summary.partial, 1);
  assert.equal(activityIndexPayload.items.length, 1);
  assert.equal(activityIndexPayload.items[0].actionType, "reply");
  assert.equal(activityIndexPayload.items[0].delivery.status, "partial");
  assert.equal(activityIndexPayload.items[0].ops.replayableItems, 1);
  assert.equal(activityIndexPayload.items[0].contentRefs.length, 2);
  assert.equal(
    activityIndexPayload.items[0].contentRefs.some(
      (entry) => entry.contentId === "https://remote.example/notes/activity-index-root-1",
    ),
    true,
  );
  assert.equal(
    activityIndexPayload.items[0].contentRefs.some(
      (entry) => entry.contentId === "https://matters.example/notes/activity-index-reply-1",
    ),
    true,
  );

  const replayableActivityIndexResponse = await app.handle(
    new Request(
      "https://matters.example/admin/local-content/delivery/activities?actorHandle=alice&status=partial&actionType=reply&replayableOnly=true",
    ),
  );
  assert.equal(replayableActivityIndexResponse.status, 200);
  const replayableActivityIndexPayload = await replayableActivityIndexResponse.json();
  assert.equal(replayableActivityIndexPayload.items.length, 1);
  assert.equal(replayableActivityIndexPayload.items[0].ops.replayableItems, 1);
});

test("admin local content delivery activity replay replays dead-letter recipients once per unique activity", async () => {
  const harness = await createHarness();
  const { config, store, remoteKeys } = harness;
  let shouldFail = true;
  const replayDeliveries = [];
  const app = createGatewayApp({
    config: {
      ...config,
      delivery: {
        ...config.delivery,
        maxAttempts: 1,
      },
    },
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (shouldFail && item.targetActorId === "https://reply.example/users/mika") {
          const error = new Error("temporary outage");
          error.status = 503;
          error.temporary = true;
          throw error;
        }
        replayDeliveries.push(item);
        return { status: 202 };
      },
    },
  });

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify({
        "@context": "https://www.w3.org/ns/activitystreams",
        id: "https://remote.example/activities/activity-replay-root-1",
        type: "Create",
        actor: "https://remote.example/users/zoe",
        object: {
          id: "https://remote.example/notes/activity-replay-root-1",
          type: "Note",
          content: "Activity replay root body",
          published: "2026-03-21T00:00:00.000Z",
          to: ["https://www.w3.org/ns/activitystreams#Public"],
        },
      }),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const createResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/activity-replay-reply-1",
          type: "Note",
          content: "Activity replay reply body",
          inReplyTo: "https://remote.example/notes/activity-replay-root-1",
        },
        includeFollowers: false,
        targetActorIds: ["https://remote.example/users/zoe", "https://reply.example/users/mika"],
      }),
    }),
  );
  assert.equal(createResponse.status, 202);
  const createPayload = await createResponse.json();

  const beforeReplayResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-content/delivery/activities?actorHandle=alice&activityId=${encodeURIComponent(createPayload.activityId)}`,
    ),
  );
  assert.equal(beforeReplayResponse.status, 200);
  const beforeReplayPayload = await beforeReplayResponse.json();
  assert.equal(beforeReplayPayload.items.length, 1);
  assert.equal(beforeReplayPayload.items[0].delivery.status, "partial");
  assert.equal(beforeReplayPayload.items[0].delivery.replayableQueueItemIds.length, 1);
  assert.equal(beforeReplayPayload.items[0].ops.replayableItems, 1);

  shouldFail = false;
  const replayResponse = await app.handle(
    new Request("https://matters.example/admin/local-content/delivery/activities/replay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
        activityId: createPayload.activityId,
        replayedBy: "tester",
        reason: "activity level recovery",
      }),
    }),
  );
  assert.equal(replayResponse.status, 200);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.status, "replayed");
  assert.equal(replayPayload.items.length, 1);
  assert.equal(replayPayload.contentRefs.length, 2);
  assert.equal(replayDeliveries.length, 2);

  const afterReplayResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-content/delivery/activities?actorHandle=alice&activityId=${encodeURIComponent(createPayload.activityId)}`,
    ),
  );
  assert.equal(afterReplayResponse.status, 200);
  const afterReplayPayload = await afterReplayResponse.json();
  assert.equal(afterReplayPayload.items.length, 1);
  assert.equal(afterReplayPayload.items[0].delivery.status, "delivered");
  assert.equal(afterReplayPayload.items[0].delivery.replayableQueueItemIds.length, 0);

  const replayedOnlyResponse = await app.handle(
    new Request(
      `https://matters.example/admin/local-content/delivery/activities?actorHandle=alice&activityId=${encodeURIComponent(createPayload.activityId)}&replayedOnly=true`,
    ),
  );
  assert.equal(replayedOnlyResponse.status, 200);
  const replayedOnlyPayload = await replayedOnlyResponse.json();
  assert.equal(replayedOnlyPayload.items.length, 1);
  assert.equal(replayedOnlyPayload.items[0].ops.replayCount, 1);
  assert.equal(replayedOnlyPayload.items[0].ops.lastReplayAt !== null, true);
});

test("admin local content keeps orphan reply contentId stable before root arrives", async () => {
  const { app, remoteKeys } = await createHarness();
  const replyActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/partial-reply-1",
    type: "Create",
    actor: "https://remote.example/users/zoe",
    object: {
      id: "https://remote.example/notes/partial-reply-1",
      type: "Note",
      content: "Partial reply body",
      inReplyTo: "https://remote.example/notes/partial-root-1",
      published: "2026-03-21T00:01:00.000Z",
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    },
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(replyActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/partial-root-1",
    ),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.contentId, "https://remote.example/notes/partial-root-1");
  assert.equal(payload.item.rootObjectId, null);
  assert.equal(payload.item.rootMapping, null);
  assert.equal(payload.item.status, "partial");
  assert.equal(payload.item.preview, "Partial reply body");
  assert.equal(payload.item.latestObjectId, "https://remote.example/notes/partial-reply-1");
});

test("admin local content marks engagement-only thread as partial", async () => {
  const { app, remoteKeys } = await createHarness();
  const likeActivity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/partial-like-1",
    type: "Like",
    actor: "https://remote.example/users/zoe",
    object: "https://remote.example/notes/missing-root-1",
  };

  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(likeActivity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  const response = await app.handle(
    new Request(
      "https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/missing-root-1",
    ),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.item.contentId, "https://remote.example/notes/missing-root-1");
  assert.equal(payload.item.rootObjectId, null);
  assert.equal(payload.item.metrics.engagements, 1);
  assert.equal(payload.item.metrics.likes, 1);
  assert.equal(payload.item.actionMatrix.state.threadResolved, false);
  assert.equal(payload.item.status, "partial");
});

test("admin local domain reconcile backfills mentions and resolves orphan replies", async () => {
  const { app, store } = await createHarness();
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/reconcile-root-1",
    activityId: "https://remote.example/activities/reconcile-root-1",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "create",
    content: "root",
    summary: "",
    url: null,
    inReplyTo: null,
    conversationId: null,
    threadId: "https://remote.example/notes/reconcile-root-1",
    threadRootId: "https://remote.example/notes/reconcile-root-1",
    threadResolved: true,
    replyDepth: 0,
    participantActorIds: ["https://remote.example/users/zoe", "https://matters.example/users/alice"],
    localParticipantHandles: ["alice"],
    mentions: [],
    publishedAt: "2026-03-21T00:00:00.000Z",
    tags: [],
    visibility: "public",
    receivedAt: "2026-03-21T00:00:00.000Z",
  });
  await store.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/reconcile-reply-1",
    activityId: "https://remote.example/activities/reconcile-reply-1",
    actorHandle: "alice",
    remoteActorId: "https://remote.example/users/zoe",
    activityType: "Create",
    objectType: "Note",
    mapping: "reply",
    content: "reply @bob@matters.example",
    summary: "",
    url: null,
    inReplyTo: "https://remote.example/notes/reconcile-root-1",
    conversationId: null,
    threadId: "https://remote.example/notes/reconcile-root-1",
    threadRootId: "https://remote.example/notes/reconcile-root-1",
    threadResolved: false,
    replyDepth: 1,
    participantActorIds: ["https://remote.example/users/zoe", "https://matters.example/users/alice"],
    localParticipantHandles: ["alice"],
    mentions: [],
    publishedAt: "2026-03-21T00:01:00.000Z",
    tags: [],
    visibility: "public",
    receivedAt: "2026-03-21T00:01:00.000Z",
  });

  const dryRunResponse = await app.handle(
    new Request("https://matters.example/admin/local-domain/reconcile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
        dryRun: true,
      }),
    }),
  );

  assert.equal(dryRunResponse.status, 200);
  const dryRunPayload = await dryRunResponse.json();
  assert.equal(dryRunPayload.reports[0].dryRun, true);
  assert.deepEqual(store.getLocalConversations("alice"), []);

  const reconcileResponse = await app.handle(
    new Request("https://matters.example/admin/local-domain/reconcile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
      }),
    }),
  );

  assert.equal(reconcileResponse.status, 200);
  const reconcilePayload = await reconcileResponse.json();
  assert.equal(reconcilePayload.reports[0].dryRun, false);
  assert.equal(reconcilePayload.reports[0].mentionsBackfilled, 1);
  assert.equal(reconcilePayload.reports[0].objectsResolved, 1);
  assert.equal(reconcilePayload.reports[0].contentCount, 1);

  const localDomainResponse = await app.handle(
    new Request("https://matters.example/admin/local-domain?actorHandle=alice&threadId=https://remote.example/notes/reconcile-root-1"),
  );

  assert.equal(localDomainResponse.status, 200);
  const payload = await localDomainResponse.json();
  assert.equal(payload.thread.objectCount, 2);
  assert.equal(payload.thread.mentionActorIds.includes("https://matters.example/users/bob"), true);

  const localContentResponse = await app.handle(
    new Request("https://matters.example/admin/local-content?actorHandle=alice&contentId=https://remote.example/notes/reconcile-root-1"),
  );
  assert.equal(localContentResponse.status, 200);
  const localContentPayload = await localContentResponse.json();
  assert.equal(localContentPayload.item.metrics.replies, 1);
  assert.equal(localContentPayload.item.mentionActorIds.includes("https://matters.example/users/bob"), true);
});

test("outbox engagement fans out Like to explicit targets", async () => {
  const { app, deliveries } = await createHarness();

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/engagement", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "Like",
        objectId: "https://remote.example/objects/post-2",
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "like");
  assert.equal(payload.recipients[0], "https://remote.example/users/zoe");
  assert.equal(deliveries[0].activity.type, "Like");
  assert.equal(deliveries[0].activity.object, "https://remote.example/objects/post-2");
});

test("outbox Create resolves remote acct mentions through remote actor directory", async () => {
  const { config, store, deliveries } = await createHarness();
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        deliveries.push(item);
        return { status: 202 };
      },
    },
    remoteActorDirectory: {
      async resolve(actorId) {
        if (actorId === "https://elsewhere.example/users/mia") {
          return {
            actorId,
            keyId: `${actorId}#main-key`,
            inbox: "https://elsewhere.example/users/mia/inbox",
            sharedInbox: "https://elsewhere.example/inbox",
            publicKeyPem: pemPair().publicKeyPem,
          };
        }

        throw new Error(`unexpected actor ${actorId}`);
      },
      async refresh(actorId) {
        return this.resolve(actorId);
      },
      async resolveAccount(account) {
        assert.equal(account, "@mia@elsewhere.example");
        return {
          actorId: "https://elsewhere.example/users/mia",
          keyId: "https://elsewhere.example/users/mia#main-key",
          inbox: "https://elsewhere.example/users/mia/inbox",
          sharedInbox: "https://elsewhere.example/inbox",
          publicKeyPem: pemPair().publicKeyPem,
        };
      },
    },
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/replies/reply-remote-mention-1",
          type: "Note",
          content: "Ping @mia@elsewhere.example",
        },
        includeFollowers: false,
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mentions.includes("https://elsewhere.example/users/mia"), true);
  assert.equal(payload.recipients[0], "https://elsewhere.example/users/mia");
  assert.equal(
    deliveries[0].activity.object.tag.some((entry) => entry.type === "Mention" && entry.href === "https://elsewhere.example/users/mia"),
    true,
  );
});

test("outbox Create skips retryable remote mention failures and exposes admin mention state", async () => {
  const { config, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  let currentTime = new Date("2026-03-21T00:00:00.000Z");
  let resolveAttempts = 0;
  const app = createGatewayApp({
    config,
    store,
    clock: () => new Date(currentTime),
    deliveryClient: {
      async deliver({ item }) {
        deliveries.push(item);
        return { status: 202 };
      },
    },
    remoteActorDirectory: {
      async resolve(actorId) {
        return config.remoteActors[actorId]
          ? {
              actorId,
              ...config.remoteActors[actorId],
            }
          : null;
      },
      async refresh(actorId) {
        return this.resolve(actorId);
      },
      async resolveAccount(account) {
        resolveAttempts += 1;
        assert.equal(account, "@mia@elsewhere.example");
        const error = new Error("WebFinger temporarily unavailable");
        error.code = "webfinger_http_error";
        error.stage = "webfinger";
        error.status = 503;
        error.temporary = true;
        throw error;
      },
    },
  });

  const firstResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/retryable-mention-1",
          type: "Note",
          content: "Ping @mia@elsewhere.example",
        },
      }),
    }),
  );

  assert.equal(firstResponse.status, 202);
  const firstPayload = await firstResponse.json();
  assert.equal(firstPayload.recipients.includes("https://remote.example/users/zoe"), true);
  assert.equal(firstPayload.mentionResolution.skipped[0].status, "retryable_error");
  assert.equal(firstPayload.mentionResolution.skipped[0].failure.code, "webfinger_http_error");
  assert.equal(resolveAttempts, 1);
  assert.equal(
    deliveries[0].activity.object.tag.some(
      (entry) => entry.type === "Mention" && entry.name === "@mia@elsewhere.example" && !("href" in entry),
    ),
    true,
  );

  currentTime = new Date("2026-03-21T00:01:00.000Z");
  const secondResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/retryable-mention-2",
          type: "Note",
          content: "Ping again @mia@elsewhere.example",
        },
      }),
    }),
  );

  assert.equal(secondResponse.status, 202);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.mentionResolution.skipped[0].cacheHit, true);
  assert.equal(resolveAttempts, 1);

  const adminResponse = await app.handle(
    new Request("https://matters.example/admin/remote-mentions?status=retryable_error&account=@mia@elsewhere.example"),
  );
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  assert.equal(adminPayload.item.account, "@mia@elsewhere.example");
  assert.equal(adminPayload.item.status, "retryable_error");
  assert.equal(adminPayload.items.length, 1);

  const evidenceResponse = await app.handle(
    new Request("https://matters.example/admin/evidence?category=mention-resolution"),
  );
  assert.equal(evidenceResponse.status, 200);
  const evidencePayload = await evidenceResponse.json();
  assert.equal(evidencePayload.items.length, 1);
  assert.equal(evidencePayload.items[0].snapshot.failure.code, "webfinger_http_error");
});

test("outbox Create preserves unresolved mention tags on permanent mention failures", async () => {
  const { config, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver({ item }) {
        deliveries.push(item);
        return { status: 202 };
      },
    },
    remoteActorDirectory: {
      async resolve(actorId) {
        return config.remoteActors[actorId]
          ? {
              actorId,
              ...config.remoteActors[actorId],
            }
          : null;
      },
      async refresh(actorId) {
        return this.resolve(actorId);
      },
      async resolveAccount() {
        const error = new Error("Remote account did not expose an ActivityPub actor link");
        error.code = "webfinger_missing_actor_link";
        error.stage = "webfinger";
        error.temporary = false;
        throw error;
      },
    },
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/notes/permanent-mention-1",
          type: "Note",
          content: "Ping @mia@elsewhere.example",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mentionResolution.skipped[0].status, "permanent_error");
  assert.equal(payload.mentionResolution.skipped[0].nextRetryAt, null);
  assert.equal(
    deliveries[0].activity.object.tag.some(
      (entry) => entry.type === "Mention" && entry.name === "@mia@elsewhere.example" && !("href" in entry),
    ),
    true,
  );
});

test("outbox engagement fans out Announce to followers and explicit targets", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/engagement", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "Announce",
        objectId: "https://remote.example/objects/post-3",
        targetActorIds: ["https://remote.example/users/zoe"],
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "announce");
  assert.equal(payload.recipients.length, 1);
  assert.equal(deliveries[0].activity.type, "Announce");
  assert.equal(deliveries[0].activity.cc.includes("https://matters.example/users/alice/followers"), true);
});

test("admin rate limit endpoints expose policies and counters", async () => {
  const { app, store } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const createPolicyResponse = await app.handle(
    new Request("https://matters.example/admin/rate-limits", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        policyKey: "actor-outbound",
        limit: 1,
        windowMs: 60000,
        createdBy: "tester",
      }),
    }),
  );
  assert.equal(createPolicyResponse.status, 201);

  const firstUpdate = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/rate-limit-1",
          type: "Article",
          content: "first",
        },
      }),
    }),
  );
  assert.equal(firstUpdate.status, 202);

  const secondUpdate = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/rate-limit-2",
          type: "Article",
          content: "second",
        },
      }),
    }),
  );
  assert.equal(secondUpdate.status, 429);

  const listPoliciesResponse = await app.handle(new Request("https://matters.example/admin/rate-limits"));
  const policiesPayload = await listPoliciesResponse.json();
  assert.equal(policiesPayload.items[0].policyKey, "actor-outbound");

  const stateResponse = await app.handle(new Request("https://matters.example/admin/rate-limit-state"));
  const statePayload = await stateResponse.json();
  assert.equal(statePayload.items[0].counterKey, "actor-outbound:alice");
  assert.equal(statePayload.items[0].count, 2);
});

test("legal takedown creates delete propagation and appears in dashboard", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const createResponse = await app.handle(
    new Request("https://matters.example/admin/legal-takedowns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        actorHandle: "alice",
        objectId: "https://matters.example/articles/legal-case-1",
        reason: "court order",
        createdBy: "legal-team",
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.item.status, "open");
  assert.equal(deliveries.at(-1).activity.type, "Delete");

  const updateBlockedResponse = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/legal-case-1",
          type: "Article",
          content: "should be blocked",
        },
      }),
    }),
  );
  assert.equal(updateBlockedResponse.status, 451);

  const listResponse = await app.handle(new Request("https://matters.example/admin/legal-takedowns?status=open"));
  const listPayload = await listResponse.json();
  assert.equal(listPayload.items.length, 1);

  const evidenceResponse = await app.handle(
    new Request("https://matters.example/admin/evidence?category=legal-takedown&actorHandle=alice"),
  );
  const evidencePayload = await evidenceResponse.json();
  assert.equal(evidencePayload.items.length, 1);
  assert.equal(evidencePayload.items[0].caseId, createPayload.item.caseId);
  assert.equal(evidencePayload.items[0].snapshot.propagation.deliveries.length, 1);

  const dashboardResponse = await app.handle(new Request("https://matters.example/admin/dashboard"));
  const dashboardPayload = await dashboardResponse.json();
  assert.equal(dashboardPayload.summary.legalTakedownsOpen, 1);
  assert.equal(dashboardPayload.summary.actorSuspensions, 0);
  assert.equal(dashboardPayload.summary.evidenceRecords, 1);

  const resolveResponse = await app.handle(
    new Request("https://matters.example/admin/legal-takedowns/resolve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        caseId: createPayload.item.caseId,
        resolution: "fulfilled",
        resolvedBy: "legal-team",
      }),
    }),
  );
  assert.equal(resolveResponse.status, 200);
});

test("outbound delivery is blocked for blocked domains", async () => {
  const { app, store } = await createHarness();
  await store.upsertDomainBlock({
    domain: "remote.example",
    reason: "malware",
    source: "test",
    blockedAt: "2026-03-21T00:00:00.000Z",
  });
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/blocked-update",
          type: "Article",
          content: "Updated content",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.deliveries[0].status, "dead-letter");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.deadLetters.length, 1);
  assert.equal(snapshot.auditLog.at(-1).event, "domain-block.outbound-enforced");
});

test("remote actor deny policy blocks outbound delivery", async () => {
  const { app, store } = await createHarness();
  await store.upsertRemoteActorPolicy({
    actorId: "https://remote.example/users/zoe",
    inboundAction: "allow",
    outboundAction: "deny",
    reason: "outbound deny test",
    source: "test",
  });
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/remote-actor-policy-outbound",
          type: "Article",
          content: "Updated content",
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.deliveries[0].status, "dead-letter");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.deadLetters.length, 1);
  assert.equal(snapshot.auditLog.at(-1).event, "remote-actor-policy.outbound-enforced");
});

test("outbox Delete fans out to accepted followers", async () => {
  const { app, store, deliveries } = await createHarness();
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  const response = await app.handle(
    new Request("https://matters.example/users/alice/outbox/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        objectId: "https://matters.example/articles/hello-fediverse",
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mapping, "delete");
  assert.equal(payload.deliveries.length, 1);
  assert.equal(deliveries[0].activity.type, "Delete");
  assert.equal(deliveries[0].activity.object, "https://matters.example/articles/hello-fediverse");
});

test("manual approval actor returns Reject and does not persist follower", async () => {
  const { app, store, deliveries, remoteKeys } = await createHarness();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-2",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/bob",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/bob/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.status, "rejected");
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].activity.type, "Reject");

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors.bob?.followers?.["https://remote.example/users/zoe"], undefined);
});

test("invalid signature is rejected", async () => {
  const { app } = await createHarness();
  const wrongKeys = pemPair();
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-3",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: wrongKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 401);
});

test("remote actor can be discovered and cached without static seed data", async () => {
  const localKeys = pemPair();
  const remoteKeys = pemPair();
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-core-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  const config = {
    instance: {
      domain: "matters.example",
      baseUrl: "https://matters.example",
      title: "Matters Example",
      summary: "Test instance",
      softwareName: "matters-gateway-core",
      softwareVersion: "0.1.0",
      openRegistrations: false,
    },
    actors: {
      alice: {
        handle: "alice",
        displayName: "Alice",
        summary: "Test actor",
        autoAcceptFollows: true,
        aliases: [],
        profileUrl: "https://matters.example/@alice",
        actorUrl: "https://matters.example/users/alice",
        inboxUrl: "https://matters.example/users/alice/inbox",
        outboxUrl: "https://matters.example/users/alice/outbox",
        followersUrl: "https://matters.example/users/alice/followers",
        followingUrl: "https://matters.example/users/alice/following",
        publicKeyPem: localKeys.publicKeyPem,
        privateKeyPem: localKeys.privateKeyPem,
        keyId: "https://matters.example/users/alice#main-key",
      },
    },
    remoteActors: {},
    remoteDiscovery: {
      cacheTtlMs: 60 * 60 * 1000,
    },
    delivery: {
      maxAttempts: 2,
      userAgent: "MattersGatewayCore/Test",
    },
  };

  const store = new FileStateStore({
    stateFile: path.join(tmpDir, "state.json"),
  });
  await store.init();

  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
    remoteActorDirectory: {
      async resolve(actorId) {
        return {
          actorId,
          keyId: `${actorId}#main-key`,
          inbox: "https://remote.example/users/zoe/inbox",
          sharedInbox: "https://remote.example/inbox",
          publicKeyPem: remoteKeys.publicKeyPem,
          source: "discovered",
        };
      },
      async refresh(actorId) {
        return {
          actorId,
          keyId: `${actorId}#main-key`,
          inbox: "https://remote.example/users/zoe/inbox",
          sharedInbox: "https://remote.example/inbox",
          publicKeyPem: remoteKeys.publicKeyPem,
          source: "refreshed",
        };
      },
    },
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-5",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors.alice.followers["https://remote.example/users/zoe"].status, "accepted");
});

test("key refresh path re-fetches remote actor after signature rotation", async () => {
  const localKeys = pemPair();
  const staleRemoteKeys = pemPair();
  const freshRemoteKeys = pemPair();
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-core-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  const config = {
    instance: {
      domain: "matters.example",
      baseUrl: "https://matters.example",
      title: "Matters Example",
      summary: "Test instance",
      softwareName: "matters-gateway-core",
      softwareVersion: "0.1.0",
      openRegistrations: false,
    },
    actors: {
      alice: {
        handle: "alice",
        displayName: "Alice",
        summary: "Test actor",
        autoAcceptFollows: true,
        aliases: [],
        profileUrl: "https://matters.example/@alice",
        actorUrl: "https://matters.example/users/alice",
        inboxUrl: "https://matters.example/users/alice/inbox",
        outboxUrl: "https://matters.example/users/alice/outbox",
        followersUrl: "https://matters.example/users/alice/followers",
        followingUrl: "https://matters.example/users/alice/following",
        publicKeyPem: localKeys.publicKeyPem,
        privateKeyPem: localKeys.privateKeyPem,
        keyId: "https://matters.example/users/alice#main-key",
      },
    },
    remoteActors: {
      "https://remote.example/users/zoe": {
        keyId: "https://remote.example/users/zoe#main-key",
        inbox: "https://remote.example/users/zoe/inbox",
        publicKeyPem: staleRemoteKeys.publicKeyPem,
      },
    },
    remoteDiscovery: {
      cacheTtlMs: 60 * 60 * 1000,
    },
    delivery: {
      maxAttempts: 2,
      userAgent: "MattersGatewayCore/Test",
    },
  };

  const store = new FileStateStore({
    stateFile: path.join(tmpDir, "state.json"),
  });
  await store.init();

  let refreshCount = 0;
  const app = createGatewayApp({
    config,
    store,
    deliveryClient: {
      async deliver() {
        return { status: 202 };
      },
    },
    remoteActorDirectory: {
      async resolve(actorId) {
        return {
          actorId,
          keyId: `${actorId}#main-key`,
          inbox: "https://remote.example/users/zoe/inbox",
          publicKeyPem: staleRemoteKeys.publicKeyPem,
          source: "seed",
        };
      },
      async refresh(actorId) {
        refreshCount += 1;
        return {
          actorId,
          keyId: `${actorId}#main-key`,
          inbox: "https://remote.example/users/zoe/inbox",
          publicKeyPem: freshRemoteKeys.publicKeyPem,
          source: "refreshed",
        };
      },
    },
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-6",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  const response = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: freshRemoteKeys.privateKeyPem,
    }),
  );

  assert.equal(response.status, 202);
  assert.equal(refreshCount, 1);
});

test("temporary delivery failure schedules retry and then dead-letters", async () => {
  const localKeys = pemPair();
  const remoteKeys = pemPair();
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-core-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  const config = {
    instance: {
      domain: "matters.example",
      baseUrl: "https://matters.example",
      title: "Matters Example",
      summary: "Test instance",
      softwareName: "matters-gateway-core",
      softwareVersion: "0.1.0",
      openRegistrations: false,
    },
    actors: {
      alice: {
        handle: "alice",
        displayName: "Alice",
        summary: "Test actor",
        autoAcceptFollows: true,
        aliases: [],
        profileUrl: "https://matters.example/@alice",
        actorUrl: "https://matters.example/users/alice",
        inboxUrl: "https://matters.example/users/alice/inbox",
        outboxUrl: "https://matters.example/users/alice/outbox",
        followersUrl: "https://matters.example/users/alice/followers",
        followingUrl: "https://matters.example/users/alice/following",
        publicKeyPem: localKeys.publicKeyPem,
        privateKeyPem: localKeys.privateKeyPem,
        keyId: "https://matters.example/users/alice#main-key",
      },
    },
    remoteActors: {
      "https://remote.example/users/zoe": {
        keyId: "https://remote.example/users/zoe#main-key",
        inbox: "https://remote.example/users/zoe/inbox",
        publicKeyPem: remoteKeys.publicKeyPem,
      },
    },
    delivery: {
      maxAttempts: 2,
      userAgent: "MattersGatewayCore/Test",
    },
  };

  const store = new FileStateStore({
    stateFile: path.join(tmpDir, "state.json"),
  });
  await store.init();

  const failingClient = {
    async deliver() {
      const error = new Error("remote inbox unavailable");
      error.status = 503;
      error.temporary = true;
      throw error;
    },
  };

  const app = createGatewayApp({
    config,
    store,
    deliveryClient: failingClient,
  });
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-4",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const body = JSON.stringify(activity);
  await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body,
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.outboundQueue[0].status, "pending");
  assert.equal(snapshot.outboundQueue[0].attempts, 1);

  await app.handle(
    new Request("https://matters.example/jobs/delivery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: snapshot.outboundQueue[0].id }),
    }),
  );

  snapshot = store.getSnapshot();
  assert.equal(snapshot.outboundQueue[0].status, "dead-letter");
  assert.equal(snapshot.deadLetters.length, 1);
  assert.equal(snapshot.evidenceRecords.at(-1).category, "delivery-dead-letter");
  assert.equal(snapshot.evidenceRecords.at(-1).queueItemId, snapshot.outboundQueue[0].id);
});

test("dead letter can be listed and manually replayed", async () => {
  const harness = await createHarness();
  const { config, store, remoteKeys } = harness;
  let shouldFail = true;
  const replayDeliveries = [];
  const app = createGatewayApp({
    config: {
      ...config,
      delivery: {
        ...config.delivery,
        maxAttempts: 1,
      },
    },
    store,
    deliveryClient: {
      async deliver({ item }) {
        if (shouldFail) {
          const error = new Error("temporary outage");
          error.status = 503;
          error.temporary = true;
          throw error;
        }

        replayDeliveries.push(item);
        return { status: 202 };
      },
    },
  });

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.example/activities/follow-replay-1",
    type: "Follow",
    actor: "https://remote.example/users/zoe",
    object: "https://matters.example/users/alice",
  };
  const firstResponse = await app.handle(
    signedRequest({
      method: "POST",
      url: "https://matters.example/users/alice/inbox",
      body: JSON.stringify(activity),
      keyId: "https://remote.example/users/zoe#main-key",
      privateKeyPem: remoteKeys.privateKeyPem,
    }),
  );
  assert.equal(firstResponse.status, 202);

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.deadLetters.length, 1);
  const deadLetterId = snapshot.deadLetters[0].id;

  const listResponse = await app.handle(new Request("https://matters.example/admin/dead-letters"));
  const listPayload = await listResponse.json();
  assert.equal(listPayload.items.length, 1);
  assert.equal(listPayload.items[0].id, deadLetterId);

  shouldFail = false;
  const replayResponse = await app.handle(
    new Request("https://matters.example/admin/dead-letters/replay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: deadLetterId,
        replayedBy: "tester",
        reason: "remote inbox recovered",
      }),
    }),
  );
  assert.equal(replayResponse.status, 202);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.status, "replayed");
  assert.equal(replayPayload.delivery.status, "delivered");
  assert.equal(replayDeliveries.length, 1);

  snapshot = store.getSnapshot();
  assert.equal(snapshot.outboundQueue[0].status, "delivered");
  assert.equal(snapshot.deadLetters[0].status, "replayed");
  assert.equal(snapshot.deadLetters[0].replayHistory.length, 1);
  assert.equal(snapshot.auditLog.at(-1).event, "dead-letter.replayed");
  assert.equal(snapshot.evidenceRecords.at(-1).category, "manual-replay");
});

test("manual replay does not bypass blocked domain policy", async () => {
  const { app, store } = await createHarness();
  await store.upsertDomainBlock({
    domain: "remote.example",
    reason: "malware",
    source: "test",
    blockedAt: "2026-03-21T00:00:00.000Z",
  });
  await store.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    inbox: "https://remote.example/users/zoe/inbox",
    sharedInbox: "https://remote.example/inbox",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
    lastActivityId: "https://remote.example/activities/follow-1",
  });

  await app.handle(
    new Request("https://matters.example/users/alice/outbox/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        object: {
          id: "https://matters.example/articles/replay-blocked",
          type: "Article",
          content: "still blocked",
        },
      }),
    }),
  );

  let snapshot = store.getSnapshot();
  const deadLetterId = snapshot.deadLetters[0].id;
  const replayResponse = await app.handle(
    new Request("https://matters.example/admin/dead-letters/replay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: deadLetterId,
        replayedBy: "tester",
        reason: "verify policy boundary",
      }),
    }),
  );
  assert.equal(replayResponse.status, 202);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.delivery.status, "dead-letter");

  snapshot = store.getSnapshot();
  assert.equal(snapshot.outboundQueue[0].status, "dead-letter");
  assert.equal(snapshot.deadLetters[0].status, "open");
  assert.equal(snapshot.deadLetters[0].replayHistory.length, 1);
  assert.equal(snapshot.evidenceRecords.some((entry) => entry.category === "manual-replay"), true);
});

test("backup script creates sqlite backup and manifest", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await store.enqueueOutbound({
    id: "queue-backup-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/backup-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "backup-test.instance.json");
  const backupDir = path.join(tmpDir, "backups");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFile("node", ["scripts/backup-sqlite.mjs", "--config", configPath, "--output-dir", backupDir], {
    cwd: path.resolve(process.cwd()),
  });
  const payload = JSON.parse(stdout);
  const backupDb = await readFile(payload.backupFile);
  const manifest = JSON.parse(await readFile(payload.manifestFile, "utf8"));

  assert.equal(backupDb.length > 0, true);
  assert.equal(manifest.sourceFile, sqliteFile);
  assert.equal(manifest.schemaVersion, 6);
});

test("restore script restores sqlite backup and stamps runtime metadata", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  await store.enqueueOutbound({
    id: "queue-restore-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/restore-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const tmpDir = path.dirname(sqliteFile);
  const backupFile = path.join(tmpDir, "restore-source.sqlite");
  const restoredFile = path.join(tmpDir, "restore-target.sqlite");
  await store.createBackup(backupFile);

  const configPath = path.join(tmpDir, "restore-test.instance.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile: restoredFile,
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFile(
    "node",
    ["scripts/restore-sqlite.mjs", "--config", configPath, "--input-file", backupFile, "--target-file", restoredFile],
    {
      cwd: path.resolve(process.cwd()),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.status, "restored");
  assert.equal(payload.targetFile, restoredFile);

  const restored = new SqliteStateStore({ sqliteFile: restoredFile });
  await restored.init();
  const snapshot = restored.getSnapshot();
  const metadata = restored.getRuntimeMetadata();
  assert.equal(snapshot.outboundQueue[0].activity.type, "Update");
  assert.ok(metadata.lastRestoredAt);
  assert.equal(metadata.restoredFromBackup, backupFile);
});

test("consistency scan script reports follower, inbound object, and engagement drift", async () => {
  const { store: sqliteStore, sqliteFile } = await createSqliteStoreHarness();
  const tmpDir = path.dirname(sqliteFile);
  const stateFile = path.join(tmpDir, "state.json");
  const fileStore = new FileStateStore({ stateFile });
  await fileStore.init();

  await fileStore.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
  });
  await sqliteStore.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    status: "pending",
    followedAt: "2026-03-21T00:00:00.000Z",
  });
  await fileStore.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/file-only",
    activityId: "https://remote.example/activities/create-file-only",
    type: "Create",
  });
  await sqliteStore.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/sqlite-only",
    activityId: "https://remote.example/activities/create-sqlite-only",
    type: "Create",
  });
  await fileStore.upsertInboundEngagement("alice", {
    activityId: "https://remote.example/activities/like-1",
    type: "Like",
    objectId: "https://remote.example/notes/file-only",
  });
  await sqliteStore.upsertInboundEngagement("alice", {
    activityId: "https://remote.example/activities/like-1",
    type: "Like",
    objectId: "https://remote.example/notes/file-only",
  });

  const configPath = path.join(tmpDir, "consistency-test.instance.json");
  const outputDir = path.join(tmpDir, "scan-reports");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          stateFile,
          sqliteFile,
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFile(
    "node",
    [
      "scripts/scan-consistency.mjs",
      "--config",
      configPath,
      "--output-dir",
      outputDir,
      "--now",
      "2026-03-21T00:00:00.000Z",
    ],
    {
      cwd: path.resolve(process.cwd()),
    },
  );
  const payload = JSON.parse(stdout);
  const report = JSON.parse(await readFile(payload.jsonReportFile, "utf8"));
  const markdown = await readFile(payload.markdownReportFile, "utf8");

  assert.equal(report.dryRun, true);
  assert.equal(report.summary.totalDiffs, 3);
  assert.equal(report.summary.byCollection.followers.valueMismatches, 1);
  assert.equal(report.summary.byCollection.inboundObjects.missingInFile, 1);
  assert.equal(report.summary.byCollection.inboundObjects.missingInSqlite, 1);
  assert.equal(report.summary.byCollection.inboundEngagements.total, 0);
  assert.equal(markdown.includes("Gateway Consistency Scan"), true);
  assert.equal(markdown.includes("Missing in SQLite"), true);
});

test("consistency scan script repairs sqlite from file store when requested", async () => {
  const { store: sqliteStore, sqliteFile } = await createSqliteStoreHarness();
  const tmpDir = path.dirname(sqliteFile);
  const stateFile = path.join(tmpDir, "state.json");
  const fileStore = new FileStateStore({ stateFile });
  await fileStore.init();

  await fileStore.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    status: "accepted",
    followedAt: "2026-03-21T00:00:00.000Z",
  });
  await sqliteStore.upsertFollower("alice", {
    remoteActorId: "https://remote.example/users/zoe",
    status: "pending",
    followedAt: "2026-03-21T00:00:00.000Z",
  });
  await fileStore.upsertInboundObject("alice", {
    objectId: "https://remote.example/notes/file-only",
    activityId: "https://remote.example/activities/create-file-only",
    type: "Create",
  });

  const configPath = path.join(tmpDir, "consistency-repair-test.instance.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          stateFile,
          sqliteFile,
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFile(
    "node",
    [
      "scripts/scan-consistency.mjs",
      "--config",
      configPath,
      "--repair",
      "--repair-target",
      "sqlite",
      "--now",
      "2026-03-21T00:05:00.000Z",
    ],
    {
      cwd: path.resolve(process.cwd()),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.repair.target, "sqlite");
  assert.equal(payload.repair.applied, 2);
  assert.equal(payload.summary.totalDiffs, 0);

  const repaired = new SqliteStateStore({ sqliteFile });
  await repaired.init();
  assert.equal(repaired.getFollower("alice", "https://remote.example/users/zoe").status, "accepted");
  assert.equal(repaired.getInboundObject("alice", "https://remote.example/notes/file-only").type, "Create");
  repaired.close();
});

test("alert dispatch script writes structured payload with metrics and alerts", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  await store.enqueueOutbound({
    id: "queue-alert-dispatch-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/alert-dispatch-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "alert-dispatch.instance.json");
  const outputFile = path.join(tmpDir, "alert-dispatch.json");
  const tokenFile = path.join(tmpDir, "alert-dispatch.token");
  await writeFile(tokenFile, "script-secret\n");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
          alerting: {
            backupMaxAgeHours: 24,
            pendingQueueMaxAgeMinutes: 30,
            openDeadLetterThreshold: 1,
            openAbuseCaseThreshold: 0,
            pendingQueueThreshold: 10,
            dispatch: {
              webhookUrl: webhookServer.url,
              webhookHeaders: {
                "x-alert-source": "script-test",
              },
              webhookBearerTokenFile: tokenFile,
              timeoutMs: 5000,
            },
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const { stdout } = await execFile(
      "node",
      ["scripts/dispatch-runtime-alerts.mjs", "--config", configPath, "--output-file", outputFile],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const payload = JSON.parse(stdout);
    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(payload.metrics.delivery.queueSummary.pending, 1);
    assert.equal(payload.alerts.items.some((entry) => entry.code === "storage.backup.missing"), true);
    assert.equal(writtenPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer script-secret");
    assert.equal(webhookServer.requests[0].headers["x-alert-source"], "script-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookPayload.alerts.items.some((entry) => entry.code === "storage.backup.missing"), true);
  } finally {
    await webhookServer.close();
  }
});

test("alert dispatch script posts Slack webhook payload from config", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const slackServer = await createWebhookCaptureServer();
  await store.enqueueOutbound({
    id: "queue-alert-slack-script-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/alert-slack-script-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "alert-slack-dispatch.instance.json");
  const outputFile = path.join(tmpDir, "alert-slack-dispatch.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
          alerting: {
            backupMaxAgeHours: 24,
            pendingQueueMaxAgeMinutes: 30,
            openDeadLetterThreshold: 1,
            openAbuseCaseThreshold: 0,
            pendingQueueThreshold: 10,
            dispatch: {
              slackWebhookUrl: slackServer.url,
              slackChannel: "#gateway-alerts",
              slackUsername: "matters-gateway",
              slackIconEmoji: ":satellite:",
            },
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const { stdout } = await execFile(
      "node",
      ["scripts/dispatch-runtime-alerts.mjs", "--config", configPath, "--output-file", outputFile],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const payload = JSON.parse(stdout);
    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(payload.metrics.delivery.queueSummary.pending, 1);
    assert.equal(writtenPayload.metrics.storage.driver, "sqlite");
    assert.equal(slackServer.requests.length, 1);
    const slackPayload = JSON.parse(slackServer.requests[0].body);
    assert.equal(slackPayload.channel, "#gateway-alerts");
    assert.equal(slackPayload.username, "matters-gateway");
    assert.equal(slackPayload.icon_emoji, ":satellite:");
    assert.equal(slackPayload.text.includes("[matters.example] runtime alerts"), true);
    assert.equal(slackPayload.blocks[1].text.text.includes("storage.backup.missing"), true);
  } finally {
    await slackServer.close();
  }
});

test("metrics dispatch script writes structured payload and posts webhook bundle", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  await store.enqueueOutbound({
    id: "queue-metrics-dispatch-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/metrics-dispatch-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "metrics-dispatch.instance.json");
  const outputFile = path.join(tmpDir, "metrics-dispatch.json");
  const tokenFile = path.join(tmpDir, "metrics-dispatch.token");
  await writeFile(tokenFile, "metrics-script-secret\n");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
          metrics: {
            dispatch: {
              webhookUrl: webhookServer.url,
              webhookHeaders: {
                "x-metrics-source": "script-test",
              },
              webhookBearerTokenFile: tokenFile,
              timeoutMs: 5000,
            },
          },
          alerting: {
            backupMaxAgeHours: 24,
            pendingQueueMaxAgeMinutes: 30,
            openDeadLetterThreshold: 1,
            openAbuseCaseThreshold: 0,
            pendingQueueThreshold: 10,
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const { stdout } = await execFile(
      "node",
      ["scripts/dispatch-runtime-metrics.mjs", "--config", configPath, "--output-file", outputFile],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const payload = JSON.parse(stdout);
    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(payload.metrics.delivery.queueSummary.pending, 1);
    assert.equal(writtenPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer metrics-script-secret");
    assert.equal(webhookServer.requests[0].headers["x-metrics-source"], "script-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.metrics.storage.driver, "sqlite");
    assert.equal(webhookPayload.metrics.delivery.queueSummary.pending, 1);
  } finally {
    await webhookServer.close();
  }
});

test("logs dispatch script writes structured payload and posts webhook bundle", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const webhookServer = await createWebhookCaptureServer();
  await store.recordAuditEvent({
    timestamp: "2026-03-21T00:00:00.000Z",
    event: "logs.script.audit",
    actorHandle: "alice",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:01:00.000Z",
    direction: "internal",
    event: "logs.script.trace",
    actorHandle: "alice",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:02:00.000Z",
    direction: "internal",
    event: "delivery.ignore",
    actorHandle: "alice",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "logs-dispatch.instance.json");
  const outputFile = path.join(tmpDir, "logs-dispatch.json");
  const tokenFile = path.join(tmpDir, "logs-dispatch.token");
  await writeFile(tokenFile, "logs-script-secret\n");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
          logs: {
            dispatch: {
              webhookUrl: webhookServer.url,
              webhookHeaders: {
                "x-logs-source": "script-test",
              },
              webhookBearerTokenFile: tokenFile,
              timeoutMs: 5000,
              auditLimit: 10,
              traceLimit: 10,
              traceEventPrefix: "logs.",
            },
          },
          alerting: {
            backupMaxAgeHours: 24,
            pendingQueueMaxAgeMinutes: 30,
            openDeadLetterThreshold: 1,
            openAbuseCaseThreshold: 0,
            pendingQueueThreshold: 10,
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const { stdout } = await execFile(
      "node",
      ["scripts/dispatch-runtime-logs.mjs", "--config", configPath, "--output-file", outputFile],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const payload = JSON.parse(stdout);
    const writtenPayload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(payload.audit.total, 1);
    assert.equal(payload.traces.total, 1);
    assert.equal(payload.traces.items[0].event, "logs.script.trace");
    assert.equal(writtenPayload.audit.total, 1);
    assert.equal(webhookServer.requests.length, 1);
    assert.equal(webhookServer.requests[0].headers.authorization, "Bearer logs-script-secret");
    assert.equal(webhookServer.requests[0].headers["x-logs-source"], "script-test");
    const webhookPayload = JSON.parse(webhookServer.requests[0].body);
    assert.equal(webhookPayload.audit.total, 1);
    assert.equal(webhookPayload.traces.total, 1);
    assert.equal(webhookPayload.traces.items[0].event, "logs.script.trace");
  } finally {
    await webhookServer.close();
  }
});

test("observability drill script writes bundles, dispatches sinks, and emits a report", async () => {
  const { store, sqliteFile } = await createSqliteStoreHarness();
  const alertServer = await createWebhookCaptureServer();
  const slackServer = await createWebhookCaptureServer();
  const metricsServer = await createWebhookCaptureServer();
  const logsServer = await createWebhookCaptureServer();
  await store.enqueueOutbound({
    id: "queue-observability-drill-1",
    status: "pending",
    attempts: 0,
    actorHandle: "alice",
    targetActorId: "https://remote.example/users/zoe",
    targetInbox: "https://remote.example/inbox",
    activity: {
      id: "https://matters.example/activities/observability-drill-1",
      type: "Update",
    },
    createdAt: "2026-03-21T00:00:00.000Z",
  });
  await store.recordAuditEvent({
    timestamp: "2026-03-21T00:01:00.000Z",
    event: "observability.drill.audit",
    actorHandle: "alice",
  });
  await store.recordTrace({
    timestamp: "2026-03-21T00:02:00.000Z",
    direction: "internal",
    event: "observability.drill.trace",
    actorHandle: "alice",
  });

  const tmpDir = path.dirname(sqliteFile);
  const configPath = path.join(tmpDir, "observability-drill.instance.json");
  const outputDir = path.join(tmpDir, "observability-drill");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {},
        runtime: {
          storeDriver: "sqlite",
          sqliteFile,
          alerting: {
            backupMaxAgeHours: 24,
            pendingQueueMaxAgeMinutes: 30,
            openDeadLetterThreshold: 1,
            openAbuseCaseThreshold: 0,
            pendingQueueThreshold: 10,
            dispatch: {
              webhookUrl: alertServer.url,
              slackWebhookUrl: slackServer.url,
              slackChannel: "#gateway-alerts",
              slackUsername: "matters-gateway",
              slackIconEmoji: ":satellite:",
            },
          },
          metrics: {
            dispatch: {
              webhookUrl: metricsServer.url,
            },
          },
          logs: {
            dispatch: {
              webhookUrl: logsServer.url,
              auditLimit: 10,
              traceLimit: 10,
              traceEventPrefix: "observability.",
            },
          },
        },
      },
      null,
      2,
    ),
  );

  try {
    const { stdout } = await execFile(
      "node",
      [
        "scripts/run-staging-observability-drill.mjs",
        "--config",
        configPath,
        "--output-dir",
        outputDir,
        "--require-sinks",
      ],
      {
        cwd: path.resolve(process.cwd()),
      },
    );

    const report = JSON.parse(stdout);
    assert.equal(report.status, "ok");
    assert.equal(report.channels.alerts.status, "dispatched");
    assert.deepEqual(report.channels.alerts.sinkTypes, ["webhook", "slack"]);
    assert.equal(report.channels.metrics.status, "dispatched");
    assert.deepEqual(report.channels.metrics.sinkTypes, ["webhook"]);
    assert.equal(report.channels.logs.status, "dispatched");
    assert.deepEqual(report.channels.logs.sinkTypes, ["webhook"]);

    const reportFile = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
    assert.equal(reportFile.status, "ok");
    assert.equal(JSON.parse(await readFile(path.join(outputDir, "alerts.json"), "utf8")).alerts.items.length > 0, true);
    assert.equal(JSON.parse(await readFile(path.join(outputDir, "metrics.json"), "utf8")).metrics.storage.driver, "sqlite");
    assert.equal(JSON.parse(await readFile(path.join(outputDir, "logs.json"), "utf8")).audit.total >= 1, true);

    assert.equal(alertServer.requests.length, 1);
    assert.equal(slackServer.requests.length, 1);
    assert.equal(metricsServer.requests.length, 1);
    assert.equal(logsServer.requests.length, 1);

    const alertPayload = JSON.parse(alertServer.requests[0].body);
    const slackPayload = JSON.parse(slackServer.requests[0].body);
    const metricsPayload = JSON.parse(metricsServer.requests[0].body);
    const logsPayload = JSON.parse(logsServer.requests[0].body);

    assert.equal(alertPayload.metrics.storage.driver, "sqlite");
    assert.equal(slackPayload.channel, "#gateway-alerts");
    assert.equal(slackPayload.text.includes("[matters.example] runtime alerts"), true);
    assert.equal(metricsPayload.metrics.delivery.queueSummary.pending, 1);
    assert.equal(logsPayload.audit.items.some((entry) => entry.event === "observability.drill.audit"), true);
  } finally {
    await alertServer.close();
    await slackServer.close();
    await metricsServer.close();
    await logsServer.close();
  }
});

test("secret layout check script reports configured file references", async () => {
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-secret-layout-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const configPath = path.join(tmpDir, "instance.json");
  const publicKeyFile = path.join(tmpDir, "actor-public.pem");
  const privateKeyFile = path.join(tmpDir, "actor-private.pem");
  const alertTokenFile = path.join(tmpDir, "alert.token");
  const metricsTokenFile = path.join(tmpDir, "metrics.token");
  const logsTokenFile = path.join(tmpDir, "logs.token");

  await writeFile(publicKeyFile, "public\n");
  await writeFile(privateKeyFile, "private\n");
  await writeFile(alertTokenFile, "alert-secret\n");
  await writeFile(metricsTokenFile, "metrics-secret\n");
  await writeFile(logsTokenFile, "logs-secret\n");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        instance: {
          domain: "matters.example",
        },
        actors: {
          alice: {
            publicKeyPemFile: "./actor-public.pem",
            privateKeyPemFile: "./actor-private.pem",
          },
        },
        runtime: {
          alerting: {
            dispatch: {
              webhookBearerTokenFile: "./alert.token",
            },
          },
          metrics: {
            dispatch: {
              webhookBearerTokenFile: "./metrics.token",
            },
          },
          logs: {
            dispatch: {
              webhookBearerTokenFile: "./logs.token",
            },
          },
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFile(
    "node",
    ["scripts/check-secret-layout.mjs", "--config", configPath],
    {
      cwd: path.resolve(process.cwd()),
    },
  );

  const payload = JSON.parse(stdout);
  assert.equal(payload.status, "ok");
  assert.equal(payload.checkedFiles, 5);
  assert.equal(payload.missingFiles, 0);
  assert.deepEqual(
    payload.files.map((entry) => entry.key).sort(),
    [
      "actors.alice.privateKeyPemFile",
      "actors.alice.publicKeyPemFile",
      "runtime.alerting.dispatch.webhookBearerTokenFile",
      "runtime.logs.dispatch.webhookBearerTokenFile",
      "runtime.metrics.dispatch.webhookBearerTokenFile",
    ],
  );
});

test("rollout artifact check script validates required env keys and paths", async () => {
  const tmpDir = path.join(os.tmpdir(), `matters-gateway-rollout-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  const workdir = path.join(tmpDir, "gateway-core");
  const etcDir = path.join(tmpDir, "etc");
  const logDir = path.join(tmpDir, "logs");
  await mkdir(workdir, { recursive: true });
  await mkdir(etcDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const configPath = path.join(etcDir, "staging.instance.json");
  const envPath = path.join(tmpDir, "matters-gateway-core.env");

  await writeFile(configPath, "{}\n");
  await writeFile(
    envPath,
    [
      `WORKDIR=${workdir}`,
      `CONFIG_PATH=${configPath}`,
      "HOST=127.0.0.1",
      "PORT=8787",
      `LOG_DIR=${logDir}`,
      "NODE_ENV=production",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFile(
    "node",
    ["scripts/check-rollout-artifact.mjs", "--env-file", envPath, "--strict-paths"],
    {
      cwd: path.resolve(process.cwd()),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.status, "ok");
  assert.deepEqual(payload.missingKeys, []);
  assert.deepEqual(payload.missingPaths, []);
  assert.equal(payload.checkedPaths.length, 3);
});
