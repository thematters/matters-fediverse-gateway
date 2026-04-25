import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildContentDeliveryProjectionBundle,
  buildContentDeliveryRecentReplayItems,
  combineContentDeliveryActivityIndexes,
  combineContentDeliveryReviewSnapshots,
} from "../lib/content-delivery-ops.mjs";

const SQLITE_SCHEMA_VERSION = 6;

function parseJson(value) {
  return value ? JSON.parse(value) : null;
}

function mapRows(rows, keyField) {
  const result = {};

  for (const row of rows) {
    result[row[keyField]] = parseJson(row.record_json);
  }

  return result;
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

function parseMeta(row, fallback = null) {
  return row ? parseJson(row.value_json) : fallback;
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

export class SqliteStateStore {
  constructor({ sqliteFile }) {
    this.sqliteFile = sqliteFile;
    this.db = null;
  }

  async init() {
    await mkdir(path.dirname(this.sqliteFile), { recursive: true });
    this.db = new Database(this.sqliteFile);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS actors (
        handle TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS remote_actors (
        actor_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mention_resolutions (
        account TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        actor_handle TEXT,
        surface TEXT,
        last_attempt_at TEXT,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_activities (
        activity_id TEXT PRIMARY KEY,
        result_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS domain_blocks (
        domain TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actor_suspensions (
        actor_handle TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remote_actor_policies (
        actor_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS legal_takedowns (
        case_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        object_id TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limit_policies (
        policy_key TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        counter_key TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS abuse_queue (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_records (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        actor_handle TEXT,
        status TEXT NOT NULL,
        retained_until TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_meta (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS followers (
        handle TEXT NOT NULL,
        remote_actor_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, remote_actor_id)
      );

      CREATE TABLE IF NOT EXISTS inbound_objects (
        handle TEXT NOT NULL,
        object_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, object_id)
      );

      CREATE TABLE IF NOT EXISTS inbound_engagements (
        handle TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, activity_id)
      );

      CREATE TABLE IF NOT EXISTS local_conversations (
        handle TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, thread_id)
      );

      CREATE TABLE IF NOT EXISTS local_contents (
        handle TEXT NOT NULL,
        content_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, content_id)
      );

      CREATE TABLE IF NOT EXISTS local_notifications (
        handle TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (handle, notification_id)
      );

      CREATE TABLE IF NOT EXISTS content_delivery_projections (
        handle TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbound_queue (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        item_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dead_letters (
        id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS traces (
        trace_id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_json TEXT NOT NULL
      );
    `);

    const initializedAt = parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("initialized_at"));
    if (!initializedAt) {
      this.db
        .prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)")
        .run("initialized_at", JSON.stringify(new Date().toISOString()));
    }
    this.db
      .prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)")
      .run("schema_version", JSON.stringify(SQLITE_SCHEMA_VERSION));
    this.db
      .prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)")
      .run("last_migrated_at", JSON.stringify(new Date().toISOString()));
    this.db
      .prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)")
      .run("journal_mode", JSON.stringify("wal"));
  }

  ensureActor(handle) {
    this.db.prepare("INSERT OR IGNORE INTO actors (handle) VALUES (?)").run(handle);
  }

  getRemoteActor(actorId) {
    const row = this.db.prepare("SELECT record_json FROM remote_actors WHERE actor_id = ?").get(actorId);
    return parseJson(row?.record_json) ?? null;
  }

  async upsertRemoteActor(actorId, remoteActorRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO remote_actors (actor_id, record_json) VALUES (?, ?)")
      .run(actorId, JSON.stringify(remoteActorRecord));
  }

  getMentionResolution(account) {
    const row = this.db.prepare("SELECT record_json FROM mention_resolutions WHERE account = ?").get(account);
    return parseJson(row?.record_json) ?? null;
  }

  getMentionResolutions({ status = null, actorHandle = null, surface = null, limit = 50 } = {}) {
    const clauses = [];
    const values = [];

    if (status) {
      clauses.push("status = ?");
      values.push(status);
    }
    if (actorHandle) {
      clauses.push("actor_handle = ?");
      values.push(actorHandle);
    }
    if (surface) {
      clauses.push("surface = ?");
      values.push(surface);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT record_json FROM mention_resolutions ${whereClause} ORDER BY rowid DESC LIMIT ?`)
      .all(...values, limit)
      .map((row) => parseJson(row.record_json))
      .reverse();
  }

  async upsertMentionResolution(account, mentionResolutionRecord) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO mention_resolutions (account, status, actor_handle, surface, last_attempt_at, record_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        account,
        mentionResolutionRecord.status,
        mentionResolutionRecord.actorHandle ?? null,
        mentionResolutionRecord.surface ?? null,
        mentionResolutionRecord.lastAttemptAt ?? null,
        JSON.stringify(mentionResolutionRecord),
      );
  }

  async seedRemoteActorPolicies(remoteActorPolicies) {
    for (const policyRecord of remoteActorPolicies ?? []) {
      this.db
        .prepare("INSERT OR REPLACE INTO remote_actor_policies (actor_id, record_json) VALUES (?, ?)")
        .run(policyRecord.actorId, JSON.stringify(policyRecord));
    }
  }

  getRemoteActorPolicy(actorId) {
    const row = this.db.prepare("SELECT record_json FROM remote_actor_policies WHERE actor_id = ?").get(actorId);
    return parseJson(row?.record_json) ?? null;
  }

  getRemoteActorPolicies() {
    return this.db
      .prepare("SELECT record_json FROM remote_actor_policies ORDER BY actor_id ASC")
      .all()
      .map((row) => parseJson(row.record_json));
  }

  async upsertRemoteActorPolicy(policyRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO remote_actor_policies (actor_id, record_json) VALUES (?, ?)")
      .run(policyRecord.actorId, JSON.stringify(policyRecord));
  }

  async removeRemoteActorPolicy(actorId) {
    this.db.prepare("DELETE FROM remote_actor_policies WHERE actor_id = ?").run(actorId);
  }

  getSnapshot() {
    const snapshot = {
      actors: {},
      remoteActors: mapRows(this.db.prepare("SELECT actor_id, record_json FROM remote_actors").all(), "actor_id"),
      mentionResolutions: mapRows(this.db.prepare("SELECT account, record_json FROM mention_resolutions").all(), "account"),
      processedActivities: mapRows(this.db.prepare("SELECT activity_id, result_json AS record_json FROM processed_activities").all(), "activity_id"),
      domainBlocks: mapRows(this.db.prepare("SELECT domain, record_json FROM domain_blocks").all(), "domain"),
      actorSuspensions: mapRows(this.db.prepare("SELECT actor_handle, record_json FROM actor_suspensions").all(), "actor_handle"),
      remoteActorPolicies: mapRows(this.db.prepare("SELECT actor_id, record_json FROM remote_actor_policies").all(), "actor_id"),
      legalTakedowns: mapRows(this.db.prepare("SELECT case_id, record_json FROM legal_takedowns").all(), "case_id"),
      rateLimitPolicies: mapRows(this.db.prepare("SELECT policy_key, record_json FROM rate_limit_policies").all(), "policy_key"),
      rateLimitCounters: mapRows(this.db.prepare("SELECT counter_key, record_json FROM rate_limit_counters").all(), "counter_key"),
      abuseQueue: this.db
        .prepare("SELECT record_json FROM abuse_queue ORDER BY rowid ASC")
        .all()
        .map((row) => parseJson(row.record_json)),
      auditLog: this.db
        .prepare("SELECT record_json FROM audit_log ORDER BY audit_id ASC")
        .all()
        .map((row) => parseJson(row.record_json)),
      evidenceRecords: this.db
        .prepare("SELECT record_json FROM evidence_records ORDER BY rowid ASC")
        .all()
        .map((row) => parseJson(row.record_json)),
      outboundQueue: this.db
        .prepare("SELECT item_json FROM outbound_queue ORDER BY rowid ASC")
        .all()
        .map((row) => parseJson(row.item_json)),
      deadLetters: this.db
        .prepare("SELECT record_json FROM dead_letters ORDER BY rowid ASC")
        .all()
        .map((row) => normalizeDeadLetterRecord(parseJson(row.record_json))),
      traces: this.db
        .prepare("SELECT record_json FROM traces ORDER BY trace_id ASC")
        .all()
        .map((row) => parseJson(row.record_json)),
      contentDeliveryProjections: mapRows(
        this.db.prepare("SELECT handle, record_json FROM content_delivery_projections").all(),
        "handle",
      ),
    };

    const actorRows = this.db.prepare("SELECT handle FROM actors ORDER BY handle ASC").all();
    for (const { handle } of actorRows) {
      snapshot.actors[handle] = {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
    }

    for (const row of this.db.prepare("SELECT handle, remote_actor_id, record_json FROM followers").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].followers[row.remote_actor_id] = parseJson(row.record_json);
    }

    for (const row of this.db.prepare("SELECT handle, object_id, record_json FROM inbound_objects").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].inboundObjects[row.object_id] = parseJson(row.record_json);
    }

    for (const row of this.db.prepare("SELECT handle, activity_id, record_json FROM inbound_engagements").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].inboundEngagements[row.activity_id] = parseJson(row.record_json);
    }

    for (const row of this.db.prepare("SELECT handle, thread_id, record_json FROM local_conversations").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].localConversations[row.thread_id] = parseJson(row.record_json);
    }

    for (const row of this.db.prepare("SELECT handle, content_id, record_json FROM local_contents").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].localContents[row.content_id] = parseJson(row.record_json);
    }

    for (const row of this.db.prepare("SELECT handle, notification_id, record_json FROM local_notifications").all()) {
      snapshot.actors[row.handle] ??= {
        followers: {},
        following: {},
        inboundObjects: {},
        inboundEngagements: {},
        localConversations: {},
        localContents: {},
        localNotifications: {},
      };
      snapshot.actors[row.handle].localNotifications[row.notification_id] = parseJson(row.record_json);
    }

    return structuredClone(snapshot);
  }

  hasProcessed(activityId) {
    if (!activityId) {
      return false;
    }

    const row = this.db.prepare("SELECT 1 FROM processed_activities WHERE activity_id = ?").get(activityId);
    return Boolean(row);
  }

  async recordProcessed(activityId, result) {
    if (!activityId) {
      return;
    }

    this.db
      .prepare("INSERT OR REPLACE INTO processed_activities (activity_id, result_json) VALUES (?, ?)")
      .run(activityId, JSON.stringify(result));
  }

  async seedDomainBlocks(domainBlocks) {
    for (const blockRecord of domainBlocks ?? []) {
      this.db
        .prepare("INSERT OR REPLACE INTO domain_blocks (domain, record_json) VALUES (?, ?)")
        .run(blockRecord.domain, JSON.stringify(blockRecord));
    }
  }

  getDomainBlock(domain) {
    const row = this.db.prepare("SELECT record_json FROM domain_blocks WHERE domain = ?").get(domain);
    return parseJson(row?.record_json) ?? null;
  }

  getDomainBlocks() {
    return this.db
      .prepare("SELECT record_json FROM domain_blocks ORDER BY domain ASC")
      .all()
      .map((row) => parseJson(row.record_json));
  }

  async upsertDomainBlock(blockRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO domain_blocks (domain, record_json) VALUES (?, ?)")
      .run(blockRecord.domain, JSON.stringify(blockRecord));
  }

  async removeDomainBlock(domain) {
    this.db.prepare("DELETE FROM domain_blocks WHERE domain = ?").run(domain);
  }

  getActorSuspension(handle) {
    const row = this.db.prepare("SELECT record_json FROM actor_suspensions WHERE actor_handle = ?").get(handle);
    return parseJson(row?.record_json) ?? null;
  }

  getActorSuspensions() {
    return this.db
      .prepare("SELECT record_json FROM actor_suspensions ORDER BY actor_handle ASC")
      .all()
      .map((row) => parseJson(row.record_json));
  }

  async upsertActorSuspension(suspensionRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO actor_suspensions (actor_handle, record_json) VALUES (?, ?)")
      .run(suspensionRecord.actorHandle, JSON.stringify(suspensionRecord));
  }

  async removeActorSuspension(actorHandle) {
    this.db.prepare("DELETE FROM actor_suspensions WHERE actor_handle = ?").run(actorHandle);
  }

  getLegalTakedown(caseId) {
    const row = this.db.prepare("SELECT record_json FROM legal_takedowns WHERE case_id = ?").get(caseId);
    return parseJson(row?.record_json) ?? null;
  }

  getLegalTakedowns(status = null) {
    const rows = status
      ? this.db.prepare("SELECT record_json FROM legal_takedowns WHERE status = ? ORDER BY rowid ASC").all(status)
      : this.db.prepare("SELECT record_json FROM legal_takedowns ORDER BY rowid ASC").all();

    return rows.map((row) => parseJson(row.record_json));
  }

  getActiveLegalTakedownByObjectId(objectId) {
    const row = this.db
      .prepare("SELECT record_json FROM legal_takedowns WHERE object_id = ? AND status = 'open' ORDER BY rowid DESC LIMIT 1")
      .get(objectId);
    return parseJson(row?.record_json) ?? null;
  }

  async upsertLegalTakedown(takedownRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO legal_takedowns (case_id, status, object_id, record_json) VALUES (?, ?, ?, ?)")
      .run(takedownRecord.caseId, takedownRecord.status, takedownRecord.objectId, JSON.stringify(takedownRecord));
  }

  async seedRateLimitPolicies(rateLimitPolicies) {
    for (const policyRecord of rateLimitPolicies ?? []) {
      this.db
        .prepare("INSERT OR REPLACE INTO rate_limit_policies (policy_key, record_json) VALUES (?, ?)")
        .run(policyRecord.policyKey, JSON.stringify(policyRecord));
    }
  }

  getRateLimitPolicy(policyKey) {
    const row = this.db.prepare("SELECT record_json FROM rate_limit_policies WHERE policy_key = ?").get(policyKey);
    return parseJson(row?.record_json) ?? null;
  }

  getRateLimitPolicies() {
    return this.db
      .prepare("SELECT record_json FROM rate_limit_policies ORDER BY policy_key ASC")
      .all()
      .map((row) => parseJson(row.record_json));
  }

  async upsertRateLimitPolicy(policyRecord) {
    this.db
      .prepare("INSERT OR REPLACE INTO rate_limit_policies (policy_key, record_json) VALUES (?, ?)")
      .run(policyRecord.policyKey, JSON.stringify(policyRecord));
  }

  getRateLimitCounters() {
    return this.db
      .prepare("SELECT record_json FROM rate_limit_counters ORDER BY counter_key ASC")
      .all()
      .map((row) => parseJson(row.record_json));
  }

  async evaluateRateLimit({ policyKey, counterKey, limit, windowMs, now }) {
    const nowMs = typeof now === "number" ? now : Date.parse(now);
    const nowIso = new Date(nowMs).toISOString();
    const existingRow = this.db.prepare("SELECT record_json FROM rate_limit_counters WHERE counter_key = ?").get(counterKey);
    const existingCounter = parseJson(existingRow?.record_json);
    const expired = !existingCounter || nowMs >= Date.parse(existingCounter.resetAt);
    const counterRecord = expired
      ? {
          policyKey,
          counterKey,
          count: 0,
          windowStartedAt: nowIso,
          resetAt: new Date(nowMs + windowMs).toISOString(),
          updatedAt: nowIso,
        }
      : existingCounter;

    counterRecord.count += 1;
    counterRecord.updatedAt = nowIso;
    this.db
      .prepare("INSERT OR REPLACE INTO rate_limit_counters (counter_key, record_json) VALUES (?, ?)")
      .run(counterKey, JSON.stringify(counterRecord));

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
    this.db
      .prepare("INSERT OR REPLACE INTO abuse_queue (id, status, record_json) VALUES (?, ?, ?)")
      .run(abuseCase.id, abuseCase.status, JSON.stringify(abuseCase));
  }

  getAbuseQueue(status = null) {
    const rows = status
      ? this.db.prepare("SELECT record_json FROM abuse_queue WHERE status = ? ORDER BY rowid ASC").all(status)
      : this.db.prepare("SELECT record_json FROM abuse_queue ORDER BY rowid ASC").all();

    return rows.map((row) => parseJson(row.record_json));
  }

  async resolveAbuseCase(id, resolution) {
    const row = this.db.prepare("SELECT record_json FROM abuse_queue WHERE id = ?").get(id);
    if (!row) {
      return null;
    }

    const abuseCase = parseJson(row.record_json);
    abuseCase.status = "resolved";
    abuseCase.resolution = resolution;
    this.db
      .prepare("UPDATE abuse_queue SET status = ?, record_json = ? WHERE id = ?")
      .run(abuseCase.status, JSON.stringify(abuseCase), id);
    return abuseCase;
  }

  async recordAuditEvent(event) {
    this.db.prepare("INSERT INTO audit_log (record_json) VALUES (?)").run(JSON.stringify(event));
    if (event?.event === "dead-letter.replayed" && event.actorHandle) {
      this.recordContentDeliveryReplay(event.actorHandle, event);
    }
  }

  getAuditLog(limit = 50) {
    return this.db
      .prepare("SELECT record_json FROM audit_log ORDER BY audit_id DESC LIMIT ?")
      .all(limit)
      .map((row) => parseJson(row.record_json))
      .reverse();
  }

  async recordEvidence(evidenceRecord) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO evidence_records (id, category, actor_handle, status, retained_until, record_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        evidenceRecord.id,
        evidenceRecord.category,
        evidenceRecord.actorHandle ?? null,
        evidenceRecord.status,
        evidenceRecord.retentionUntil,
        JSON.stringify(evidenceRecord),
      );
  }

  getEvidenceRecords({ category = null, actorHandle = null, status = null, limit = 50 } = {}) {
    const clauses = [];
    const values = [];

    if (category) {
      clauses.push("category = ?");
      values.push(category);
    }
    if (actorHandle) {
      clauses.push("actor_handle = ?");
      values.push(actorHandle);
    }
    if (status) {
      clauses.push("status = ?");
      values.push(status);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT record_json FROM evidence_records ${whereClause} ORDER BY rowid DESC LIMIT ?`)
      .all(...values, limit)
      .map((row) => parseJson(row.record_json))
      .reverse();
  }

  getRuntimeMetadata() {
    return {
      driver: "sqlite",
      sqliteFile: this.sqliteFile,
      schemaVersion:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("schema_version")) ??
        SQLITE_SCHEMA_VERSION,
      journalMode:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("journal_mode")) ?? "wal",
      initializedAt:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("initialized_at")) ?? null,
      lastMigratedAt:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("last_migrated_at")) ?? null,
      lastBackupAt:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("last_backup_at")) ?? null,
      lastReconciledAt:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("last_reconciled_at")) ?? null,
      lastRestoredAt:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("last_restored_at")) ?? null,
      restoredFromBackup:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("restored_from_backup")) ?? null,
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
    const dashboard = this.getDashboardSnapshot();
    const runtime = this.getRuntimeMetadata();

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
        actors: this.db.prepare("SELECT COUNT(*) AS count FROM actors").get().count,
        remoteActors: this.db.prepare("SELECT COUNT(*) AS count FROM remote_actors").get().count,
        mentionResolutions: this.db.prepare("SELECT COUNT(*) AS count FROM mention_resolutions").get().count,
        followers: this.db.prepare("SELECT COUNT(*) AS count FROM followers").get().count,
        inboundObjects: this.db.prepare("SELECT COUNT(*) AS count FROM inbound_objects").get().count,
        inboundEngagements: this.db.prepare("SELECT COUNT(*) AS count FROM inbound_engagements").get().count,
        localConversations: this.db.prepare("SELECT COUNT(*) AS count FROM local_conversations").get().count,
        localContents: this.db.prepare("SELECT COUNT(*) AS count FROM local_contents").get().count,
        localNotifications: this.db.prepare("SELECT COUNT(*) AS count FROM local_notifications").get().count,
      },
      audit: {
        auditEvents: this.db.prepare("SELECT COUNT(*) AS count FROM audit_log").get().count,
        traces: this.db.prepare("SELECT COUNT(*) AS count FROM traces").get().count,
      },
    };
  }

  getTraces({ limit = 50, eventPrefix = null } = {}) {
    const traces = this.db
      .prepare("SELECT record_json FROM traces ORDER BY trace_id DESC LIMIT ?")
      .all(limit * 5)
      .map((row) => parseJson(row.record_json))
      .filter((entry) => {
        if (!eventPrefix) {
          return true;
        }

        return typeof entry.event === "string" && entry.event.startsWith(eventPrefix);
      })
      .slice(0, limit)
      .reverse();

    return traces;
  }

  getQueueSnapshot({ traceLimit = 20 } = {}) {
    const outboundItems = this.db
      .prepare("SELECT item_json FROM outbound_queue ORDER BY rowid ASC")
      .all()
      .map((row) => parseJson(row.item_json));
    const pendingItems = outboundItems.filter((item) => item.status === "pending");
    const processingItems = outboundItems.filter((item) => item.status === "processing");
    const deadLetters = this.getDeadLetters({ limit: 1000 });

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
      evidenceRecords: this.db.prepare("SELECT COUNT(*) AS count FROM evidence_records").get().count,
      outboundPending: this.getPendingOutbound().length,
      outboundProcessing: this.getOutboundItems({}).filter((item) => item.status === "processing").length,
      deadLetters: this.db.prepare("SELECT COUNT(*) AS count FROM dead_letters").get().count,
      auditEvents: this.db.prepare("SELECT COUNT(*) AS count FROM audit_log").get().count,
    };
  }

  async upsertFollower(handle, followerRecord) {
    this.ensureActor(handle);
    this.db
      .prepare("INSERT OR REPLACE INTO followers (handle, remote_actor_id, record_json) VALUES (?, ?, ?)")
      .run(handle, followerRecord.remoteActorId, JSON.stringify(followerRecord));
  }

  getFollower(handle, remoteActorId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM followers WHERE handle = ? AND remote_actor_id = ?")
      .get(handle, remoteActorId);
    return parseJson(row?.record_json) ?? null;
  }

  async removeFollower(handle, remoteActorId) {
    this.ensureActor(handle);
    this.db.prepare("DELETE FROM followers WHERE handle = ? AND remote_actor_id = ?").run(handle, remoteActorId);
  }

  getFollowers(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM followers WHERE handle = ? ORDER BY remote_actor_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  async upsertInboundObject(handle, inboundObjectRecord) {
    this.ensureActor(handle);
    this.db
      .prepare("INSERT OR REPLACE INTO inbound_objects (handle, object_id, record_json) VALUES (?, ?, ?)")
      .run(handle, inboundObjectRecord.objectId, JSON.stringify(inboundObjectRecord));
  }

  getInboundObject(handle, objectId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM inbound_objects WHERE handle = ? AND object_id = ?")
      .get(handle, objectId);
    return parseJson(row?.record_json) ?? null;
  }

  getInboundObjects(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM inbound_objects WHERE handle = ? ORDER BY object_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  async upsertInboundEngagement(handle, engagementRecord) {
    this.ensureActor(handle);
    this.db
      .prepare("INSERT OR REPLACE INTO inbound_engagements (handle, activity_id, record_json) VALUES (?, ?, ?)")
      .run(handle, engagementRecord.activityId, JSON.stringify(engagementRecord));
  }

  getInboundEngagement(handle, activityId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM inbound_engagements WHERE handle = ? AND activity_id = ?")
      .get(handle, activityId);
    return parseJson(row?.record_json) ?? null;
  }

  async removeInboundEngagement(handle, activityId) {
    this.ensureActor(handle);
    this.db.prepare("DELETE FROM inbound_engagements WHERE handle = ? AND activity_id = ?").run(handle, activityId);
  }

  getInboundEngagements(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM inbound_engagements WHERE handle = ? ORDER BY activity_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  async replaceLocalConversations(handle, conversationRecords) {
    this.ensureActor(handle);
    const deleteStatement = this.db.prepare("DELETE FROM local_conversations WHERE handle = ?");
    const insertStatement = this.db.prepare(
      "INSERT OR REPLACE INTO local_conversations (handle, thread_id, record_json) VALUES (?, ?, ?)",
    );

    const transaction = this.db.transaction((records) => {
      deleteStatement.run(handle);
      for (const record of records ?? []) {
        insertStatement.run(handle, record.threadId, JSON.stringify(record));
      }
    });

    transaction(conversationRecords);
  }

  async replaceLocalContents(handle, contentRecords) {
    this.ensureActor(handle);
    const deleteStatement = this.db.prepare("DELETE FROM local_contents WHERE handle = ?");
    const insertStatement = this.db.prepare(
      "INSERT OR REPLACE INTO local_contents (handle, content_id, record_json) VALUES (?, ?, ?)",
    );

    const transaction = this.db.transaction((records) => {
      deleteStatement.run(handle);
      for (const record of records ?? []) {
        insertStatement.run(handle, record.contentId, JSON.stringify(record));
      }
    });

    transaction(contentRecords);
    this.refreshContentDeliveryProjection(handle);
  }

  async replaceLocalNotifications(handle, notificationRecords) {
    this.ensureActor(handle);
    const deleteStatement = this.db.prepare("DELETE FROM local_notifications WHERE handle = ?");
    const insertStatement = this.db.prepare(
      "INSERT OR REPLACE INTO local_notifications (handle, notification_id, record_json) VALUES (?, ?, ?)",
    );

    const transaction = this.db.transaction((records) => {
      deleteStatement.run(handle);
      for (const record of records ?? []) {
        insertStatement.run(handle, record.notificationId, JSON.stringify(record));
      }
    });

    transaction(notificationRecords);
  }

  getLocalConversation(handle, threadId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM local_conversations WHERE handle = ? AND thread_id = ?")
      .get(handle, threadId);
    return parseJson(row?.record_json) ?? null;
  }

  getLocalConversations(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM local_conversations WHERE handle = ? ORDER BY thread_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  getLocalContent(handle, contentId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM local_contents WHERE handle = ? AND content_id = ?")
      .get(handle, contentId);
    return parseJson(row?.record_json) ?? null;
  }

  getLocalContents(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM local_contents WHERE handle = ? ORDER BY content_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  getLocalNotification(handle, notificationId) {
    this.ensureActor(handle);
    const row = this.db
      .prepare("SELECT record_json FROM local_notifications WHERE handle = ? AND notification_id = ?")
      .get(handle, notificationId);
    return parseJson(row?.record_json) ?? null;
  }

  getLocalNotifications(handle) {
    this.ensureActor(handle);
    return this.db
      .prepare("SELECT record_json FROM local_notifications WHERE handle = ? ORDER BY notification_id ASC")
      .all(handle)
      .map((row) => parseJson(row.record_json));
  }

  getContentDeliveryProjection(handle) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return null;
    }

    const row = this.db
      .prepare("SELECT record_json FROM content_delivery_projections WHERE handle = ?")
      .get(normalizedHandle);
    return parseJson(row?.record_json) ?? null;
  }

  refreshContentDeliveryProjection(handle, { recentReplays = null, existingProjection = null } = {}) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return null;
    }

    const currentProjection =
      existingProjection ??
      parseJson(
        this.db
          .prepare("SELECT record_json FROM content_delivery_projections WHERE handle = ?")
          .get(normalizedHandle)?.record_json,
      );
    const normalizedRecentReplays =
      recentReplays ?? currentProjection?.review?.recentReplays ?? currentProjection?.recentReplays ?? [];
    const bundle = buildContentDeliveryProjectionBundle({
      actorHandle: normalizedHandle,
      contents: this.getLocalContents(normalizedHandle),
      outboundItems: this.getOutboundItems({ actorHandle: normalizedHandle }),
      recentReplays: normalizedRecentReplays,
    });

    this.db
      .prepare("INSERT OR REPLACE INTO content_delivery_projections (handle, record_json) VALUES (?, ?)")
      .run(normalizedHandle, JSON.stringify(bundle));
    return bundle;
  }

  recordContentDeliveryReplay(handle, replayEvent) {
    const normalizedHandle = typeof handle === "string" && handle.trim() ? handle.trim() : null;
    if (!normalizedHandle) {
      return null;
    }

    const existingProjection = this.getContentDeliveryProjection(normalizedHandle);
    const recentReplays = [...(existingProjection?.review?.recentReplays ?? []), replayEvent];
    return this.refreshContentDeliveryProjection(normalizedHandle, { recentReplays, existingProjection });
  }

  getContentDeliveryReviewSnapshot({
    actorHandle = null,
    limit = 20,
    status = null,
    replayedOnly = false,
    replayableOnly = false,
  } = {}) {
    const normalizedActorHandle = typeof actorHandle === "string" && actorHandle.trim() ? actorHandle.trim() : null;
    const actorHandles = normalizedActorHandle
      ? [normalizedActorHandle]
      : [...new Set([
          ...this.db.prepare("SELECT handle FROM actors ORDER BY handle ASC").all().map((row) => row.handle),
          ...this.db.prepare("SELECT handle FROM content_delivery_projections ORDER BY handle ASC").all().map((row) => row.handle),
        ])].filter((value) => typeof value === "string" && value.trim());
    const snapshots = actorHandles.map((handle) => this.getContentDeliveryProjection(handle)).filter(Boolean);
    const recentReplayEntries = buildContentDeliveryRecentReplayItems(this.getAuditLog(limit * 5), {
      actorHandle: normalizedActorHandle,
      limit: limit * 5,
    });
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
    this.db
      .prepare("INSERT OR REPLACE INTO outbound_queue (id, status, item_json) VALUES (?, ?, ?)")
      .run(item.id, item.status, JSON.stringify(item));
    this.refreshContentDeliveryProjection(item.actorHandle);
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
    this.db
      .prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ? AND status = 'pending'")
      .run(item.status, JSON.stringify(item), id);
    const claimedItem = this.getOutboundItem(id);
    if (claimedItem?.status !== "processing") {
      return null;
    }
    this.refreshContentDeliveryProjection(claimedItem.actorHandle);
    return structuredClone(claimedItem);
  }

  async recoverStaleOutboundDeliveries({ now = new Date().toISOString(), maxLeaseAgeMs = 15 * 60 * 1000 } = {}) {
    const outboundItems = this.getOutboundItems({});
    const recovered = [];
    const touchedActors = new Set();
    const updateStatement = this.db.prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ?");

    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        if (!isOutboundDeliveryLeaseStale(item, { now, maxLeaseAgeMs })) {
          continue;
        }

        clearOutboundDeliveryLease(item);
        item.status = "pending";
        item.lastRecoveredAt = now;
        item.recoveredDeliveryCount = (item.recoveredDeliveryCount ?? 0) + 1;
        updateStatement.run(item.status, JSON.stringify(item), item.id);
        recovered.push(structuredClone(item));
        touchedActors.add(item.actorHandle);
      }
    });

    transaction(outboundItems);
    for (const actorHandle of touchedActors) {
      this.refreshContentDeliveryProjection(actorHandle);
    }

    return recovered;
  }

  getOutboundItem(id) {
    const row = this.db.prepare("SELECT item_json FROM outbound_queue WHERE id = ?").get(id);
    return parseJson(row?.item_json) ?? null;
  }

  getPendingOutbound() {
    return this.db
      .prepare("SELECT item_json FROM outbound_queue WHERE status = 'pending' ORDER BY rowid ASC")
      .all()
      .map((row) => parseJson(row.item_json));
  }

  getOutboundItems({ actorHandle = null } = {}) {
    if (!actorHandle) {
      return this.db
        .prepare("SELECT item_json FROM outbound_queue ORDER BY rowid ASC")
        .all()
        .map((row) => parseJson(row.item_json));
    }

    return this.db
      .prepare("SELECT item_json FROM outbound_queue ORDER BY rowid ASC")
      .all()
      .map((row) => parseJson(row.item_json))
      .filter((item) => item.actorHandle === actorHandle);
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
      : [...new Set([
          ...this.db.prepare("SELECT handle FROM actors ORDER BY handle ASC").all().map((row) => row.handle),
          ...this.db.prepare("SELECT handle FROM content_delivery_projections ORDER BY handle ASC").all().map((row) => row.handle),
        ])].filter((value) => typeof value === "string" && value.trim());
    const snapshots = handles.map((handle) => this.getContentDeliveryProjection(handle)).filter(Boolean);
    const recentReplayEntries = buildContentDeliveryRecentReplayItems(this.getAuditLog(limit * 5), {
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
    const row = this.db.prepare("SELECT record_json FROM dead_letters WHERE id = ?").get(id);
    return normalizeDeadLetterRecord(parseJson(row?.record_json)) ?? null;
  }

  getDeadLetters({ status = null, actorHandle = null, limit = 50 } = {}) {
    const rows = this.db
      .prepare("SELECT record_json FROM dead_letters ORDER BY rowid DESC LIMIT ?")
      .all(limit)
      .map((row) => normalizeDeadLetterRecord(parseJson(row.record_json)))
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

    return rows.reverse();
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
    this.db
      .prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ?")
      .run(item.status, JSON.stringify(item), id);
    this.refreshContentDeliveryProjection(item.actorHandle);
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
    this.db
      .prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ?")
      .run(item.status, JSON.stringify(item), id);
    this.refreshContentDeliveryProjection(item.actorHandle);
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
    this.db
      .prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ?")
      .run(item.status, JSON.stringify(item), id);
    const existingDeadLetter = this.getDeadLetter(id);
    this.db
      .prepare("INSERT OR REPLACE INTO dead_letters (id, record_json) VALUES (?, ?)")
      .run(
        id,
        JSON.stringify({
          ...(existingDeadLetter ?? {}),
          id: item.id,
          status: "open",
          actorHandle: item.actorHandle ?? null,
          targetActorId: item.targetActorId ?? null,
          activityId: item.activity?.id ?? null,
          activityType: item.activity?.type ?? null,
          recordedAt: item.deadLetteredAt,
          replayHistory: existingDeadLetter?.replayHistory ?? [],
          item: structuredClone(item),
        }),
      );
    this.refreshContentDeliveryProjection(item.actorHandle);
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
    this.db
      .prepare("UPDATE outbound_queue SET status = ?, item_json = ? WHERE id = ?")
      .run(item.status, JSON.stringify(item), id);

    const updatedDeadLetter = {
      ...deadLetter,
      status: "replayed",
      replayHistory: [...(deadLetter.replayHistory ?? []), replayRecord],
      lastReplay: replayRecord,
      item: structuredClone(item),
    };
    this.db
      .prepare("INSERT OR REPLACE INTO dead_letters (id, record_json) VALUES (?, ?)")
      .run(id, JSON.stringify(updatedDeadLetter));
    this.refreshContentDeliveryProjection(item.actorHandle, {
      recentReplays: this.getContentDeliveryProjection(item.actorHandle)?.review?.recentReplays ?? [],
    });

    return {
      deadLetter: updatedDeadLetter,
      item: structuredClone(item),
    };
  }

  async recordTrace(trace) {
    this.db.prepare("INSERT INTO traces (record_json) VALUES (?)").run(JSON.stringify(trace));
  }

  async createBackup(destinationFile) {
    const backupFile = path.resolve(destinationFile);
    await mkdir(path.dirname(backupFile), { recursive: true });
    await rm(backupFile, { force: true });
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    await this.db.backup(backupFile);

    const createdAt = new Date().toISOString();
    this.db
      .prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)")
      .run("last_backup_at", JSON.stringify(createdAt));

    return {
      driver: "sqlite",
      backupFile,
      createdAt,
      schemaVersion:
        parseMeta(this.db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get("schema_version")) ??
        SQLITE_SCHEMA_VERSION,
    };
  }

  async reconcileStorage({ now = new Date().toISOString(), dryRun = false } = {}) {
    const outboundItems = this.db
      .prepare("SELECT item_json FROM outbound_queue ORDER BY rowid ASC")
      .all()
      .map((row) => parseJson(row.item_json));
    const existingDeadLetters = this.db
      .prepare("SELECT record_json FROM dead_letters ORDER BY rowid ASC")
      .all()
      .map((row) => normalizeDeadLetterRecord(parseJson(row.record_json)))
      .filter(Boolean);
    const deadLetterMap = new Map(existingDeadLetters.map((entry) => [entry.id, entry]));
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

    if (!dryRun) {
      const updateDeadLetter = this.db.prepare("INSERT OR REPLACE INTO dead_letters (id, record_json) VALUES (?, ?)");
      const updateMeta = this.db.prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)");
      const transaction = this.db.transaction(() => {
        for (const [id, deadLetter] of deadLetterMap.entries()) {
          updateDeadLetter.run(id, JSON.stringify(deadLetter));
        }
        updateMeta.run("last_reconciled_at", JSON.stringify(now));
      });
      transaction();
    }

    return {
      driver: "sqlite",
      reconciledAt: now,
      dryRun,
      summary: {
        backfilledDeadLetters,
        refreshedDeadLetters,
        orphanedDeadLetters,
      },
    };
  }

  close() {
    this.db?.close();
    this.db = null;
  }
}
