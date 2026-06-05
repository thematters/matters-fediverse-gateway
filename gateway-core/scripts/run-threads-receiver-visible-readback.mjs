import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ADMIN_BASE_URL = "https://gateway-core-origin.matters.town";
const DEFAULT_ACTOR_HANDLE = "mashbeanmatters";
const DEFAULT_COMPANION_CONTENT_ID =
  "https://matters.town/ap/notes/ap-articles-threads-note-companion-proof-20260604T155626Z-note-companion";
const THREADS_ACTOR_PREFIX = "https://threads.net/";

function parseArgs(argv) {
  const options = {
    adminBaseUrl: process.env.THREADS_READBACK_ADMIN_BASE_URL ?? DEFAULT_ADMIN_BASE_URL,
    actorHandle: DEFAULT_ACTOR_HANDLE,
    contentIds: [],
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--admin-base-url") {
      options.adminBaseUrl = argv[++index];
    } else if (arg === "--actor-handle") {
      options.actorHandle = argv[++index];
    } else if (arg === "--content-id") {
      options.contentIds.push(argv[++index]);
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.adminBaseUrl = options.adminBaseUrl.replace(/\/+$/u, "");
  options.actorHandle = options.actorHandle.trim();
  options.contentIds = (options.contentIds.length ? options.contentIds : [DEFAULT_COMPANION_CONTENT_ID])
    .map((value) => value.trim())
    .filter(Boolean);
  options.outputFile = options.outputFile?.trim() || null;

  if (!options.adminBaseUrl || !options.actorHandle) {
    throw new Error("--admin-base-url and --actor-handle are required");
  }
  if (options.contentIds.length === 0) {
    throw new Error("At least one --content-id is required");
  }

  return options;
}

function buildUrl(baseUrl, pathname, params = null) {
  const url = new URL(pathname, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "MattersGatewayCore/threads-receiver-visible-readback",
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
  }
  return {
    url: String(url),
    status: response.status,
    ok: response.ok,
    body,
  };
}

function collectItems(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload.notifications)) {
    return payload.notifications;
  }
  if (payload.item) {
    return [payload.item];
  }
  return [];
}

function isThreadsActor(actorId) {
  return typeof actorId === "string" && actorId.startsWith(THREADS_ACTOR_PREFIX);
}

function summarizeContent(contentId, payload) {
  const items = collectItems(payload);
  const exactItem =
    items.find((item) => item?.contentId === contentId || item?.threadId === contentId) ??
    items.find((item) => item?.latestObjectId === contentId) ??
    payload?.item ??
    null;
  const metrics = exactItem?.metrics ?? {};
  const actionMatrix = exactItem?.actionMatrix ?? {};
  const notifications = exactItem?.notifications ?? actionMatrix.notifications ?? {};
  const relations = exactItem?.relations ?? {};
  const engagementIds = Array.isArray(relations.engagementIds) ? relations.engagementIds : [];

  return {
    contentId,
    found: Boolean(exactItem),
    status: exactItem?.status ?? null,
    delivery: exactItem?.delivery ?? actionMatrix.delivery ?? null,
    metrics: {
      likes: metrics.likes ?? actionMatrix.inbound?.like ?? notifications.like ?? 0,
      replies: metrics.replies ?? actionMatrix.inbound?.reply ?? notifications.reply ?? 0,
      announces: metrics.announces ?? actionMatrix.inbound?.announce ?? notifications.announce ?? 0,
    },
    threadsEngagementIds: engagementIds.filter((id) => typeof id === "string" && id.startsWith(THREADS_ACTOR_PREFIX)),
  };
}

function notificationMatchesContent(notification, contentIds) {
  return contentIds.some(
    (contentId) =>
      notification?.contentId === contentId ||
      notification?.threadId === contentId ||
      notification?.threadRootId === contentId ||
      notification?.objectId === contentId,
  );
}

function summarizeNotifications(payload, contentIds) {
  const notifications = collectItems(payload);
  const matching = notifications.filter((notification) => notificationMatchesContent(notification, contentIds));
  const threadsMatching = matching.filter((notification) =>
    (notification.remoteActorIds ?? []).some((actorId) => isThreadsActor(actorId)) ||
    isThreadsActor(notification.activityId),
  );

  return {
    total: notifications.length,
    matching: matching.length,
    threadsMatching: threadsMatching.length,
    recentThreadsActivityIds: threadsMatching.map((notification) => notification.activityId).filter(Boolean).slice(0, 10),
  };
}

function evaluate({ queueSummary, contentSummaries, likeSummary, replySummary }) {
  const passed = [];
  const open = [];
  const warnings = [];

  const anyDeliveredContent = contentSummaries.some((summary) => summary.delivery?.delivered > 0 || summary.delivery?.recipients?.delivered > 0);
  const anyThreadsLike =
    contentSummaries.some((summary) => summary.metrics.likes > 0 && summary.threadsEngagementIds.length > 0) ||
    likeSummary.threadsMatching > 0;
  const anyThreadsReply = replySummary.threadsMatching > 0;

  if (anyDeliveredContent) {
    passed.push("gateway delivery readback has delivered content");
  } else {
    warnings.push("no delivered content evidence found for the requested content ids");
  }

  if (anyThreadsLike) {
    passed.push("Threads-origin Like return");
  } else {
    open.push("Threads-origin Like return");
  }

  if (anyThreadsReply) {
    passed.push("Threads-origin Reply return");
  } else {
    open.push("Threads-origin Reply return");
  }

  open.push("Threads single-post permalink / copyable URL");

  if (queueSummary?.processing > 0) {
    warnings.push(`queue has ${queueSummary.processing} processing item(s)`);
  }

  return {
    ok: true,
    passed,
    open,
    warnings,
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

  const queue = await fetchJson(buildUrl(options.adminBaseUrl, "/admin/queues/outbound"));
  const likeNotifications = await fetchJson(
    buildUrl(options.adminBaseUrl, "/admin/local-notifications", {
      actorHandle: options.actorHandle,
      category: "like",
    }),
  );
  const replyNotifications = await fetchJson(
    buildUrl(options.adminBaseUrl, "/admin/local-notifications", {
      actorHandle: options.actorHandle,
      category: "reply",
    }),
  );
  const contentResponses = [];
  for (const contentId of options.contentIds) {
    contentResponses.push(
      await fetchJson(
        buildUrl(options.adminBaseUrl, "/admin/local-content", {
          actorHandle: options.actorHandle,
          contentId,
        }),
      ),
    );
  }

  const fetchFailures = [queue, likeNotifications, replyNotifications, ...contentResponses].filter((response) => !response.ok);
  const contentSummaries = options.contentIds.map((contentId, index) =>
    summarizeContent(contentId, contentResponses[index]?.body),
  );
  const likeSummary = summarizeNotifications(likeNotifications.body, options.contentIds);
  const replySummary = summarizeNotifications(replyNotifications.body, options.contentIds);
  const evaluation = evaluate({
    queueSummary: queue.body?.queue?.summary ?? queue.body?.summary ?? null,
    contentSummaries,
    likeSummary,
    replySummary,
  });

  if (fetchFailures.length) {
    evaluation.ok = false;
    evaluation.warnings.push(
      `admin fetch failures: ${fetchFailures.map((response) => `${response.url}:${response.status}`).join(", ")}`,
    );
  }

  const report = {
    ok: evaluation.ok,
    generatedAt: new Date().toISOString(),
    scope: {
      adminBaseUrl: options.adminBaseUrl,
      actorHandle: options.actorHandle,
      contentIds: options.contentIds,
      note: "This checks gateway-side receiver-visible evidence. It does not inspect Threads UI or use Threads APIs.",
    },
    evaluation,
    queue: {
      status: queue.status,
      summary: queue.body?.queue?.summary ?? queue.body?.summary ?? null,
    },
    content: contentSummaries,
    notifications: {
      like: likeSummary,
      reply: replySummary,
    },
  };

  await writeReport(options.outputFile, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
