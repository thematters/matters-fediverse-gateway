import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadGatewayConfig } from "../src/config.mjs";
import { createDeliveryProcessor, createFetchDeliveryClient } from "../src/lib/delivery.mjs";
import { createStateStore } from "../src/store/create-state-store.mjs";

const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const DEFAULT_THREADS_ACTOR_ID = "https://threads.net/ap/users/17841401579146452/";
const DEFAULT_ARTICLE_URL = "https://matters.town/a/n0wacr6zgyyq";

function parseArgs(argv) {
  const options = {
    configPath: "./config/dev.instance.json",
    handle: "mashbeanmatters",
    targetActorId: DEFAULT_THREADS_ACTOR_ID,
    articleUrl: DEFAULT_ARTICLE_URL,
    noteText: null,
    now: null,
    send: false,
    confirmPublicCreate: false,
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      options.configPath = argv[++index];
    } else if (arg === "--handle") {
      options.handle = argv[++index];
    } else if (arg === "--target-actor-id") {
      options.targetActorId = argv[++index];
    } else if (arg === "--article-url") {
      options.articleUrl = argv[++index];
    } else if (arg === "--note-text") {
      options.noteText = argv[++index];
    } else if (arg === "--now") {
      options.now = argv[++index];
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else if (arg === "--send") {
      options.send = true;
    } else if (arg === "--confirm-public-create") {
      options.confirmPublicCreate = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.handle = options.handle?.trim();
  options.targetActorId = options.targetActorId?.trim();
  options.articleUrl = options.articleUrl?.trim();
  options.noteText = options.noteText?.trim() || null;
  options.outputFile = options.outputFile?.trim() || null;

  if (!options.handle) {
    throw new Error("--handle is required");
  }
  if (!options.targetActorId) {
    throw new Error("--target-actor-id is required");
  }
  if (!options.articleUrl) {
    throw new Error("--article-url is required");
  }
  if (options.send && !options.confirmPublicCreate) {
    throw new Error("--send requires --confirm-public-create because this publishes a public ActivityPub Create");
  }

  return options;
}

function validatePublicHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use https`);
  }
  return String(url);
}

function buildTimestamp(date) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-").replace("Z", "Z");
}

function buildQueueItemId(activityId, remoteActorId) {
  return `${activityId}::threads-note-${Buffer.from(remoteActorId).toString("base64url")}`;
}

function buildProbe({ actor, config, options, now }) {
  const activityBaseUrl = config.instance.activityBaseUrl ?? config.instance.baseUrl;
  const timestamp = now.getTime();
  const articleUrl = validatePublicHttpsUrl(options.articleUrl, "--article-url");
  const activityId = `${activityBaseUrl}/activities/${timestamp}-threads-note-visibility-${actor.handle}`;
  const objectId = `${activityBaseUrl}/notes/${timestamp}-threads-note-visibility-${actor.handle}`;
  const content = options.noteText ?? `Threads visibility test for Matters Fediverse Gateway: ${articleUrl}`;

  const note = {
    id: objectId,
    type: "Note",
    attributedTo: actor.actorUrl,
    to: [PUBLIC_AUDIENCE],
    cc: [actor.followersUrl],
    content,
    url: articleUrl,
    published: now.toISOString(),
  };

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: activityId,
    type: "Create",
    actor: actor.actorUrl,
    to: [PUBLIC_AUDIENCE],
    cc: [actor.followersUrl],
    object: note,
  };
}

function buildQueueItem({ activity, actorHandle, targetActorId, follower, now }) {
  const targetInbox = follower.sharedInbox ?? follower.inbox;
  return {
    id: buildQueueItemId(activity.id, targetActorId),
    status: "pending",
    attempts: 0,
    actorHandle,
    targetActorId,
    targetInbox,
    activity,
    createdAt: now.toISOString(),
  };
}

async function writeReport(outputFile, report) {
  if (!outputFile) {
    return;
  }
  const resolved = path.resolve(outputFile);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadGatewayConfig(path.resolve(options.configPath));
  const actor = config.actors[options.handle];
  if (!actor) {
    throw new Error(`Unknown actor handle ${options.handle}`);
  }

  const store = createStateStore(config.runtime);
  await store.init();

  try {
    const follower = store.getFollower(options.handle, options.targetActorId);
    if (!follower) {
      throw new Error(`No follower record found for ${options.targetActorId}`);
    }
    if (follower.status !== "accepted") {
      throw new Error(`Follower ${options.targetActorId} is not accepted; status=${follower.status ?? "unknown"}`);
    }
    if (!(follower.sharedInbox ?? follower.inbox)) {
      throw new Error(`Follower ${options.targetActorId} has no inbox or sharedInbox`);
    }

    const now = options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw new Error("--now must be a valid date-time");
    }

    const activity = buildProbe({ actor, config, options, now });
    const queueItem = buildQueueItem({
      activity,
      actorHandle: options.handle,
      targetActorId: options.targetActorId,
      follower,
      now,
    });

    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      dryRun: !options.send,
      probe: "threads-note-visibility",
      warning: "This probe is a public ActivityPub Create when sent. Dry-run mode does not enqueue or deliver.",
      actor: {
        handle: options.handle,
        actorUrl: actor.actorUrl,
      },
      target: {
        actorId: options.targetActorId,
        inbox: follower.inbox ?? null,
        sharedInbox: follower.sharedInbox ?? null,
        selectedInbox: queueItem.targetInbox,
      },
      activity,
      queueItem: {
        id: queueItem.id,
        status: queueItem.status,
        targetActorId: queueItem.targetActorId,
        targetInbox: queueItem.targetInbox,
      },
      result: null,
    };

    if (options.send) {
      await store.enqueueOutbound(queueItem);
      const deliveryProcessor = createDeliveryProcessor({
        store,
        deliveryClient: createFetchDeliveryClient({ userAgent: config.delivery.userAgent }),
        config,
      });
      const result = await deliveryProcessor.process(queueItem.id);
      report.dryRun = false;
      report.result = {
        id: result?.id ?? queueItem.id,
        status: result?.status ?? null,
        attempts: result?.attempts ?? null,
        lastStatusCode: result?.lastStatusCode ?? null,
        targetInbox: result?.targetInbox ?? queueItem.targetInbox,
      };
    }

    await writeReport(options.outputFile, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    store.close?.();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
