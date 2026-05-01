import { readFile } from "node:fs/promises";
import { normalizeArticleObject } from "./article-normalization.mjs";

const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const MESSAGE_LIKE_TYPES = new Set(["message", "chatmessage", "directmessage", "encryptedmessage"]);
const NON_PUBLIC_FLAGS = new Set([
  "paid",
  "paywalled",
  "subscription",
  "member",
  "members",
  "private",
  "protected",
  "followers",
  "direct",
  "encrypted",
  "draft",
  "unpublished",
]);

function emptyOutbox(actor) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: actor.outboxUrl,
    type: "OrderedCollection",
    totalItems: 0,
    orderedItems: [],
  };
}

function normalizeAudience(values, fallback = []) {
  if (Array.isArray(values)) {
    return values;
  }

  if (typeof values === "string" && values.trim()) {
    return [values];
  }

  return fallback;
}

function normalizeToken(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function firstToken(...values) {
  for (const value of values) {
    const token = normalizeToken(value);
    if (token) {
      return token;
    }
  }

  return null;
}

function hasTruthyFlag(...values) {
  return values.some((value) => value === true);
}

function hasPublicAudience(item, object) {
  return [
    ...normalizeAudience(item?.to, []),
    ...normalizeAudience(item?.cc, []),
    ...normalizeAudience(object?.to, []),
    ...normalizeAudience(object?.cc, []),
  ].includes(PUBLIC_AUDIENCE);
}

function classifyVisibilityCandidate(item) {
  const object = item?.object && typeof item.object === "object" && !Array.isArray(item.object)
    ? item.object
    : null;
  const objectId = typeof object?.id === "string" ? object.id : null;
  const activityId = typeof item?.id === "string" ? item.id : null;
  const objectType = typeof object?.type === "string" ? object.type : null;
  const visibility = firstToken(item?.visibility, object?.visibility);
  const access = firstToken(item?.access, object?.access, item?.accessType, object?.accessType);
  const status = firstToken(item?.status, object?.status, item?.publicationStatus, object?.publicationStatus);
  const threadVisibility = firstToken(
    item?.threadVisibility,
    object?.threadVisibility,
    object?.inReplyToVisibility,
    object?.replyToVisibility,
    object?.thread?.visibility,
  );
  const type = normalizeToken(objectType);

  if (visibility && visibility !== "public") {
    return { decision: "excluded", reason: "visibility-not-public", visibility, activityId, objectId, objectType };
  }
  if (access && NON_PUBLIC_FLAGS.has(access)) {
    return { decision: "excluded", reason: "access-not-public", visibility: access, activityId, objectId, objectType };
  }
  if (status && NON_PUBLIC_FLAGS.has(status)) {
    return { decision: "excluded", reason: "status-not-public", visibility: status, activityId, objectId, objectType };
  }
  if (threadVisibility && threadVisibility !== "public") {
    return { decision: "excluded", reason: "thread-not-public", visibility: threadVisibility, activityId, objectId, objectType };
  }
  if (hasTruthyFlag(item?.paid, object?.paid, item?.isPaid, object?.isPaid, item?.paywalled, object?.paywalled)) {
    return { decision: "excluded", reason: "paid-content", visibility: "paid", activityId, objectId, objectType };
  }
  if (hasTruthyFlag(item?.encrypted, object?.encrypted, item?.isEncrypted, object?.isEncrypted)) {
    return { decision: "excluded", reason: "encrypted-content", visibility: "encrypted", activityId, objectId, objectType };
  }
  if (hasTruthyFlag(item?.private, object?.private, item?.isPrivate, object?.isPrivate)) {
    return { decision: "excluded", reason: "private-content", visibility: "private", activityId, objectId, objectType };
  }
  if (hasTruthyFlag(item?.draft, object?.draft, item?.isDraft, object?.isDraft)) {
    return { decision: "excluded", reason: "draft-content", visibility: "draft", activityId, objectId, objectType };
  }
  if (type && MESSAGE_LIKE_TYPES.has(type)) {
    return { decision: "excluded", reason: "message-like-content", visibility: "message", activityId, objectId, objectType };
  }
  if (visibility === "public" || hasPublicAudience(item, object)) {
    return { decision: "included", reason: "public", visibility: "public", activityId, objectId, objectType };
  }

  return { decision: "excluded", reason: "missing-public-audience", visibility: "unknown", activityId, objectId, objectType };
}

function rewriteObject(object, actor) {
  const rewritten = {
    ...object,
    attributedTo: actor.actorUrl,
    to: normalizeAudience(object.to, [PUBLIC_AUDIENCE]),
    cc: normalizeAudience(object.cc, []),
  };
  return normalizeArticleObject({ object: rewritten, actor });
}

function rewriteCreateActivity(item, actor) {
  const object = item?.object && typeof item.object === "object"
    ? rewriteObject(item.object, actor)
    : item.object;

  return {
    ...item,
    actor: actor.actorUrl,
    to: normalizeAudience(item.to, [PUBLIC_AUDIENCE]),
    cc: [actor.followersUrl],
    object,
  };
}

async function recordVisibilityAudit(recordAudit, actor, auditRecord) {
  if (!recordAudit) {
    return;
  }

  await recordAudit({
    source: "static-outbox-bridge",
    actorHandle: actor.handle ?? null,
    actorUrl: actor.actorUrl,
    decision: auditRecord.decision,
    reason: auditRecord.reason,
    visibility: auditRecord.visibility,
    activityId: auditRecord.activityId,
    objectId: auditRecord.objectId,
    objectType: auditRecord.objectType,
  });
}

async function normalizeCollection(parsed, actor, { recordAudit } = {}) {
  const orderedItems = [];

  for (const item of Array.isArray(parsed.orderedItems) ? parsed.orderedItems : []) {
    const auditRecord = classifyVisibilityCandidate(item);
    await recordVisibilityAudit(recordAudit, actor, auditRecord);
    if (auditRecord.decision === "included") {
      orderedItems.push(rewriteCreateActivity(item, actor));
    }
  }

  return {
    "@context": parsed["@context"] ?? "https://www.w3.org/ns/activitystreams",
    id: actor.outboxUrl,
    type: parsed.type ?? "OrderedCollection",
    totalItems: orderedItems.length,
    orderedItems,
  };
}

export function createStaticOutboxBridge({ recordAudit = null } = {}) {
  return {
    async getOutbox(actor) {
      if (!actor.staticOutboxFile) {
        return emptyOutbox(actor);
      }

      const raw = await readFile(actor.staticOutboxFile, "utf8");
      const parsed = JSON.parse(raw);
      return normalizeCollection(parsed, actor, { recordAudit });
    },
  };
}
