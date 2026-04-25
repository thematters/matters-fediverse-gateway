import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildContentDeliveryProjectionBundle,
  buildContentDeliveryRecentReplayItems,
  combineContentDeliveryActivityIndexes,
  combineContentDeliveryReviewSnapshots,
} from "../lib/content-delivery-ops.mjs";

function createInitialState() {
  return {
    actors: {},
    remoteActors: {},
    mentionResolutions: {},
    processedActivities: {},
    domainBlocks: {},
    actorSuspensions: {},
    remoteActorPolicies: {},
    legalTakedowns: {},
    rateLimitPolicies: {},
    rateLimitCounters: {},
    abuseQueue: [],
    auditLog: [],
    evidenceRecords: [],
    outboundQueue: [],
    deadLetters: [],
    traces: [],
    contentDeliveryProjections: {},
  };
}

function normalizeDeadLetterRecord(record) {
  if (!record) {
    return null;
  }

  if (record.item) {
    return {
      replayHistory: [],
      ...record,
      replayHistory: record.replayHistory ?? [],
    };
  }

  return {
    id: record.id,
    status: "open",
    actorHandle: record.actorHandle ?? null,
    targetActorId: record.targetActorId ?? null,
    activityId: record.activity?.id ?? null,
    activityType: record.activity?.type ?? null,
    recordedAt: record.deadLetteredAt ?? null,
    replayHistory: [],
    item: record,
  };
}

function buildDeadLetterRecordFromItem(item, existingDeadLetter = null) {
  return {
    ...(existingDeadLetter ?? {}),
    id: item.id,
    status: existingDeadLetter?.status ?? "open",
    actorHandle: item.actorHandle ?? existingDeadLetter?.actorHandle ?? null,
    targetActorId: item.targetActorId ?? existingDeadLetter?.targetActorId ?? null,
    activityId: item.activity?.id ?? existingDeadLetter?.activityId ?? null,
    activityType: item.activity?.type ?? existingDeadLetter?.activityType ?? null,
    recordedAt: item.deadLetteredAt ?? existingDeadLetter?.recordedAt ?? null,
    replayHistory: existingDeadLetter?.replayHistory ?? [],
    lastReplay: existingDeadLetter?.lastReplay ?? null,
    item: structuredClone(item),
  };
}

function getAgeMs(isoTimestamp, nowIso) {
  if (!isoTimestamp) {
    return null;
  }

  const ageMs = Date.parse(nowIso) - Date.parse(isoTimestamp);
  return Number.isFinite(ageMs) ? ageMs : null;
}

function clearOutboundDeliveryLease(item) {
  delete item.deliveryLease;
  delete item.processingStartedAt;
}

function isOutboundDeliveryLeaseStale(item, { now, maxLeaseAgeMs }) {
  if (item?.status !== "processing") {
    return false;
  }

  const leaseTimestamp = item.processingStartedAt ?? item.deliveryLease?.leasedAt ?? null;
  if (!leaseTimestamp) {
    return true;
  }

  const ageMs = getAgeMs(leaseTimestamp, now);
  return ageMs === null || ageMs >= maxLeaseAgeMs;
}

function buildStorageAlerts({ runtimeMetadata, queueSnapshot, now, thresholds }) {
  const items = [];
  const normalizedThresholds = {
    backupStaleMs: thresholds?.backupStaleMs ?? 24 * 60 * 60 * 1000,
    pendingAgeMs: thresholds?.pendingAgeMs ?? 15 * 60 * 1000,
    openDeadLetters: thresholds?.openDeadLetters ?? 1,
    pendingQueue: thresholds?.pendingQueue ?? 25,
  };

  if (!runtimeMetadata.lastBackupAt) {
    items.push({
      code: "storage.backup.missing",
      severity: "error",
      observed: null,
      threshold: null,
      message: "尚未建立任何 backup",
    });
  } else {
    const backupAgeMs = getAgeMs(runtimeMetadata.lastBackupAt, now);
    if (backupAgeMs !== null && backupAgeMs > normalizedThresholds.backupStaleMs) {
      items.push({
        code: "storage.backup.stale",
        severity: "warn",
        observed: backupAgeMs,
        threshold: normalizedThresholds.backupStaleMs,
        message: "最近一次 backup 已超過警戒門檻",
      });
    }
  }

  if (normalizedThresholds.pendingQueue > 0 && (queueSnapshot.summary.pending ?? 0) > normalizedThresholds.pendingQueue) {
    items.push({
      code: "storage.queue.pending-volume",
      severity: "warn",
      observed: queueSnapshot.summary.pending ?? 0,
      threshold: normalizedThresholds.pendingQueue,
      message: "outbound pending queue 超過門檻",
    });
  }

  const oldestPendingAgeMs = getAgeMs(queueSnapshot.summary.oldestPendingAt, now);
  if (oldestPendingAgeMs !== null && oldestPendingAgeMs > normalizedThresholds.pendingAgeMs) {
    items.push({
      code: "storage.queue.pending-age",
      severity: "warn",
      observed: oldestPendingAgeMs,
      threshold: normalizedThresholds.pendingAgeMs,
      message: "最舊 pending outbound item 停留過久",
    });
  }

  if (
    normalizedThresholds.openDeadLetters > 0 &&
    (queueSnapshot.deadLetters.open ?? 0) >= normalizedThresholds.openDeadLetters
  ) {
    items.push({
      code: "storage.dead-letter.open",
      severity: "warn",
      observed: queueSnapshot.deadLetters.open ?? 0,
      threshold: normalizedThresholds.openDeadLetters,
      message: "仍有 open dead letter 需要處理",
    });
  }

  return {
    generatedAt: now,
    thresholds: normalizedThresholds,
    items,
  };
}

function countActorCollections(actors, collectionKey) {
  return Object.values(actors).reduce((total, actorState) => total + Object.keys(actorState[collectionKey] ?? {}).length, 0);
}

function summarizeQueueObservability({ outboundQueue, deadLetters, traces }) {
  const normalizedDeadLetters = deadLetters.map((entry) => normalizeDeadLetterRecord(entry)).filter(Boolean);
  const outbound = {
    total: outboundQueue.length,
    pending: outboundQueue.filter((item) => item.status === "pending").length,
    delivered: outboundQueue.filter((item) => item.status === "delivered").length,
    deadLetter: outboundQueue.filter((item) => item.status === "dead-letter").length,
    retriedPending: outboundQueue.filter((item) => item.status === "pending" && (item.attempts ?? 0) > 0).length,
    oldestPendingCreatedAt:
      outboundQueue
        .filter((item) => item.status === "pending" && item.createdAt)
        .map((item) => item.createdAt)
        .sort()[0] ?? null,
  };

  return {
    outbound,
    deadLetters: {
      total: normalizedDeadLetters.length,
      open: normalizedDeadLetters.filter((item) => item.status === "open").length,
      replayed: normalizedDeadLetters.filter((item) => item.status === "replayed").length,
      oldestRecordedAt: normalizedDeadLetters.map((item) => item.recordedAt).filter(Boolean).sort()[0] ?? null,
    },
    traces: {
      total: traces.length,
      lastTimestamp: traces.at(-1)?.timestamp ?? null,
    },
  };
}

export class FileStateStore {
  constructor({ stateFile }) {
    this.stateFile = stateFile;
    this.state = createInitialState();
    this.lastBackupAt = null;
    this.lastReconciledAt = null;
  }

  async init() {
    await mkdir(path.dirname(this.stateFile), { recursive: true });

    try {
      const raw = await readFile(this.stateFile, "utf8");
      this.state = {
        ...createInitialState(),
        ...JSON.parse(raw),
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      await this.#persist();
    }
  }

  ensureActor(handle) {
    this.state.actors[handle] ??= {};
    this.state.actors[handle].followers ??= {};
    this.state.actors[handle].following ??= {};
    this.state.actors[handle].inboundObjects ??= {};
    this.state.actors[handle].inboundEngagements ??= {};
    this.state.actors[handle].localConversations ??= {};
    this.state.actors[handle].localContents ??= {};
    this.state.actors[handle].localNotifications ??= {};
  }

  getRemoteActor(actorId) {
    return this.state.remoteActors[actorId] ?? null;
  }

  async upsertRemoteActor(actorId, remoteActorRecord) {
    this.state.remoteActors[actorId] = remoteActorRecord;
    await this.#persist();
  }

  getMentionResolution(account) {
    return this.state.mentionResolutions[account] ?? null;
  }

  getMentionResolutions({ status = null, actorHandle = null, surface = null, limit = 50 } = {}) {
    const filtered = Object.values(this.state.mentionResolutions).filter((entry) => {
      if (status && entry.status !== status) {
        return false;
      }
      if (actorHandle && entry.actorHandle !== actorHandle) {
        return false;
      }
      if (surface && entry.surface !== surface) {
        return false;
      }
      return true;
    });

    return filtered.slice(-limit);
  }

  async upsertMentionResolution(account, mentionResolutionRecord) {
    this.state.mentionResolutions[account] = mentionResolutionRecord;
    await this.#persist();
  }

  async seedRemoteActorPolicies(remoteActorPolicies) {
    for (const policyRecord of remoteActorPolicies ?? []) {
      this.state.remoteActorPolicies[policyRecord.actorId] = policyRecord;
    }
    await this.#persist();
  }

  getRemoteActorPolicy(actorId) {
    return this.state.remoteActorPolicies[actorId] ?? null;
  }

  getRemoteActorPolicies() {
    return Object.values(this.state.remoteActorPolicies).sort((left, right) => left.actorId.localeCompare(right.actorId));
  }

  async upsertRemoteActorPolicy(policyRecord) {
    this.state.remoteActorPolicies[policyRecord.actorId] = policyRecord;
    await this.#persist();
  }

  async removeRemoteActorPolicy(actorId) {
    delete this.state.remoteActorPolicies[actorId];
    await this.#persist();
  }

  getSnapshot() {
    const snapshot = structuredClone(this.state);
    snapshot.deadLetters = snapshot.deadLetters.map((entry) => normalizeDeadLetterRecord(entry));
    return snapshot;
  }

  hasProcessed(activityId) {
    return Boolean(activityId && this.state.processedActivities[activityId]);
  }

  async recordProcessed(activityId, result) {
    if (!activityId) {
      return;
    }

    this.state.processedActivities[activityId] = result;
    await this.#persist();
  }

  async seedDomainBlocks(domainBlocks) {
    for (const blockRecord of domainBlocks ?? []) {
      this.state.domainBlocks[blockRecord.domain] = blockRecord;
    }
    await this.#persist();
  }

  getDomainBlock(domain) {
    return this.state.domainBlocks[domain] ?? null;
  }

  getDomainBlocks() {
    return Object.values(this.state.domainBlocks).sort((left, right) => left.domain.localeCompare(right.domain));
  }

  async upsertDomainBlock(blockRecord) {
    this.state.domainBlocks[blockRecord.domain] = blockRecord;
    await this.#persist();
  }

  async removeDomainBlock(domain) {
    delete this.state.domainBlocks[domain];
    await this.#persist();
  }

  getActorSuspension(handle) {
    return this.state.actorSuspensions[handle] ?? null;
  }

  getActorSuspensions() {
    return Object.values(this.state.actorSuspensions).sort((left, right) => left.actorHandle.localeCompare(right.actorHandle));
  }

  async upsertActorSuspension(suspensionRecord) {
    this.state.actorSuspensions[suspensionRecord.actorHandle] = suspensionRecord;
    await this.#persist();
  }

  async removeActorSuspension(actorHandle) {
    delete this.state.actorSuspensions[actorHandle];
    await this.#persist();
  }

  getLegalTakedown(caseId) {
    return this.state.legalTakedowns[caseId] ?? null;
  }

  getLegalTakedowns(status = null) {
    return Object.values(this.state.legalTakedowns)
      .filter((entry) => (status ? entry.status === status : true))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getActiveLegalTakedownByObjectId(objectId) {
    return (
      Object.values(this.state.legalTakedowns).find(
        (entry) => entry.objectId === objectId && entry.status === "open",
      ) ?? null
    );
  }

  async upsertLegalTakedown(takedownRecord) {
    this.state.legalTakedowns[takedownRecord.caseId] = takedownRecord;
    await this.#persist();
  }

  async seedRateLimitPolicies(rateLimitPolicies) {
    for (const policyRecord of rateLimitPolicies ?? []) {
      this.state.rateLimitPolicies[policyRecord.policyKey] = policyRecord;
    }
    await this.#persist();
  }

  getRateLimitPolicy(policyKey) {
    return this.state.rateLimitPolicies[policyKey] ?? null;
  }

  getRateLimitPolicies() {
    return Object.values(this.state.rateLimitPolicies).sort((left, right) => left.policyKey.localeCompare(right.policyKey));
  }

  async upsertRateLimitPolicy(policyRecord) {
    this.state.rateLimitPolicies[policyRecord.policyKey] = policyRecord;
    await this.#persist();
  }

  getRateLimitCounters() {
    return Object.values(this.state.rateLimitCounters).sort((left, right) => left.counterKey.localeCompare(right.counterKey));
  }

  async evaluateRateLimit({ policyKey, counterKey, limit, windowMs, now }) {
    const nowMs = typeof now === "number" ? now : Date.parse(now);
    const nowIso = new Date(nowMs).toISOString();
    const resetAtMs = nowMs + windowMs;
    const existingCounter = this.state.rateLimitCounters[counterKey];
    const expired = !existingCounter || nowMs >= Date.parse(existingCounter.resetAt);
    const counterRecord = expired
      ? {
          policyKey,
          counterKey,
          count: 0,
          windowStartedAt: nowIso,
          resetAt: new Date(resetAtMs).toISOString(),
          updatedAt: nowIso,
        }
      : existingCounter;

    counterRecord.count += 1;
    counterRecord.updatedAt = nowIso;
    this.state.rateLimitCounters[counterKey] = counterRecord;
    await this.#persist();

    return {
      allowed: counterRecord.count <= limit,
      count: counterRecord.count,
      limit,
      remaining: Math.max(limit - counterRecord.count, 0),
      resetAt: counterRecord.resetAt,
      retryAfterMs: Math.max(Date.parse(counterRecord.resetAt) - nowMs, 0),
      counterKey,
      policyKey,
    };
  }

  async recordAbuseCase(abuseCase) {
    this.state.abuseQueue.push(abuseCase);
    await this.#persist();
  }

  getAbuseQueue(status = null) {
    return this.state.abuseQueue.filter((entry) => (status ? entry.status === status : true));
  }

  async resolveAbuseCase(id, resolution) {
    const abuseCase = this.state.abuseQueue.find((entry) => entry.id === id) ?? null;
    if (!abuseCase) {
      return null;
    }

    abuseCase.status = "resolved";
    abuseCase.resolution = resolution;
    await this.#persist();
    return abuseCase;
  }

  async recordAuditEvent(event) {
    this.state.auditLog.push(event);
    if (event?.event === "dead-letter.replayed" && event.actorHandle) {
      this.#recordContentDeliveryReplay(event.actorHandle, event);
    }
    await this.#persist();
  }

  getAuditLog(limit = 50) {
    return this.state.auditLog.slice(-limit);
  }

  async recordEvidence(evidenceRecord) {
    this.state.evidenceRecords.push(evidenceRecord);
    await this.#persist();
  }

  getEvidenceRecords({ category = null, actorHandle = null, status = null, limit = 50 } = {}) {
    const filtered = this.state.evidenceRecords.filter((entry) => {
      if (category && entry.category !== category) {
        return false;
      }
      if (actorHandle && entry.actorHandle !== actorHandle) {
        return false;
      }
      if (status && entry.status !== status) {
        return false;
      }
      return true;
    });

    return filtered.slice(-limit);
  }

  getTraces({ limit = 50, eventPrefix = null } = {}) {
    const filtered = this.state.traces.filter((entry) => {
      if (!eventPrefix) {
        return true;
      }

      return typeof entry.event === "string" && entry.event.startsWith(eventPrefix);
    });

    return filtered.slice(-limit);
  }

  getQueueSnapshot({ traceLimit = 20 } = {}) {
    const outboundItems = this.state.outboundQueue;
    const deadLetters = this.getDeadLetters({ limit: this.state.deadLetters.length || 50 });
    const pendingItems = outboundItems.filter((item) => item.status === "pending");
    const processingItems = outboundItems.filter((item) => item.status === "processing");

    return {
      summary: {
        total: outboundItems.length,
        pending: pendingItems.length,
        processing: processingItems.length,
        delivered: outboundItems.filter((item) => item.status === "delivered").length,
        deadLetter: outboundItems.filter((item) => item.status === "dead-letter").length,
        retryPending: pendingItems.filter((item) => (item.attempts ?? 0) > 0).length,
        oldestPendingAt: pendingItems[0]?.createdAt ?? null,
        oldestProcessingAt:
          processingItems
            .slice()
            .sort((left, right) => {
              const leftAt = left.processingStartedAt ?? left.deliveryLease?.leasedAt ?? left.createdAt ?? "";
              const rightAt = right.processingStartedAt ?? right.deliveryLease?.leasedAt ?? right.createdAt ?? "";
              return leftAt.localeCompare(rightAt);
            })[0]?.processingStartedAt ??
          processingItems
            .slice()
            .sort((left, right) => {
              const leftAt = left.processingStartedAt ?? left.deliveryLease?.leasedAt ?? left.createdAt ?? "";
              const rightAt = right.processingStartedAt ?? right.deliveryLease?.leasedAt ?? right.createdAt ?? "";
              return leftAt.localeCompare(rightAt);
            })[0]?.deliveryLease?.leasedAt ??
          null,
        oldestDeadLetterAt: deadLetters.find((entry) => entry.status === "open")?.recordedAt ?? null,
      },
      deadLetters: {
        open: deadLetters.filter((entry) => entry.status === "open").length,
        replayed: deadLetters.filter((entry) => entry.status === "replayed").length,
      },
      recentDeadLetters: deadLetters.slice(-5),
      recentDeliveryTraces: this.getTraces({ limit: traceLimit, eventPrefix: "delivery." }),
    };
  }

  getDashboardSnapshot() {
    return {
      domainBlocks: this.getDomainBlocks().length,
      actorSuspensions: this.getActorSuspensions().length,
      remoteActorPolicies: this.getRemoteActorPolicies().length,
      legalTakedownsOpen: this.getLegalTakedowns("open").length,
      rateLimitPolicies: this.getRateLimitPolicies().length,
      rateLimitCounters: this.getRateLimitCounters().length,
      abuseCasesOpen: this.getAbuseQueue("open").length,
      abuseCasesResolved: this.getAbuseQueue("resolved").length,
      evidenceRecords: this.state.evidenceRecords.length,
      outboundPending: this.getPendingOutbound().length,
      outboundProcessing: this.state.outboundQueue.filter((item) => item.status === "processing").length,
      deadLetters: this.state.deadLetters.length,
      auditEvents: this.state.auditLog.length,
    };
  }

  getQueueStats() {
    return summarizeQueueObservability({
      outboundQueue: this.state.outboundQueue,
      deadLetters: this.state.deadLetters,
      traces: this.state.traces,
    });
  }

  getRuntimeMetadata() {
    return {
      driver: "file",
      stateFile: this.stateFile,
      schemaVersion: 1,
      journalMode: null,
      initializedAt: null,
      lastMigratedAt: null,
      lastBackupAt: this.lastBackupAt,
      lastReconciledAt: this.lastReconciledAt,
      lastRestoredAt: null,
      restoredFromBackup: null,
      queueStats: this.getQueueStats(),
    };
  }

  getStorageAlerts({ now = new Date().toISOString(), thresholds = {} } = {}) {
    return buildStorageAlerts({
      runtimeMetadata: this.getRuntimeMetadata(),
      queueSnapshot: this.getQueueSnapshot(),
      now,
      thresholds,
    });
  }

  getMetricsSnapshot({ now = new Date().toISOString() } = {}) {
    const queue = this.getQueueSnapshot();
    const runtime = this.getRuntimeMetadata();
    const dashboard = this.getDashboardSnapshot();

    return {
      generatedAt: now,
      runtime: {
        driver: runtime.driver,
        schemaVersion: runtime.schemaVersion,
        lastBackupAt: runtime.lastBackupAt,
        lastReconciledAt: runtime.lastReconciledAt,
        lastRestoredAt: runtime.lastRestoredAt,
      },
      queue: {
        ...queue.summary,
        openDeadLetters: queue.deadLetters.open,
        replayedDeadLetters: queue.deadLetters.replayed,
      },
      moderation: {
        domainBlocks: dashboard.domainBlocks,
        actorSuspensions: dashboard.actorSuspensions,
        remoteActorPolicies: dashboard.remoteActorPolicies,
        legalTakedownsOpen: dashboard.legalTakedownsOpen,
        abuseCasesOpen: dashboard.abuseCasesOpen,
        abuseCasesResolved: dashboard.abuseCasesResolved,
        evidenceRecords: dashboard.evidenceRecords,
      },
      activity: {
        actors: Object.keys(this.state.actors).length,
        remoteActors: Object.keys(this.state.remoteActors).length,
        mentionResolutions: Object.keys(this.state.mentionResolutions).length,
        followers: countActorCollections(this.state.actors, "followers"),
        inboundObjects: countActorCollections(this.state.actors, "inboundObjects"),
        inboundEngagements: countActorCollections(this.state.actors, "inboundEngagements"),
        localConversations: countActorCollections(this.state.actors, "localConversations"),
        localContents: countActorCollections(this.state.actors, "localContents"),
        localNotifications: countActorCollections(this.state.actors, "localNotifications"),
      },
      audit: {
        auditEvents: this.state.auditLog.length,
        traces: this.state.traces.length,
      },
    };
  }

  async upsertFollower(handle, followerRecord) {
    this.ensureActor(handle);
    this.state.actors[handle].followers[followerRecord.remoteActorId] = followerRecord;
    await this.#persist();
  }

  getFollower(handle, remoteActorId) {
    this.ensureActor(handle);
    return this.state.actors[handle].followers[remoteActorId] ?? null;
  }

  async removeFollower(handle, remoteActorId) {
    this.ensureActor(handle);
    delete this.state.actors[handle].followers[remoteActorId];
    await this.#persist();
  }

  getFollowers(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].followers);
  }

  async upsertInboundObject(handle, inboundObjectRecord) {
    this.ensureActor(handle);
    this.state.actors[handle].inboundObjects[inboundObjectRecord.objectId] = inboundObjectRecord;
    await this.#persist();
  }

  getInboundObject(handle, objectId) {
    this.ensureActor(handle);
    return this.state.actors[handle].inboundObjects[objectId] ?? null;
  }

  getInboundObjects(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].inboundObjects);
  }

  async upsertInboundEngagement(handle, engagementRecord) {
    this.ensureActor(handle);
    this.state.actors[handle].inboundEngagements[engagementRecord.activityId] = engagementRecord;
    await this.#persist();
  }

  getInboundEngagement(handle, activityId) {
    this.ensureActor(handle);
    return this.state.actors[handle].inboundEngagements[activityId] ?? null;
  }

  async removeInboundEngagement(handle, activityId) {
    this.ensureActor(handle);
    delete this.state.actors[handle].inboundEngagements[activityId];
    await this.#persist();
  }

  getInboundEngagements(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].inboundEngagements);
  }

  async replaceLocalConversations(handle, conversationRecords) {
    this.ensureActor(handle);
    this.state.actors[handle].localConversations = Object.fromEntries(
      (conversationRecords ?? []).map((record) => [record.threadId, record]),
    );
    await this.#persist();
  }

  async replaceLocalContents(handle, contentRecords) {
    this.ensureActor(handle);
    this.state.actors[handle].localContents = Object.fromEntries(
      (contentRecords ?? []).map((record) => [record.contentId, record]),
    );
    this.#refreshContentDeliveryProjection(handle);
    await this.#persist();
  }

  async replaceLocalNotifications(handle, notificationRecords) {
    this.ensureActor(handle);
    this.state.actors[handle].localNotifications = Object.fromEntries(
      (notificationRecords ?? []).map((record) => [record.notificationId, record]),
    );
    await this.#persist();
  }

  getLocalConversation(handle, threadId) {
    this.ensureActor(handle);
    return this.state.actors[handle].localConversations[threadId] ?? null;
  }

  getLocalConversations(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].localConversations);
  }

  getLocalContent(handle, contentId) {
    this.ensureActor(handle);
    return this.state.actors[handle].localContents[contentId] ?? null;
  }

  getLocalContents(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].localContents);
  }

  getLocalNotification(handle, notificationId) {
    this.ensureActor(handle);
    return this.state.actors[handle].localNotifications[notificationId] ?? null;
  }

  getLocalNotifications(handle) {
    this.ensureActor(handle);
    return Object.values(this.state.actors[handle].localNotifications);
  }

  getContentDeliveryProjection(handle) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return null;
    }

    if (!this.state.contentDeliveryProjections[normalizedHandle]) {
      this.#refreshContentDeliveryProjection(normalizedHandle);
    }

    return this.state.contentDeliveryProjections[normalizedHandle] ?? null;
  }

  #refreshContentDeliveryProjection(handle, { recentReplays = null, existingProjection = null } = {}) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return;
    }

    const currentProjection = existingProjection ?? this.state.contentDeliveryProjections[normalizedHandle] ?? null;
    const normalizedRecentReplays = recentReplays ?? currentProjection?.review?.recentReplays ?? [];
    const contents = this.getLocalContents(normalizedHandle);
    const outboundItems = this.getOutboundItems({ actorHandle: normalizedHandle });
    this.state.contentDeliveryProjections[normalizedHandle] = buildContentDeliveryProjectionBundle({
      actorHandle: normalizedHandle,
      contents,
      outboundItems,
      recentReplays: normalizedRecentReplays,
    });
  }

  #recordContentDeliveryReplay(handle, replayEvent) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return;
    }

    const existingProjection = this.state.contentDeliveryProjections[normalizedHandle] ?? null;
    const recentReplays = [...(existingProjection?.review?.recentReplays ?? []), replayEvent];
    this.#refreshContentDeliveryProjection(normalizedHandle, { recentReplays, existingProjection });
  }

  getContentDeliveryReviewSnapshot({
    actorHandle = null,
    limit = 20,
    status = null,
    replayedOnly = false,
    replayableOnly = false,
  } = {}) {
    const normalizedActorHandle = typeof actorHandle === "string" && actorHandle.trim() ? actorHandle.trim() : null;
    const handles = normalizedActorHandle
      ? [normalizedActorHandle]
      : [...new Set([...Object.keys(this.state.actors), ...Object.keys(this.state.contentDeliveryProjections)])].filter(
          (value) => typeof value === "string" && value.trim(),
        );
    const snapshots = handles.map((handle) => this.getContentDeliveryProjection(handle)).filter(Boolean);
    const recentReplayEntries = buildContentDeliveryRecentReplayItems(this.state.auditLog, {
      actorHandle: normalizedActorHandle,
      limit: limit * 5,
    });
    if (!snapshots.length) {
      return combineContentDeliveryReviewSnapshots([], {
        actorHandle: normalizedActorHandle,
        limit,
        status,
        replayedOnly,
        replayableOnly,
        recentReplayEntries,
      });
    }

    return combineContentDeliveryReviewSnapshots(snapshots, {
      actorHandle: normalizedActorHandle,
      limit,
      status,
      replayedOnly,
      replayableOnly,
      recentReplayEntries,
    });
  }

  async enqueueOutbound(item) {
    this.state.outboundQueue.push(item);
    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return item;
  }

  async claimOutboundDelivery(id, { leaseId, leasedAt = new Date().toISOString() } = {}) {
    const item = this.getOutboundItem(id);
    if (!item || item.status !== "pending") {
      return null;
    }

    item.status = "processing";
    item.processingStartedAt = leasedAt;
    item.deliveryLease = {
      leaseId: leaseId?.trim() || `lease-${Date.now()}`,
      leasedAt,
    };
    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return structuredClone(item);
  }

  async recoverStaleOutboundDeliveries({ now = new Date().toISOString(), maxLeaseAgeMs = 15 * 60 * 1000 } = {}) {
    const touchedActors = new Set();
    const recovered = [];

    for (const item of this.state.outboundQueue) {
      if (!isOutboundDeliveryLeaseStale(item, { now, maxLeaseAgeMs })) {
        continue;
      }

      clearOutboundDeliveryLease(item);
      item.status = "pending";
      item.lastRecoveredAt = now;
      item.recoveredDeliveryCount = (item.recoveredDeliveryCount ?? 0) + 1;
      touchedActors.add(item.actorHandle);
      recovered.push(structuredClone(item));
    }

    if (recovered.length > 0) {
      for (const actorHandle of touchedActors) {
        this.#refreshContentDeliveryProjection(actorHandle);
      }
      await this.#persist();
    }

    return recovered;
  }

  getOutboundItem(id) {
    return this.state.outboundQueue.find((item) => item.id === id) ?? null;
  }

  getPendingOutbound() {
    return this.state.outboundQueue.filter((item) => item.status === "pending");
  }

  getOutboundItems({ actorHandle = null } = {}) {
    return this.state.outboundQueue.filter((item) => {
      if (actorHandle && item.actorHandle !== actorHandle) {
        return false;
      }
      return true;
    });
  }

  getContentDeliveryOpsSnapshot({ actorHandle = null, actorHandles = null, limit = 20, status = null } = {}) {
    return this.getContentDeliveryReviewSnapshot({
      actorHandle,
      limit,
      status,
    });
  }

  getContentDeliveryActivityIndex({
    actorHandle = null,
    actorHandles = null,
    limit = 20,
    status = null,
    actionType = null,
    activityId = null,
    replayedOnly = false,
    replayableOnly = false,
  } = {}) {
    const normalizedActorHandle = typeof actorHandle === "string" && actorHandle.trim() ? actorHandle.trim() : null;
    const handles = normalizedActorHandle
      ? [normalizedActorHandle]
      : [...new Set([...Object.keys(this.state.actors), ...Object.keys(this.state.contentDeliveryProjections)])].filter(
          (value) => typeof value === "string" && value.trim(),
        );
    const snapshots = handles.map((handle) => this.getContentDeliveryProjection(handle)).filter(Boolean);
    const recentReplayEntries = buildContentDeliveryRecentReplayItems(this.state.auditLog, {
      actorHandle: normalizedActorHandle,
      limit: limit * 5,
    });
    return combineContentDeliveryActivityIndexes(snapshots, {
      actorHandle: normalizedActorHandle,
      limit,
      status,
      actionType,
      activityId,
      replayedOnly,
      replayableOnly,
      recentReplayEntries,
    });
  }

  getDeadLetter(id) {
    const record = this.state.deadLetters.find((entry) => entry.id === id) ?? null;
    return normalizeDeadLetterRecord(record);
  }

  getDeadLetters({ status = null, actorHandle = null, limit = 50 } = {}) {
    const normalized = this.state.deadLetters
      .map((entry) => normalizeDeadLetterRecord(entry))
      .filter((entry) => {
        if (!entry) {
          return false;
        }
        if (status && entry.status !== status) {
          return false;
        }
        if (actorHandle && entry.actorHandle !== actorHandle) {
          return false;
        }
        return true;
      });

    return normalized.slice(-limit);
  }

  async markOutboundDelivered(id, extra = {}) {
    const item = this.getOutboundItem(id);
    if (!item) {
      return null;
    }

    item.status = "delivered";
    item.deliveredAt = new Date().toISOString();
    clearOutboundDeliveryLease(item);
    Object.assign(item, extra);
    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return item;
  }

  async markOutboundRetryable(id, error) {
    const item = this.getOutboundItem(id);
    if (!item) {
      return null;
    }

    item.attempts += 1;
    item.lastError = error.message;
    item.lastFailureAt = new Date().toISOString();
    item.status = "pending";
    clearOutboundDeliveryLease(item);
    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return item;
  }

  async moveOutboundToDeadLetter(id, error) {
    const item = this.getOutboundItem(id);
    if (!item) {
      return null;
    }

    item.attempts += 1;
    item.lastError = error.message;
    item.deadLetteredAt = new Date().toISOString();
    item.status = "dead-letter";
    clearOutboundDeliveryLease(item);
    const deadLetterRecord = {
      ...(this.getDeadLetter(id) ?? {}),
      id: item.id,
      status: "open",
      actorHandle: item.actorHandle ?? null,
      targetActorId: item.targetActorId ?? null,
      activityId: item.activity?.id ?? null,
      activityType: item.activity?.type ?? null,
      recordedAt: item.deadLetteredAt,
      item: structuredClone(item),
      replayHistory: this.getDeadLetter(id)?.replayHistory ?? [],
    };
    const deadLetterIndex = this.state.deadLetters.findIndex((entry) => entry.id === id);
    if (deadLetterIndex >= 0) {
      this.state.deadLetters[deadLetterIndex] = deadLetterRecord;
    } else {
      this.state.deadLetters.push(deadLetterRecord);
    }
    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return item;
  }

  async replayDeadLetter(id, replayRecord) {
    const item = this.getOutboundItem(id);
    if (!item) {
      return null;
    }

    const deadLetter = this.getDeadLetter(id);
    if (!deadLetter) {
      return null;
    }

    item.status = "pending";
    item.lastReplayAt = replayRecord.replayedAt;
    item.lastReplayBy = replayRecord.replayedBy;
    item.lastReplayReason = replayRecord.reason;
    item.replayCount = (item.replayCount ?? 0) + 1;
    clearOutboundDeliveryLease(item);

    const updatedDeadLetter = {
      ...deadLetter,
      status: "replayed",
      replayHistory: [...(deadLetter.replayHistory ?? []), replayRecord],
      lastReplay: replayRecord,
      item: structuredClone(item),
    };
    const deadLetterIndex = this.state.deadLetters.findIndex((entry) => entry.id === id);
    this.state.deadLetters[deadLetterIndex] = updatedDeadLetter;

    this.#refreshContentDeliveryProjection(item.actorHandle);
    await this.#persist();
    return {
      deadLetter: updatedDeadLetter,
      item: structuredClone(item),
    };
  }

  async reconcileStorage({ now = new Date().toISOString(), dryRun = false } = {}) {
    const outboundItems = this.state.outboundQueue.map((item) => structuredClone(item));
    const deadLetterMap = new Map(
      this.state.deadLetters
        .map((entry) => normalizeDeadLetterRecord(entry))
        .filter(Boolean)
        .map((entry) => [entry.id, entry]),
    );
    let backfilledDeadLetters = 0;
    let refreshedDeadLetters = 0;

    for (const item of outboundItems) {
      if (item.status !== "dead-letter") {
        continue;
      }

      const existingDeadLetter = deadLetterMap.get(item.id) ?? null;
      const nextDeadLetter = buildDeadLetterRecordFromItem(item, existingDeadLetter);
      if (!existingDeadLetter) {
        backfilledDeadLetters += 1;
        deadLetterMap.set(item.id, nextDeadLetter);
        continue;
      }

      if (JSON.stringify(existingDeadLetter.item) !== JSON.stringify(nextDeadLetter.item)) {
        refreshedDeadLetters += 1;
        deadLetterMap.set(item.id, nextDeadLetter);
      }
    }

    const outboundIds = new Set(outboundItems.map((item) => item.id));
    const orphanedDeadLetters = [...deadLetterMap.values()].filter((entry) => !outboundIds.has(entry.id)).length;
    const report = {
      driver: "file",
      reconciledAt: now,
      dryRun,
      summary: {
        backfilledDeadLetters,
        refreshedDeadLetters,
        orphanedDeadLetters,
      },
    };

    if (!dryRun) {
      this.state.deadLetters = [...deadLetterMap.values()];
      this.lastReconciledAt = now;
      await this.#persist();
    }

    return report;
  }

  async recordTrace(trace) {
    this.state.traces.push(trace);
    await this.#persist();
  }

  async createBackup(destinationFile) {
    const backupFile = path.resolve(destinationFile);
    await mkdir(path.dirname(backupFile), { recursive: true });
    await this.#persist();
    await copyFile(this.stateFile, backupFile);
    this.lastBackupAt = new Date().toISOString();

    return {
      driver: "file",
      backupFile,
      createdAt: this.lastBackupAt,
    };
  }

  async #persist() {
    const tempFile = `${this.stateFile}.tmp`;
    await writeFile(tempFile, JSON.stringify(this.state, null, 2));
    await rename(tempFile, this.stateFile);
  }
}
