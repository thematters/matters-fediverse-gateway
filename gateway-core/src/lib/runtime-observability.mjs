import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function getAlertSeverityRank(severity) {
  return {
    info: 1,
    warn: 2,
    error: 3,
  }[severity] ?? 0;
}

export function getStorageAlertThresholds(config) {
  return {
    backupStaleMs: (config.runtime?.alerting?.backupMaxAgeHours ?? 24) * 60 * 60 * 1000,
    pendingAgeMs: (config.runtime?.alerting?.pendingQueueMaxAgeMinutes ?? 30) * 60 * 1000,
    openDeadLetters: config.runtime?.alerting?.openDeadLetterThreshold ?? 0,
    pendingQueue: config.runtime?.alerting?.pendingQueueThreshold ?? 25,
  };
}

export function filterAlertsBySeverity(alerts, minimumSeverity = "info") {
  const minimumRank = getAlertSeverityRank(minimumSeverity);
  return alerts.filter((entry) => getAlertSeverityRank(entry.severity) >= minimumRank);
}

export function buildRuntimeMetrics({ store, config, now }) {
  const baseline =
    store.getMetricsSnapshot?.({ now }) ?? {
      generatedAt: now,
      runtime: {
        driver: config.runtime?.storeDriver ?? "unknown",
      },
      queue: {},
      moderation: {},
      activity: {},
      audit: {},
    };
  const snapshot = store.getSnapshot?.() ?? {
    processedActivities: {},
  };
  const deliveryQueue = baseline.queue ?? {};
  const moderation = baseline.moderation ?? {};
  const activity = baseline.activity ?? {};
  const audit = baseline.audit ?? {};
  const backupAgeMs = baseline.runtime?.lastBackupAt
    ? Math.max(Date.parse(now) - Date.parse(baseline.runtime.lastBackupAt), 0)
    : null;
  const oldestPendingAgeMs = deliveryQueue.oldestPendingAt
    ? Math.max(Date.parse(now) - Date.parse(deliveryQueue.oldestPendingAt), 0)
    : null;

  const gauges = [
    { name: "gateway.actor.local_total", value: activity.actors ?? Object.keys(config.actors ?? {}).length, unit: "count" },
    { name: "gateway.actor.remote_cached_total", value: activity.remoteActors ?? 0, unit: "count" },
    { name: "gateway.followers.total", value: activity.followers ?? 0, unit: "count" },
    { name: "gateway.inbound.objects_total", value: activity.inboundObjects ?? 0, unit: "count" },
    { name: "gateway.inbound.engagements_total", value: activity.inboundEngagements ?? 0, unit: "count" },
    { name: "gateway.delivery.outbound_total", value: deliveryQueue.total ?? 0, unit: "count" },
    { name: "gateway.delivery.pending_total", value: deliveryQueue.pending ?? 0, unit: "count" },
    { name: "gateway.delivery.processing_total", value: deliveryQueue.processing ?? 0, unit: "count" },
    { name: "gateway.delivery.dead_letter_open_total", value: deliveryQueue.openDeadLetters ?? 0, unit: "count" },
    { name: "gateway.abuse.open_total", value: moderation.abuseCasesOpen ?? 0, unit: "count" },
    { name: "gateway.evidence.total", value: moderation.evidenceRecords ?? 0, unit: "count" },
    { name: "gateway.audit.total", value: audit.auditEvents ?? 0, unit: "count" },
  ];

  if (backupAgeMs !== null) {
    gauges.push({ name: "gateway.storage.backup_age_ms", value: backupAgeMs, unit: "ms" });
  }
  if (oldestPendingAgeMs !== null) {
    gauges.push({ name: "gateway.delivery.oldest_pending_age_ms", value: oldestPendingAgeMs, unit: "ms" });
  }

  return {
    generatedAt: baseline.generatedAt ?? now,
    instance: {
      domain: config.instance?.domain ?? null,
      actorCount: Object.keys(config.actors ?? {}).length,
    },
    storage: {
      driver: baseline.runtime?.driver ?? config.runtime?.storeDriver ?? "unknown",
      schemaVersion: baseline.runtime?.schemaVersion ?? null,
      lastBackupAt: baseline.runtime?.lastBackupAt ?? null,
      lastReconciledAt: baseline.runtime?.lastReconciledAt ?? null,
      lastRestoredAt: baseline.runtime?.lastRestoredAt ?? null,
    },
    delivery: {
      queueSummary: {
        total: deliveryQueue.total ?? 0,
        pending: deliveryQueue.pending ?? 0,
        processing: deliveryQueue.processing ?? 0,
        delivered: deliveryQueue.delivered ?? 0,
        deadLetter: deliveryQueue.deadLetter ?? 0,
        retryPending: deliveryQueue.retryPending ?? 0,
        oldestPendingAt: deliveryQueue.oldestPendingAt ?? null,
        oldestProcessingAt: deliveryQueue.oldestProcessingAt ?? null,
      },
      deadLetters: {
        open: deliveryQueue.openDeadLetters ?? 0,
        replayed: deliveryQueue.replayedDeadLetters ?? 0,
      },
    },
    moderation,
    activity: {
      processedActivities: activity.processedActivities ?? Object.keys(snapshot.processedActivities ?? {}).length,
      traces: audit.traces ?? 0,
      remoteActors: activity.remoteActors ?? 0,
    },
    actorState: {
      followersTotal: activity.followers ?? 0,
      inboundObjectsTotal: activity.inboundObjects ?? 0,
      inboundEngagementsTotal: activity.inboundEngagements ?? 0,
    },
    audit,
    gauges,
  };
}

export function buildRuntimeAlertBundle({ store, config, now, minimumSeverity = "warn" }) {
  const alerts =
    store.getStorageAlerts?.({
      now,
      thresholds: getStorageAlertThresholds(config),
    }) ?? { generatedAt: now, thresholds: {}, items: [] };

  return {
    generatedAt: now,
    minimumSeverity,
    metrics: buildRuntimeMetrics({
      store,
      config,
      now,
    }),
    alerts: {
      ...alerts,
      minimumSeverity,
      items: filterAlertsBySeverity(alerts.items ?? [], minimumSeverity),
    },
  };
}

export function buildRuntimeMetricsBundle({ store, config, now }) {
  return {
    generatedAt: now,
    metrics: buildRuntimeMetrics({
      store,
      config,
      now,
    }),
  };
}

export function buildRuntimeLogsBundle({
  store,
  now,
  auditLimit = 100,
  traceLimit = 100,
  traceEventPrefix = null,
}) {
  const auditItems = store.getAuditLog?.(auditLimit) ?? [];
  const traceItems = store.getTraces?.({
    limit: traceLimit,
    eventPrefix: traceEventPrefix,
  }) ?? [];

  return {
    generatedAt: now,
    appliedFilters: {
      auditLimit,
      traceLimit,
      traceEventPrefix,
    },
    audit: {
      total: auditItems.length,
      items: auditItems,
    },
    traces: {
      total: traceItems.length,
      eventPrefix: traceEventPrefix,
      items: traceItems,
    },
  };
}

function normalizeWebhookHeaders(rawHeaders = {}) {
  return Object.fromEntries(
    Object.entries(rawHeaders ?? {})
      .map(([key, value]) => [key?.trim(), value])
      .filter(([key, value]) => key && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function hasDefinedOwnKey(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key) && value[key] !== undefined;
}

export function writeRuntimeDispatchBundle(outputFile, bundle) {
  const absoluteOutputFile = path.resolve(outputFile);
  return mkdir(path.dirname(absoluteOutputFile), { recursive: true }).then(() =>
    writeFile(absoluteOutputFile, JSON.stringify(bundle, null, 2)).then(() => absoluteOutputFile),
  );
}

export function writeRuntimeAlertBundle(outputFile, bundle) {
  return writeRuntimeDispatchBundle(outputFile, bundle);
}

export function resolveRuntimeDispatch({
  configuredDispatch = {},
  override = {},
}) {
  const webhookUrl = hasDefinedOwnKey(override, "webhookUrl")
    ? override.webhookUrl?.trim() || null
    : configuredDispatch.webhookUrl ?? null;
  const timeoutMs =
    hasDefinedOwnKey(override, "timeoutMs") &&
    Number.isFinite(override.timeoutMs) &&
    override.timeoutMs > 0
      ? Math.floor(override.timeoutMs)
      : configuredDispatch.timeoutMs ?? 10_000;
  const webhookHeaders = {
    ...normalizeWebhookHeaders(configuredDispatch.webhookHeaders),
    ...normalizeWebhookHeaders(override.webhookHeaders),
  };
  const webhookBearerToken = hasDefinedOwnKey(override, "webhookBearerToken")
    ? override.webhookBearerToken?.trim() || null
    : configuredDispatch.webhookBearerToken ?? null;

  return {
    webhookUrl,
    timeoutMs,
    webhookHeaders,
    webhookBearerToken,
  };
}

export function resolveRuntimeAlertDispatch({
  config,
  override = {},
}) {
  const configuredDispatch = config.runtime?.alerting?.dispatch ?? {};
  const runtimeDispatch = resolveRuntimeDispatch({
    configuredDispatch,
    override,
  });
  const slackWebhookUrl = hasDefinedOwnKey(override, "slackWebhookUrl")
    ? override.slackWebhookUrl?.trim() || null
    : configuredDispatch.slackWebhookUrl ?? null;
  const slackChannel = hasDefinedOwnKey(override, "slackChannel")
    ? override.slackChannel?.trim() || null
    : configuredDispatch.slackChannel ?? null;
  const slackUsername = hasDefinedOwnKey(override, "slackUsername")
    ? override.slackUsername?.trim() || null
    : configuredDispatch.slackUsername ?? null;
  const slackIconEmoji = hasDefinedOwnKey(override, "slackIconEmoji")
    ? override.slackIconEmoji?.trim() || null
    : configuredDispatch.slackIconEmoji ?? null;

  return {
    ...runtimeDispatch,
    slackWebhookUrl,
    slackChannel,
    slackUsername,
    slackIconEmoji,
  };
}

export async function dispatchRuntimeWebhook({
  webhookUrl,
  webhookHeaders = {},
  webhookBearerToken = null,
  timeoutMs = 10_000,
  bundle,
  fetchImpl = fetch,
}) {
  if (!webhookUrl?.trim()) {
    return null;
  }

  const url = new URL(webhookUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(webhookBearerToken ? { authorization: `Bearer ${webhookBearerToken}` } : {}),
        ...webhookHeaders,
      },
      body: JSON.stringify(bundle),
      signal: controller.signal,
    });
    const responseBody = await response.text();

    if (!response.ok) {
      const error = new Error(`Runtime alert webhook failed with status ${response.status}`);
      error.type = "webhook";
      error.status = response.status;
      error.host = url.host;
      error.responseBody = responseBody.slice(0, 500);
      throw error;
    }

    return {
      type: "webhook",
      host: url.host,
      status: response.status,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Runtime alert webhook timed out after ${timeoutMs}ms`);
      timeoutError.type = "webhook";
      timeoutError.code = "ALERT_WEBHOOK_TIMEOUT";
      timeoutError.host = url.host;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchRuntimeAlertWebhook(options) {
  return dispatchRuntimeWebhook(options);
}

export function buildRuntimeAlertSlackPayload({ config, bundle }) {
  const alerts = bundle.alerts?.items ?? [];
  const errorCount = alerts.filter((entry) => entry.severity === "error").length;
  const warnCount = alerts.filter((entry) => entry.severity === "warn").length;
  const infoCount = alerts.filter((entry) => entry.severity === "info").length;
  const headline = `[${config.instance?.domain ?? "gateway"}] runtime alerts ${alerts.length}`;
  const summaryParts = [
    errorCount > 0 ? `${errorCount} error` : null,
    warnCount > 0 ? `${warnCount} warn` : null,
    infoCount > 0 ? `${infoCount} info` : null,
  ].filter(Boolean);
  const alertLines =
    alerts.length > 0
      ? alerts.slice(0, 5).map((entry) => `- [${entry.severity}] ${entry.code} ${entry.message ?? ""}`.trim())
      : ["- no alerts matched current filter"];

  return {
    text: `${headline}${summaryParts.length > 0 ? ` (${summaryParts.join(", ")})` : ""}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${headline}*\nminimum severity: \`${bundle.minimumSeverity}\`\ngenerated at: \`${bundle.generatedAt}\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: alertLines.join("\n"),
        },
      },
    ],
  };
}

export async function dispatchRuntimeAlertSlackWebhook({
  slackWebhookUrl,
  slackChannel = null,
  slackUsername = null,
  slackIconEmoji = null,
  timeoutMs = 10_000,
  bundle,
  config,
  fetchImpl = fetch,
}) {
  if (!slackWebhookUrl?.trim()) {
    return null;
  }

  const payload = {
    ...buildRuntimeAlertSlackPayload({
      config,
      bundle,
    }),
    ...(slackChannel ? { channel: slackChannel } : {}),
    ...(slackUsername ? { username: slackUsername } : {}),
    ...(slackIconEmoji ? { icon_emoji: slackIconEmoji } : {}),
  };
  const url = new URL(slackWebhookUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(slackWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await response.text();

    if (!response.ok) {
      const error = new Error(`Runtime alert Slack dispatch failed with status ${response.status}`);
      error.type = "slack";
      error.status = response.status;
      error.host = url.host;
      error.responseBody = responseBody.slice(0, 500);
      throw error;
    }

    return {
      type: "slack",
      host: url.host,
      status: response.status,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Runtime alert Slack webhook timed out after ${timeoutMs}ms`);
      timeoutError.type = "slack";
      timeoutError.code = "ALERT_SLACK_TIMEOUT";
      timeoutError.host = url.host;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
