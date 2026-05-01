import { readFile } from "node:fs/promises";
import path from "node:path";

function ensureTrailingSlashless(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeRateLimitPolicies(rawRateLimits) {
  const entries = [
    ["instance-inbound", rawRateLimits?.instanceInbound],
    ["actor-inbound", rawRateLimits?.actorInbound],
    ["actor-outbound", rawRateLimits?.actorOutbound],
  ];

  return entries
    .filter(([, value]) => value && value.enabled !== false)
    .map(([policyKey, value]) => ({
      policyKey,
      limit: value.limit ?? 60,
      windowMs: value.windowMs ?? 60 * 1000,
      source: value.source ?? "config",
      scope: value.scope ?? policyKey,
      enabled: value.enabled !== false,
    }));
}

function normalizeRemoteActorPolicies(rawPolicies) {
  return (rawPolicies ?? []).flatMap((entry) => {
    const actorId = entry?.actorId?.trim();
    if (!actorId) {
      return [];
    }

    return [
      {
        actorId,
        inboundAction: entry.inboundAction?.trim() || "allow",
        outboundAction: entry.outboundAction?.trim() || "allow",
        reason: entry.reason?.trim() || "configured remote actor policy",
        source: entry.source?.trim() || "config",
      },
    ];
  });
}

function normalizeRuntimeAlerting(rawAlerting) {
  return {
    backupMaxAgeHours:
      Number.isFinite(rawAlerting?.backupMaxAgeHours) && rawAlerting.backupMaxAgeHours > 0
        ? rawAlerting.backupMaxAgeHours
        : 24,
    pendingQueueMaxAgeMinutes:
      Number.isFinite(rawAlerting?.pendingQueueMaxAgeMinutes) && rawAlerting.pendingQueueMaxAgeMinutes > 0
        ? rawAlerting.pendingQueueMaxAgeMinutes
        : 30,
    openDeadLetterThreshold:
      Number.isFinite(rawAlerting?.openDeadLetterThreshold) && rawAlerting.openDeadLetterThreshold >= 0
        ? Math.floor(rawAlerting.openDeadLetterThreshold)
        : 0,
    openAbuseCaseThreshold:
      Number.isFinite(rawAlerting?.openAbuseCaseThreshold) && rawAlerting.openAbuseCaseThreshold >= 0
        ? Math.floor(rawAlerting.openAbuseCaseThreshold)
        : 0,
    pendingQueueThreshold:
      Number.isFinite(rawAlerting?.pendingQueueThreshold) && rawAlerting.pendingQueueThreshold >= 0
        ? Math.floor(rawAlerting.pendingQueueThreshold)
        : 25,
  };
}

function normalizeAlertDispatchHeaders(rawHeaders) {
  return Object.fromEntries(
    Object.entries(rawHeaders ?? {})
      .map(([key, value]) => [key?.trim(), value])
      .filter(([key, value]) => key && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

async function normalizeRuntimeAlertDispatch(configDir, rawDispatch) {
  const webhookBearerToken = (
    await readMaybeFile(configDir, rawDispatch?.webhookBearerToken, rawDispatch?.webhookBearerTokenFile)
  ).trim();
  const slackWebhookUrl = rawDispatch?.slackWebhookUrl?.trim() || null;
  const slackChannel = rawDispatch?.slackChannel?.trim() || null;
  const slackUsername = rawDispatch?.slackUsername?.trim() || null;
  const slackIconEmoji = rawDispatch?.slackIconEmoji?.trim() || null;

  return {
    enabled: rawDispatch?.enabled !== false && Boolean(rawDispatch?.webhookUrl?.trim() || slackWebhookUrl),
    webhookUrl: rawDispatch?.webhookUrl?.trim() || null,
    webhookHeaders: normalizeAlertDispatchHeaders(rawDispatch?.webhookHeaders),
    webhookBearerToken: webhookBearerToken || null,
    slackWebhookUrl,
    slackChannel,
    slackUsername,
    slackIconEmoji,
    timeoutMs:
      Number.isFinite(rawDispatch?.timeoutMs) && rawDispatch.timeoutMs > 0
        ? Math.floor(rawDispatch.timeoutMs)
        : 10_000,
  };
}

async function normalizeRuntimeMetricsDispatch(configDir, rawDispatch) {
  const webhookBearerToken = (
    await readMaybeFile(configDir, rawDispatch?.webhookBearerToken, rawDispatch?.webhookBearerTokenFile)
  ).trim();

  return {
    enabled: rawDispatch?.enabled !== false && Boolean(rawDispatch?.webhookUrl?.trim()),
    webhookUrl: rawDispatch?.webhookUrl?.trim() || null,
    webhookHeaders: normalizeAlertDispatchHeaders(rawDispatch?.webhookHeaders),
    webhookBearerToken: webhookBearerToken || null,
    timeoutMs:
      Number.isFinite(rawDispatch?.timeoutMs) && rawDispatch.timeoutMs > 0
        ? Math.floor(rawDispatch.timeoutMs)
        : 10_000,
  };
}

async function normalizeRuntimeLogsDispatch(configDir, rawDispatch) {
  const webhookBearerToken = (
    await readMaybeFile(configDir, rawDispatch?.webhookBearerToken, rawDispatch?.webhookBearerTokenFile)
  ).trim();

  return {
    enabled: rawDispatch?.enabled !== false && Boolean(rawDispatch?.webhookUrl?.trim()),
    webhookUrl: rawDispatch?.webhookUrl?.trim() || null,
    webhookHeaders: normalizeAlertDispatchHeaders(rawDispatch?.webhookHeaders),
    webhookBearerToken: webhookBearerToken || null,
    timeoutMs:
      Number.isFinite(rawDispatch?.timeoutMs) && rawDispatch.timeoutMs > 0
        ? Math.floor(rawDispatch.timeoutMs)
        : 10_000,
    auditLimit:
      Number.isFinite(rawDispatch?.auditLimit) && rawDispatch.auditLimit > 0 ? Math.floor(rawDispatch.auditLimit) : 100,
    traceLimit:
      Number.isFinite(rawDispatch?.traceLimit) && rawDispatch.traceLimit > 0 ? Math.floor(rawDispatch.traceLimit) : 100,
    traceEventPrefix: rawDispatch?.traceEventPrefix?.trim() || null,
  };
}

async function readMaybeFile(baseDir, value, fallbackFileKey) {
  if (value?.trim()) {
    return value;
  }

  if (!fallbackFileKey?.trim()) {
    return "";
  }

  const filePath = path.resolve(baseDir, fallbackFileKey);
  return readFile(filePath, "utf8");
}

async function readOptionalKeyFile(configDir, value, fileKey) {
  const key = await readMaybeFile(configDir, value, fileKey);
  return key.trim() ? key : null;
}

export async function loadGatewayConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
  const configDir = path.dirname(absoluteConfigPath);
  const raw = JSON.parse(await readFile(absoluteConfigPath, "utf8"));

  if (!raw.instance?.domain?.trim()) {
    throw new Error("instance.domain is required");
  }

  const domain = ensureTrailingSlashless(raw.instance.domain.trim());
  const instanceBaseUrl = `https://${domain}`;
  const actors = {};

  for (const [handle, actor] of Object.entries(raw.actors ?? {})) {
    if (!handle.trim()) {
      throw new Error("actor handle cannot be empty");
    }

    const publicKeyPem = await readMaybeFile(
      configDir,
      actor.publicKeyPem,
      actor.publicKeyPemFile,
    );
    const privateKeyPem = await readMaybeFile(
      configDir,
      actor.privateKeyPem,
      actor.privateKeyPemFile,
    );
    const previousPublicKeyPem = await readOptionalKeyFile(
      configDir,
      actor.previousPublicKeyPem,
      actor.previousPublicKeyPemFile,
    );

    if (!publicKeyPem.trim()) {
      throw new Error(`actors.${handle}.publicKeyPem or publicKeyPemFile is required`);
    }

    const actorUrl = `${instanceBaseUrl}/users/${handle}`;
    const keyId = actor.keyId?.trim() || `${actorUrl}#main-key`;
    const previousKeyId = previousPublicKeyPem
      ? actor.previousKeyId?.trim() || `${actorUrl}#previous-key`
      : null;

    actors[handle] = {
      handle,
      displayName: actor.displayName ?? handle,
      summary: actor.summary ?? "",
      autoAcceptFollows: actor.autoAcceptFollows !== false,
      aliases: actor.aliases ?? [],
      staticOutboxFile: actor.staticOutboxFile
        ? path.resolve(configDir, actor.staticOutboxFile)
        : null,
      profileUrl: `${instanceBaseUrl}/@${handle}`,
      actorUrl,
      inboxUrl: `${instanceBaseUrl}/users/${handle}/inbox`,
      outboxUrl: `${instanceBaseUrl}/users/${handle}/outbox`,
      followersUrl: `${instanceBaseUrl}/users/${handle}/followers`,
      followingUrl: `${instanceBaseUrl}/users/${handle}/following`,
      publicKeyPem,
      privateKeyPem,
      keyId,
      previousPublicKeyPem,
      previousKeyId,
    };
  }

  return {
    instance: {
      domain,
      baseUrl: instanceBaseUrl,
      title: raw.instance.title ?? "Matters Instance",
      summary: raw.instance.summary ?? "",
      softwareName: raw.instance.softwareName ?? "matters-gateway-core",
      softwareVersion: raw.instance.softwareVersion ?? "0.1.0",
      openRegistrations: raw.instance.openRegistrations === true,
    },
    actors,
    remoteActors: raw.remoteActors ?? {},
    remoteDiscovery: {
      cacheTtlMs: raw.remoteDiscovery?.cacheTtlMs ?? 60 * 60 * 1000,
    },
    delivery: {
      maxAttempts: raw.delivery?.maxAttempts ?? 2,
      userAgent: raw.delivery?.userAgent ?? "MattersGatewayCore/0.1.0",
      processingLeaseTimeoutMs:
        Number.isFinite(raw.delivery?.processingLeaseTimeoutMs) && raw.delivery.processingLeaseTimeoutMs > 0
          ? Math.floor(raw.delivery.processingLeaseTimeoutMs)
          : 15 * 60 * 1000,
    },
    moderation: {
      domainBlocks: (raw.moderation?.domainBlocks ?? []).map((entry) => {
        if (typeof entry === "string") {
          return {
            domain: entry,
            reason: "configured block",
            source: "config",
          };
        }

        return {
          domain: entry.domain,
          reason: entry.reason ?? "configured block",
          source: entry.source ?? "config",
        };
      }),
      actorSuspensions: (raw.moderation?.actorSuspensions ?? []).map((entry) => ({
        actorHandle: entry.actorHandle,
        reason: entry.reason ?? "configured suspension",
        source: entry.source ?? "config",
      })),
      remoteActorPolicies: normalizeRemoteActorPolicies(raw.moderation?.remoteActorPolicies),
      evidenceRetentionDays:
        Number.isFinite(raw.moderation?.evidenceRetentionDays) && raw.moderation.evidenceRetentionDays > 0
          ? Math.floor(raw.moderation.evidenceRetentionDays)
          : 365,
      rateLimits: normalizeRateLimitPolicies(raw.moderation?.rateLimits ?? {}),
    },
    runtime: {
      storeDriver: raw.runtime?.storeDriver ?? "file",
      stateFile: path.resolve(configDir, raw.runtime?.stateFile ?? "../runtime/state.json"),
      sqliteFile: path.resolve(configDir, raw.runtime?.sqliteFile ?? "../runtime/state.sqlite"),
      alerting: {
        ...normalizeRuntimeAlerting(raw.runtime?.alerting),
        dispatch: await normalizeRuntimeAlertDispatch(configDir, raw.runtime?.alerting?.dispatch),
      },
      metrics: {
        dispatch: await normalizeRuntimeMetricsDispatch(configDir, raw.runtime?.metrics?.dispatch),
      },
      logs: {
        dispatch: await normalizeRuntimeLogsDispatch(configDir, raw.runtime?.logs?.dispatch),
      },
    },
  };
}
