import {
  buildAcceptActivity,
  buildActorDocument,
  buildAnnounceActivity,
  buildCreateActivity,
  buildDeleteActivity,
  buildHostMeta,
  buildLikeActivity,
  buildNodeInfo,
  buildNodeInfoDirectory,
  buildOrderedCollection,
  buildRejectActivity,
  buildUpdateActivity,
  buildWebFinger,
} from "./lib/activitypub.mjs";
import { createDeliveryProcessor, createFetchDeliveryClient } from "./lib/delivery.mjs";
import { classifyRemoteActorResolutionError, createRemoteActorDirectory } from "./lib/remote-actors.mjs";
import {
  buildRuntimeAlertBundle,
  buildRuntimeLogsBundle,
  buildRuntimeMetricsBundle,
  buildRuntimeMetrics,
  dispatchRuntimeAlertSlackWebhook,
  dispatchRuntimeAlertWebhook,
  dispatchRuntimeWebhook,
  getStorageAlertThresholds,
  resolveRuntimeAlertDispatch,
  resolveRuntimeDispatch,
  writeRuntimeDispatchBundle,
  writeRuntimeAlertBundle,
} from "./lib/runtime-observability.mjs";
import {
  buildContentDeliveryOpsSnapshot as buildStoreContentDeliveryOpsSnapshot,
  buildContentIdentitySet,
  buildContentOutboundActivityRecords,
  buildDeliveryStatusSummary,
  normalizeContentDeliveryReviewSnapshot,
  buildUniqueContentDeliveryActivities,
} from "./lib/content-delivery-ops.mjs";
import { createStaticOutboxBridge } from "./lib/static-outbox-bridge.mjs";
import { verifyHttpSignature } from "./security/http-signatures.mjs";

const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const DEFAULT_MENTION_FAILURE_RETRY_MS = 5 * 60 * 1000;

function jsonResponse(body, status = 200, contentType = "application/json") {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
    },
  });
}

function activityResponse(body, status = 200) {
  return jsonResponse(body, status, "application/activity+json");
}

function textResponse(body, status, contentType) {
  return new Response(body, {
    status,
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
    },
  });
}

function extractHandle(pathname) {
  const match = pathname.match(/^\/users\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function findActorByUrl(config, actorUrl) {
  return Object.values(config.actors).find((actor) => actor.actorUrl === actorUrl) ?? null;
}

function makeTrace(clock, data) {
  return {
    timestamp: clock().toISOString(),
    ...data,
  };
}

function getFollowTargetHandle(config, activity) {
  if (typeof activity.object !== "string") {
    return null;
  }

  const actor = findActorByUrl(config, activity.object);
  return actor?.handle ?? null;
}

function getActivityActorId(activity) {
  return typeof activity.actor === "string" ? activity.actor : activity.actor?.id ?? null;
}

function normalizeAudience(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function dedupeValues(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function normalizeActorIdList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return dedupeValues(
    values.map((value) => (typeof value === "string" ? value.trim() : null)).filter(Boolean),
  );
}

function getCombinedAudience(activity, object) {
  return [
    ...normalizeAudience(activity.to),
    ...normalizeAudience(activity.cc),
    ...normalizeAudience(object?.to),
    ...normalizeAudience(object?.cc),
  ];
}

function isPublicCreate(activity, object) {
  return getCombinedAudience(activity, object).includes(PUBLIC_AUDIENCE);
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseMentionAddress(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const withoutPrefix = normalized.startsWith("acct:") ? normalized.slice(5) : normalized;
  const withoutAt = withoutPrefix.startsWith("@") ? withoutPrefix.slice(1) : withoutPrefix;
  const [handle, domain] = withoutAt.split("@");
  if (!handle) {
    return null;
  }

  return {
    handle: handle.toLowerCase(),
    domain: domain?.toLowerCase() ?? null,
  };
}

function buildAcctString(address) {
  if (!address?.handle || !address?.domain) {
    return null;
  }

  return `@${address.handle}@${address.domain}`;
}

function isUsableRemoteDeliveryRecord(record) {
  return Boolean(record?.actorId?.trim() && (record?.sharedInbox?.trim() || record?.inbox?.trim()));
}

function resolveLocalActorReference(config, value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const actorByUrl = findActorByUrl(config, normalized);
  if (actorByUrl) {
    return actorByUrl;
  }

  if (config.actors[normalized]) {
    return config.actors[normalized];
  }

  if (normalized.startsWith("@") && config.actors[normalized.slice(1)]) {
    return config.actors[normalized.slice(1)];
  }

  const mentionAddress = parseMentionAddress(normalized);
  if (!mentionAddress) {
    return null;
  }

  if (mentionAddress.domain && mentionAddress.domain !== config.instance.domain.toLowerCase()) {
    return null;
  }

  return config.actors[mentionAddress.handle] ?? null;
}

function buildNormalizedMentionEntry(config, entry) {
  if (typeof entry === "string") {
    entry = { actorId: entry };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const localActor =
    resolveLocalActorReference(config, entry.actorId) ??
    resolveLocalActorReference(config, entry.href) ??
    resolveLocalActorReference(config, entry.acct) ??
    resolveLocalActorReference(config, entry.handle) ??
    resolveLocalActorReference(config, entry.name);

  if (localActor) {
    return {
      actorId: localActor.actorUrl,
      name: entry.name?.trim() || `@${localActor.handle}@${config.instance.domain}`,
      isLocal: true,
      handle: localActor.handle,
      acct: `@${localActor.handle}@${config.instance.domain}`,
    };
  }

  const actorId = normalizeOptionalString(entry.actorId) ?? normalizeOptionalString(entry.href);
  if (!actorId) {
    return null;
  }

  const parsedAddress = parseMentionAddress(entry.acct) ?? parseMentionAddress(entry.name);
  return {
    actorId,
    name: entry.name?.trim() || entry.acct?.trim() || actorId,
    isLocal: false,
    handle: parsedAddress?.handle ?? null,
    acct: parsedAddress ? `@${parsedAddress.handle}@${parsedAddress.domain}` : null,
  };
}

function mergeMentionEntries(...collections) {
  return collections
    .flatMap((collection) => collection ?? [])
    .filter(Boolean)
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.actorId === entry.actorId) === index);
}

function collectMentionAccountCandidates(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return dedupeValues(
    entries.flatMap((entry) => {
      if (typeof entry === "string") {
        const parsed = parseMentionAddress(entry);
        return parsed?.domain ? [buildAcctString(parsed)] : [];
      }

      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidates = [entry.acct, entry.name, entry.actorId, entry.href];
      const parsedCandidates = candidates
        .map((value) => parseMentionAddress(value))
        .filter((candidate) => candidate?.domain)
        .map((candidate) => buildAcctString(candidate));
      return parsedCandidates;
    }),
  );
}

function normalizeMentionEntries(config, mentions = []) {
  if (!Array.isArray(mentions)) {
    return [];
  }

  return mergeMentionEntries(mentions.map((entry) => buildNormalizedMentionEntry(config, entry)));
}

function extractMentionEntriesFromTags(config, tags = []) {
  return mergeMentionEntries(
    (Array.isArray(tags) ? tags : [])
      .flatMap((tag) => {
        if (!tag || typeof tag !== "object" || tag.type !== "Mention") {
          return [];
        }

        return [
          buildNormalizedMentionEntry(config, {
            actorId: tag.href?.trim() || tag.id?.trim() || null,
            name: tag.name?.trim() || null,
            acct: tag.name?.trim() || null,
          }),
        ];
      }),
  );
}

function extractMentionEntriesFromContent(config, content = "") {
  if (typeof content !== "string" || !content.trim()) {
    return [];
  }

  const matches = [...content.matchAll(/(^|[\s(>])@([a-z0-9_.-]+)@([a-z0-9.-]+)/gi)];
  return mergeMentionEntries(
    matches.map((match) =>
      buildNormalizedMentionEntry(config, {
        acct: `@${match[2]}@${match[3]}`,
      }),
    ),
  );
}

function extractMentionAccountCandidatesFromContent(content = "") {
  if (typeof content !== "string" || !content.trim()) {
    return [];
  }

  const matches = [...content.matchAll(/(^|[\s(>])@([a-z0-9_.-]+)@([a-z0-9.-]+)/gi)];
  return dedupeValues(matches.map((match) => `@${match[2].toLowerCase()}@${match[3].toLowerCase()}`));
}

function extractMentionAccountCandidatesFromTags(tags = []) {
  return dedupeValues(
    (Array.isArray(tags) ? tags : [])
      .flatMap((tag) => {
        if (!tag || typeof tag !== "object" || tag.type !== "Mention") {
          return [];
        }

        return collectMentionAccountCandidates([
          {
            acct: tag.name?.trim() || null,
            actorId: tag.href?.trim() || tag.id?.trim() || null,
          },
        ]);
      }),
  );
}

function buildMentionTag(entry) {
  return {
    type: "Mention",
    href: entry.actorId,
    name: entry.name ?? entry.acct ?? entry.actorId,
  };
}

function buildThreadState({ config, store, actorHandle, objectId, inReplyTo, object, remoteActorId, mentionEntries }) {
  const parentObjectId = normalizeOptionalString(inReplyTo);
  const parentRecord = parentObjectId ? store.getInboundObject?.(actorHandle, parentObjectId) : null;
  const conversationId =
    normalizeOptionalString(object.context) ??
    normalizeOptionalString(object.conversation) ??
    parentRecord?.conversationId ??
    null;
  const threadId = conversationId ?? parentRecord?.threadId ?? parentObjectId ?? objectId;
  const threadRootId = parentRecord?.threadRootId ?? parentObjectId ?? objectId;
  const replyDepth = parentRecord ? (parentRecord.replyDepth ?? 0) + 1 : parentObjectId ? 1 : 0;

  return {
    conversationId,
    threadId,
    threadRootId,
    threadResolved: !parentObjectId || Boolean(parentRecord),
    replyDepth,
    participantActorIds: dedupeValues([
      config.actors[actorHandle]?.actorUrl ?? null,
      remoteActorId,
      ...(parentRecord?.participantActorIds ?? []),
      ...mentionEntries.map((entry) => entry.actorId),
    ]),
    localParticipantHandles: dedupeValues([
      actorHandle,
      ...(parentRecord?.localParticipantHandles ?? []),
      ...mentionEntries.map((entry) => (entry.isLocal ? entry.handle : null)),
    ]),
  };
}

function buildInboundObjectRecord({ config, store, activity, object, remoteActorId, actorHandle, clock }) {
  const objectId = object.id ?? activity.id;
  const tags = Array.isArray(object.tag) ? object.tag : normalizeAudience(object.tag);
  const mentionEntries = mergeMentionEntries(
    extractMentionEntriesFromTags(config, tags),
    extractMentionEntriesFromContent(config, object.content ?? ""),
  );
  const threadState = buildThreadState({
    config,
    store,
    actorHandle,
    objectId,
    inReplyTo: object.inReplyTo ?? null,
    object,
    remoteActorId,
    mentionEntries,
  });

  return {
    objectId,
    activityId: activity.id ?? null,
    actorHandle,
    remoteActorId,
    activityType: activity.type,
    objectType: object.type ?? "Note",
    mapping: typeof object.inReplyTo === "string" && object.inReplyTo.trim() ? "reply" : "create",
    content: object.content ?? "",
    summary: object.summary ?? "",
    url: object.url ?? null,
    inReplyTo: object.inReplyTo ?? null,
    conversationId: threadState.conversationId,
    threadId: threadState.threadId,
    threadRootId: threadState.threadRootId,
    threadResolved: threadState.threadResolved,
    replyDepth: threadState.replyDepth,
    participantActorIds: threadState.participantActorIds,
    localParticipantHandles: threadState.localParticipantHandles,
    mentions: mentionEntries,
    publishedAt: object.published ?? activity.published ?? null,
    tags,
    visibility: "public",
    receivedAt: clock().toISOString(),
  };
}

function getObjectReferenceId(activityObject) {
  if (typeof activityObject === "string" && activityObject.trim()) {
    return activityObject;
  }

  if (activityObject && typeof activityObject === "object" && typeof activityObject.id === "string") {
    return activityObject.id;
  }

  return null;
}

function buildInboundEngagementRecord({ activity, remoteActorId, actorHandle, clock, threadRootId = null, threadResolved = false }) {
  return {
    activityId: activity.id ?? `${remoteActorId}#${activity.type}-${clock().getTime()}`,
    actorHandle,
    remoteActorId,
    activityType: activity.type,
    mapping: activity.type.toLowerCase(),
    objectId: getObjectReferenceId(activity.object),
    threadRootId,
    threadResolved,
    receivedAt: clock().toISOString(),
  };
}

function sortThreadObjects(records) {
  return [...records].sort((left, right) => {
    const leftPublished = Date.parse(left.publishedAt ?? left.receivedAt ?? 0);
    const rightPublished = Date.parse(right.publishedAt ?? right.receivedAt ?? 0);
    if (leftPublished !== rightPublished) {
      return leftPublished - rightPublished;
    }

    return left.objectId.localeCompare(right.objectId);
  });
}

function stripHtmlTags(value = "") {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildContentPreview(record) {
  const summary = stripHtmlTags(record?.summary ?? "");
  if (summary) {
    return summary.slice(0, 160);
  }

  const content = stripHtmlTags(record?.content ?? "");
  return content.slice(0, 160);
}

function buildThreadReport({ actorHandle, inboundObjects, threadId = null, objectId = null }) {
  const records = sortThreadObjects(inboundObjects);
  const seedRecord = objectId ? records.find((entry) => entry.objectId === objectId) ?? null : null;
  const resolvedThreadId = threadId ?? seedRecord?.threadId ?? null;

  if (resolvedThreadId) {
    const objects = records.filter((entry) => entry.threadId === resolvedThreadId);
    const participants = dedupeValues(objects.flatMap((entry) => entry.participantActorIds ?? []));
    const localParticipants = dedupeValues(objects.flatMap((entry) => entry.localParticipantHandles ?? []));
    const mentions = dedupeValues(objects.flatMap((entry) => (entry.mentions ?? []).map((mention) => mention.actorId)));

    return {
      actorHandle,
      threadId: resolvedThreadId,
      objectCount: objects.length,
      rootObjectId: objects[0]?.threadRootId ?? seedRecord?.threadRootId ?? null,
      participants,
      localParticipants,
      mentions,
      objects,
    };
  }

  const threadMap = new Map();
  for (const record of records) {
    const current = threadMap.get(record.threadId) ?? {
      threadId: record.threadId,
      rootObjectId: record.threadRootId,
      objectCount: 0,
      lastPublishedAt: null,
      participants: [],
      localParticipants: [],
      mentions: [],
    };
    current.objectCount += 1;
    current.rootObjectId = current.rootObjectId ?? record.threadRootId;
    current.lastPublishedAt = [current.lastPublishedAt, record.publishedAt ?? record.receivedAt].filter(Boolean).sort().at(-1) ?? null;
    current.participants = dedupeValues([...current.participants, ...(record.participantActorIds ?? [])]);
    current.localParticipants = dedupeValues([...current.localParticipants, ...(record.localParticipantHandles ?? [])]);
    current.mentions = dedupeValues([...current.mentions, ...(record.mentions ?? []).map((mention) => mention.actorId)]);
    threadMap.set(record.threadId, current);
  }

  return {
    actorHandle,
    threads: [...threadMap.values()].sort((left, right) => (right.lastPublishedAt ?? "").localeCompare(left.lastPublishedAt ?? "")),
  };
}

function rebuildInboundObjectProjection({ config, actorHandle, inboundRecord, getParentRecord }) {
  const mentionEntries = mergeMentionEntries(
    extractMentionEntriesFromTags(config, inboundRecord.tags),
    extractMentionEntriesFromContent(config, inboundRecord.content ?? ""),
  );
  const threadState = buildThreadState({
    config,
    store: {
      getInboundObject(_handle, objectId) {
        return getParentRecord(objectId);
      },
    },
    actorHandle,
    objectId: inboundRecord.objectId,
    inReplyTo: inboundRecord.inReplyTo,
    object: {
      context: inboundRecord.conversationId,
      conversation: inboundRecord.conversationId,
    },
    remoteActorId: inboundRecord.remoteActorId,
    mentionEntries,
  });

  return {
    ...inboundRecord,
    conversationId: threadState.conversationId,
    threadId: threadState.threadId,
    threadRootId: threadState.threadRootId,
    threadResolved: threadState.threadResolved,
    replyDepth: threadState.replyDepth,
    participantActorIds: threadState.participantActorIds,
    localParticipantHandles: threadState.localParticipantHandles,
    mentions: mentionEntries,
  };
}

function buildLocalConversationRecords({ actorHandle, inboundObjects, inboundEngagements, generatedAt }) {
  const conversations = new Map();

  for (const record of inboundObjects) {
    const threadId = record.threadId ?? record.threadRootId ?? record.objectId;
    const current = conversations.get(threadId) ?? {
      actorHandle,
      threadId,
      threadRootId: record.threadRootId ?? record.objectId,
      objectIds: [],
      engagementIds: [],
      objectCount: 0,
      replyCount: 0,
      engagementCount: 0,
      engagementCounts: {
        like: 0,
        announce: 0,
      },
      unresolvedObjectIds: [],
      participantActorIds: [],
      localParticipantHandles: [],
      mentionActorIds: [],
      actionMatrix: {
        inbound: {
          create: 0,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: 0,
          localParticipants: 0,
          mentions: 0,
          unresolvedObjects: 0,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved: true,
        },
      },
      latestObjectId: null,
      latestPublishedAt: null,
      updatedAt: generatedAt,
    };

    current.objectIds = dedupeValues([...current.objectIds, record.objectId]);
    current.objectCount += 1;
    if (record.mapping === "reply") {
      current.replyCount += 1;
      current.actionMatrix.inbound.reply += 1;
    } else {
      current.actionMatrix.inbound.create += 1;
    }
    if (!record.threadResolved) {
      current.unresolvedObjectIds = dedupeValues([...current.unresolvedObjectIds, record.objectId]);
    }
    current.participantActorIds = dedupeValues([...current.participantActorIds, ...(record.participantActorIds ?? [])]);
    current.localParticipantHandles = dedupeValues([...current.localParticipantHandles, ...(record.localParticipantHandles ?? [])]);
    current.mentionActorIds = dedupeValues([
      ...current.mentionActorIds,
      ...(record.mentions ?? []).map((entry) => entry.actorId),
    ]);

    const candidatePublishedAt = record.publishedAt ?? record.receivedAt ?? null;
    if ((candidatePublishedAt ?? "") >= (current.latestPublishedAt ?? "")) {
      current.latestPublishedAt = candidatePublishedAt;
      current.latestObjectId = record.objectId;
    }

    conversations.set(threadId, current);
  }

  for (const engagement of inboundEngagements) {
    const threadId = engagement.threadRootId ?? engagement.objectId;
    if (!threadId) {
      continue;
    }

    const current = conversations.get(threadId) ?? {
      actorHandle,
      threadId,
      threadRootId: engagement.threadRootId ?? engagement.objectId,
      objectIds: [],
      engagementIds: [],
      objectCount: 0,
      replyCount: 0,
      engagementCount: 0,
      engagementCounts: {
        like: 0,
        announce: 0,
      },
      unresolvedObjectIds: [],
      participantActorIds: [],
      localParticipantHandles: [],
      mentionActorIds: [],
      actionMatrix: {
        inbound: {
          create: 0,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: 0,
          localParticipants: 0,
          mentions: 0,
          unresolvedObjects: 0,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved: true,
        },
      },
      latestObjectId: null,
      latestPublishedAt: null,
      updatedAt: generatedAt,
    };

    current.engagementIds = dedupeValues([...current.engagementIds, engagement.activityId]);
    current.engagementCount += 1;
    if (engagement.threadResolved === false && engagement.objectId) {
      current.unresolvedObjectIds = dedupeValues([...current.unresolvedObjectIds, engagement.objectId]);
    }
    if (engagement.mapping === "like") {
      current.engagementCounts.like += 1;
      current.actionMatrix.inbound.like += 1;
    }
    if (engagement.mapping === "announce") {
      current.engagementCounts.announce += 1;
      current.actionMatrix.inbound.announce += 1;
    }
    current.participantActorIds = dedupeValues([...current.participantActorIds, engagement.remoteActorId]);
    conversations.set(threadId, current);
  }

  return [...conversations.values()]
    .map((record) => ({
      ...record,
      actionMatrix: {
        ...record.actionMatrix,
        participation: {
          participants: record.participantActorIds.length,
          localParticipants: record.localParticipantHandles.length,
          mentions: record.mentionActorIds.length,
          unresolvedObjects: record.unresolvedObjectIds.length,
        },
        state: {
          hasReplies: record.replyCount > 0,
          hasEngagements: record.engagementCount > 0,
          threadResolved: record.unresolvedObjectIds.length === 0,
        },
      },
    }))
    .sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""));
}

function buildLocalContentRecords({ actorHandle, inboundObjects, conversations, generatedAt }) {
  const objectMap = new Map(inboundObjects.map((record) => [record.objectId, record]));

  return conversations
    .map((conversation) => {
      const records = sortThreadObjects(
        conversation.objectIds
          .map((objectId) => objectMap.get(objectId))
          .filter(Boolean),
      );
      const rootRecord =
        objectMap.get(conversation.threadRootId) ??
        records.find((record) => record.objectId === conversation.threadRootId) ??
        null;
      const fallbackRecord = records[0] ?? null;
      const latestRecord = objectMap.get(conversation.latestObjectId) ?? records.at(-1) ?? fallbackRecord ?? rootRecord;
      const replyObjectIds = records
        .filter((record) => record.mapping === "reply")
        .map((record) => record.objectId);
      const contentId = conversation.threadRootId ?? conversation.threadId ?? rootRecord?.objectId ?? null;
      const threadResolved = conversation.actionMatrix.state.threadResolved && Boolean(rootRecord ?? fallbackRecord);

      return {
        actorHandle,
        contentId,
        threadId: conversation.threadId,
        threadRootId: conversation.threadRootId,
        rootObjectId: rootRecord?.objectId ?? null,
        rootObjectType: rootRecord?.objectType ?? null,
        rootMapping: rootRecord?.mapping ?? null,
        visibility: rootRecord?.visibility ?? fallbackRecord?.visibility ?? "public",
        status: threadResolved ? "resolved" : "partial",
        url: rootRecord?.url ?? latestRecord?.url ?? fallbackRecord?.url ?? null,
        headline: stripHtmlTags(rootRecord?.summary ?? "") || buildContentPreview(rootRecord ?? fallbackRecord),
        preview: buildContentPreview(latestRecord ?? rootRecord ?? fallbackRecord),
        latestObjectId: latestRecord?.objectId ?? conversation.latestObjectId ?? null,
        latestPublishedAt: latestRecord?.publishedAt ?? conversation.latestPublishedAt ?? null,
        participantActorIds: conversation.participantActorIds,
        localParticipantHandles: conversation.localParticipantHandles,
        mentionActorIds: conversation.mentionActorIds,
        metrics: {
          objects: conversation.objectCount,
          replies: conversation.replyCount,
          engagements: conversation.engagementCount,
          likes: conversation.engagementCounts.like,
          announces: conversation.engagementCounts.announce,
        },
        actionMatrix: {
          ...conversation.actionMatrix,
          state: {
            ...conversation.actionMatrix.state,
            threadResolved,
          },
        },
        relations: {
          inReplyTo: rootRecord?.inReplyTo ?? null,
          replyObjectIds,
          engagementIds: conversation.engagementIds,
        },
        updatedAt: generatedAt,
      };
    })
    .sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""));
}

function getAuthoredObjectActivityRecord(item) {
  const activity = item?.activity ?? {};
  const activityType = normalizeOptionalString(activity.type);
  const object = activity.object && typeof activity.object === "object" && !Array.isArray(activity.object) ? activity.object : null;
  const objectId =
    activityType === "Delete"
      ? getObjectReferenceId(activity.object)
      : normalizeOptionalString(object?.id) ?? getObjectReferenceId(activity.object);

  if (!activityType || !objectId) {
    return null;
  }

  if (!["Create", "Update", "Delete"].includes(activityType)) {
    return null;
  }

  return {
    activityId: normalizeOptionalString(activity.id) ?? normalizeOptionalString(item.id),
    activityType,
    objectId,
    object,
    actorId: normalizeOptionalString(activity.actor),
    inReplyTo: normalizeOptionalString(object?.inReplyTo),
    createdAt: normalizeOptionalString(item.createdAt),
  };
}

function buildLocalAuthoredContentRecords({ config, actorHandle, inboundObjects, outboundItems = [], generatedAt }) {
  const localActorId = config.actors[actorHandle]?.actorUrl ?? null;
  const inboundObjectMap = new Map(inboundObjects.map((record) => [record.objectId, record]));
  const distinctActivities = new Map();

  for (const item of outboundItems) {
    const record = getAuthoredObjectActivityRecord(item);
    if (!record) {
      continue;
    }
    if (record.actorId && localActorId && record.actorId !== localActorId) {
      continue;
    }

    const dedupeKey = record.activityId ?? `${record.activityType}::${record.objectId}`;
    const existing = distinctActivities.get(dedupeKey) ?? null;
    if (!existing || (record.createdAt ?? "") >= (existing.createdAt ?? "")) {
      distinctActivities.set(dedupeKey, record);
    }
  }

  const authoredContentMap = new Map();
  const orderedActivities = [...distinctActivities.values()].sort((left, right) =>
    (left.createdAt ?? "").localeCompare(right.createdAt ?? ""),
  );

  for (const activity of orderedActivities) {
    const existing = authoredContentMap.get(activity.objectId) ?? null;
    if (activity.activityType === "Delete") {
      if (!existing) {
        continue;
      }

      authoredContentMap.set(activity.objectId, {
        ...existing,
        status: "deleted",
        updatedAt: generatedAt,
      });
      continue;
    }

    if (!activity.object) {
      continue;
    }

    const mentionEntries = mergeMentionEntries(
      extractMentionEntriesFromTags(config, activity.object.tag),
      extractMentionEntriesFromContent(config, activity.object.content ?? ""),
    );
    const parentInboundRecord = activity.inReplyTo ? inboundObjectMap.get(activity.inReplyTo) ?? null : null;
    const parentAuthoredRecord = activity.inReplyTo ? authoredContentMap.get(activity.inReplyTo) ?? null : null;
    const parentRecord = parentAuthoredRecord ?? parentInboundRecord;
    const threadId =
      normalizeOptionalString(activity.object.context) ??
      normalizeOptionalString(activity.object.conversation) ??
      parentRecord?.threadId ??
      activity.inReplyTo ??
      activity.objectId;
    const threadRootId = parentRecord?.threadRootId ?? activity.inReplyTo ?? activity.objectId;
    const threadResolved = !activity.inReplyTo || Boolean(parentRecord);
    const participantActorIds = dedupeValues([
      localActorId,
      ...(parentRecord?.participantActorIds ?? []),
      ...mentionEntries.map((entry) => entry.actorId),
    ]);
    const localParticipantHandles = dedupeValues([
      actorHandle,
      ...(parentRecord?.localParticipantHandles ?? []),
      ...mentionEntries.map((entry) => (entry.isLocal ? entry.handle : null)),
    ]);
    const mentionActorIds = dedupeValues(mentionEntries.map((entry) => entry.actorId));
    const latestPublishedAt =
      normalizeOptionalString(activity.object.updated) ??
      normalizeOptionalString(activity.object.published) ??
      activity.createdAt ??
      generatedAt;
    const nextRecord = {
      actorHandle,
      contentId: activity.objectId,
      threadId,
      threadRootId,
      rootObjectId: activity.objectId,
      rootObjectType: normalizeOptionalString(activity.object.type) ?? null,
      rootMapping: activity.inReplyTo ? "reply" : "create",
      visibility: "public",
      status: existing?.status === "deleted" ? "deleted" : threadResolved ? "resolved" : "partial",
      url: normalizeOptionalString(activity.object.url) ?? null,
      headline: stripHtmlTags(activity.object.summary ?? "") || buildContentPreview(activity.object),
      preview: buildContentPreview(activity.object),
      latestObjectId: activity.objectId,
      latestPublishedAt,
      participantActorIds,
      localParticipantHandles,
      mentionActorIds,
      metrics: {
        objects: 1,
        replies: 0,
        engagements: 0,
        likes: 0,
        announces: 0,
      },
      actionMatrix: {
        inbound: {
          create: 0,
          reply: 0,
          like: 0,
          announce: 0,
        },
        participation: {
          participants: participantActorIds.length,
          localParticipants: localParticipantHandles.length,
          mentions: mentionActorIds.length,
          unresolvedObjects: threadResolved ? 0 : 1,
        },
        state: {
          hasReplies: false,
          hasEngagements: false,
          threadResolved,
        },
      },
      relations: {
        inReplyTo: activity.inReplyTo ?? null,
        replyObjectIds: [],
        engagementIds: [],
        identityObjectIds: [activity.objectId],
      },
      updatedAt: generatedAt,
    };
    authoredContentMap.set(activity.objectId, nextRecord);
  }

  return [...authoredContentMap.values()].sort((left, right) =>
    (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""),
  );
}

function mergeLocalContentRecords({ threadedContents = [], authoredContents = [] }) {
  const merged = new Map(threadedContents.map((content) => [content.contentId, content]));
  for (const content of authoredContents) {
    if (!merged.has(content.contentId)) {
      merged.set(content.contentId, content);
    }
  }

  return [...merged.values()].sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""));
}

function createEmptyDeliveryProjection() {
  return {
    activityMap: new Map(),
    recipientActorIds: new Set(),
    outbound: {
      create: 0,
      reply: 0,
      like: 0,
      announce: 0,
      update: 0,
      delete: 0,
    },
    delivery: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
      partial: 0,
      lastDeliveredAt: null,
      lastFailureAt: null,
      lastError: null,
      recipientCount: 0,
      recipients: {
        total: 0,
        delivered: 0,
        pending: 0,
        retryPending: 0,
        deadLetter: 0,
      },
    },
  };
}

function buildContentDeliveryProjection({ contents, outboundItems = [] }) {
  const projections = new Map(contents.map((content) => [content.contentId, createEmptyDeliveryProjection()]));
  const activityRecords = buildContentOutboundActivityRecords({ contents, outboundItems });

  for (const [contentId, records] of activityRecords.entries()) {
    const projection = projections.get(contentId);
    for (const record of records) {
      projection.outbound[record.actionType] += 1;
      projection.delivery.total += 1;
      projection.delivery[record.delivery.status] += 1;
      projection.delivery.lastDeliveredAt =
        [projection.delivery.lastDeliveredAt, record.delivery.lastDeliveredAt].filter(Boolean).sort().at(-1) ?? null;
      projection.delivery.lastFailureAt =
        [projection.delivery.lastFailureAt, record.delivery.lastFailureAt].filter(Boolean).sort().at(-1) ?? null;
      projection.delivery.lastError = record.delivery.lastError ?? projection.delivery.lastError;

      for (const actorId of record.recipientActorIds) {
        projection.recipientActorIds.add(actorId);
      }
      projection.delivery.recipients.total += record.delivery.recipients.total;
      projection.delivery.recipients.delivered += record.delivery.recipients.delivered;
      projection.delivery.recipients.pending += record.delivery.recipients.pending;
      projection.delivery.recipients.retryPending += record.delivery.recipients.retryPending;
      projection.delivery.recipients.deadLetter += record.delivery.recipients.deadLetter;
    }
    projection.delivery.recipientCount = projection.recipientActorIds.size;
  }

  return projections;
}

function buildContentIndex(contents = []) {
  const identityToContentId = new Map();

  for (const content of contents) {
    for (const identity of buildContentIdentitySet(content)) {
      identityToContentId.set(identity, content.contentId);
    }
  }

  return identityToContentId;
}

function buildLocalNotificationEventRecords({ config, actorHandle, inboundObjects, inboundEngagements, contents, generatedAt }) {
  const actorId = config.actors[actorHandle]?.actorUrl ?? null;
  const contentIndex = buildContentIndex(contents);
  const contentMap = new Map(contents.map((content) => [content.contentId, content]));
  const notifications = [];

  for (const record of inboundObjects) {
    const categories = [];
    if (record.mapping === "reply") {
      categories.push("reply");
    }
    if ((record.mentions ?? []).some((entry) => entry.actorId === actorId)) {
      categories.push("mention");
    }
    if (!categories.length) {
      continue;
    }

    const contentId =
      contentIndex.get(record.threadRootId) ??
      contentIndex.get(record.objectId) ??
      contentIndex.get(record.inReplyTo) ??
      null;
    for (const category of categories) {
      notifications.push({
        notificationId: `${record.activityId ?? record.objectId}::${category}`,
        actorHandle,
        primaryCategory: category,
        categories: [category],
        contentId,
        threadId: record.threadId ?? null,
        threadRootId: record.threadRootId ?? null,
        objectId: record.objectId,
        activityId: record.activityId ?? null,
        remoteActorId: record.remoteActorId,
        headline: contentMap.get(contentId)?.headline ?? null,
        preview: buildContentPreview(record),
        publishedAt: record.publishedAt ?? record.receivedAt ?? null,
        receivedAt: record.receivedAt ?? generatedAt,
        status: "active",
        updatedAt: generatedAt,
      });
    }
  }

  for (const engagement of inboundEngagements) {
    const category = engagement.mapping === "announce" ? "announce" : engagement.mapping === "like" ? "like" : null;
    if (!category) {
      continue;
    }

    const contentId =
      contentIndex.get(engagement.threadRootId) ??
      contentIndex.get(engagement.objectId) ??
      null;
    notifications.push({
      notificationId: engagement.activityId,
      actorHandle,
      primaryCategory: category,
      categories: [category],
      contentId,
      threadId: engagement.threadRootId ?? engagement.objectId ?? null,
      threadRootId: engagement.threadRootId ?? engagement.objectId ?? null,
      objectId: engagement.objectId ?? null,
      activityId: engagement.activityId,
      remoteActorId: engagement.remoteActorId,
      headline: contentMap.get(contentId)?.headline ?? null,
      preview: contentMap.get(contentId)?.preview ?? null,
      publishedAt: engagement.receivedAt ?? null,
      receivedAt: engagement.receivedAt ?? generatedAt,
      status: "active",
      updatedAt: generatedAt,
    });
  }

  return notifications.sort((left, right) => (right.publishedAt ?? right.receivedAt ?? "").localeCompare(left.publishedAt ?? left.receivedAt ?? ""));
}

function buildNotificationGroupId(notification) {
  const targetId = notification.contentId ?? notification.threadRootId ?? notification.objectId ?? notification.activityId;
  return `${notification.primaryCategory}::${targetId}`;
}

function buildGroupedNotificationRecords({ actorHandle, notificationEvents = [], previousNotifications = [], generatedAt }) {
  const previousMap = new Map((previousNotifications ?? []).map((entry) => [entry.notificationId, entry]));
  const groupedEvents = new Map();

  for (const event of notificationEvents) {
    const groupId = buildNotificationGroupId(event);
    const current = groupedEvents.get(groupId) ?? [];
    current.push(event);
    groupedEvents.set(groupId, current);
  }

  return [...groupedEvents.entries()]
    .map(([notificationId, events]) => {
      const sortedEvents = [...events].sort((left, right) =>
        (left.publishedAt ?? left.receivedAt ?? "").localeCompare(right.publishedAt ?? right.receivedAt ?? ""),
      );
      const latestEvent = sortedEvents.at(-1);
      const previous = previousMap.get(notificationId) ?? null;
      const readState = previous?.state ?? null;
      const previousReadEventCount = readState?.readEventCount ?? 0;
      const hasNewEvents = sortedEvents.length > previousReadEventCount;
      const read = readState?.read === true && !hasNewEvents;
      const unreadCount = read ? 0 : Math.max(sortedEvents.length - previousReadEventCount, 0) || sortedEvents.length;

      return {
        notificationId,
        actorHandle,
        primaryCategory: latestEvent.primaryCategory,
        categories: [latestEvent.primaryCategory],
        contentId: latestEvent.contentId ?? null,
        threadId: latestEvent.threadId ?? null,
        threadRootId: latestEvent.threadRootId ?? null,
        objectId: latestEvent.objectId ?? null,
        activityId: latestEvent.activityId ?? null,
        remoteActorIds: dedupeValues(sortedEvents.map((entry) => entry.remoteActorId)),
        headline: latestEvent.headline ?? null,
        preview: latestEvent.preview ?? null,
        publishedAt: latestEvent.publishedAt ?? null,
        receivedAt: latestEvent.receivedAt ?? generatedAt,
        status: "active",
        eventCount: sortedEvents.length,
        unreadCount,
        groupedNotificationIds: sortedEvents.map((entry) => entry.notificationId),
        latestEventAt: latestEvent.publishedAt ?? latestEvent.receivedAt ?? null,
        state: {
          read,
          readAt: read ? readState?.readAt ?? null : null,
          readBy: read ? readState?.readBy ?? null : null,
          readEventCount: read ? readState?.readEventCount ?? sortedEvents.length : previousReadEventCount,
        },
        updatedAt: generatedAt,
      };
    })
    .sort((left, right) => (right.latestEventAt ?? right.receivedAt ?? "").localeCompare(left.latestEventAt ?? left.receivedAt ?? ""));
}

function buildNotificationSummaryMap({ notificationEvents = [], notifications = [] } = {}) {
  const summaryMap = new Map();

  for (const notification of notificationEvents) {
    if (!notification.contentId) {
      continue;
    }

    const current = summaryMap.get(notification.contentId) ?? {
      total: 0,
      reply: 0,
      mention: 0,
      like: 0,
      announce: 0,
      unreadTotal: 0,
      unreadReply: 0,
      unreadMention: 0,
      unreadLike: 0,
      unreadAnnounce: 0,
      latestAt: null,
      latestNotificationId: null,
    };
    current.total += 1;
    for (const category of notification.categories ?? []) {
      if (category in current) {
        current[category] += 1;
      }
    }
    const candidateTimestamp = notification.publishedAt ?? notification.receivedAt ?? null;
    if ((candidateTimestamp ?? "") >= (current.latestAt ?? "")) {
      current.latestAt = candidateTimestamp;
      current.latestNotificationId = notification.notificationId;
    }
    summaryMap.set(notification.contentId, current);
  }

  for (const notification of notifications) {
    if (!notification.contentId) {
      continue;
    }

    const current = summaryMap.get(notification.contentId) ?? {
      total: 0,
      reply: 0,
      mention: 0,
      like: 0,
      announce: 0,
      unreadTotal: 0,
      unreadReply: 0,
      unreadMention: 0,
      unreadLike: 0,
      unreadAnnounce: 0,
      latestAt: null,
      latestNotificationId: null,
    };
    if (!notificationEvents.length) {
      current.total += notification.eventCount ?? 0;
      if (notification.primaryCategory === "reply") {
        current.reply += notification.eventCount ?? 0;
      }
      if (notification.primaryCategory === "mention") {
        current.mention += notification.eventCount ?? 0;
      }
      if (notification.primaryCategory === "like") {
        current.like += notification.eventCount ?? 0;
      }
      if (notification.primaryCategory === "announce") {
        current.announce += notification.eventCount ?? 0;
      }
    }
    if (notification.unreadCount <= 0) {
      summaryMap.set(notification.contentId, current);
      continue;
    }
    current.unreadTotal += notification.unreadCount;
    if (notification.primaryCategory === "reply") {
      current.unreadReply += notification.unreadCount;
    }
    if (notification.primaryCategory === "mention") {
      current.unreadMention += notification.unreadCount;
    }
    if (notification.primaryCategory === "like") {
      current.unreadLike += notification.unreadCount;
    }
    if (notification.primaryCategory === "announce") {
      current.unreadAnnounce += notification.unreadCount;
    }
    summaryMap.set(notification.contentId, current);
  }

  return summaryMap;
}

function mergeContentApplicationProjection({ contents, notificationEvents = [], notifications = [], outboundItems = [] }) {
  const deliveryProjection = buildContentDeliveryProjection({ contents, outboundItems });
  const notificationSummaryMap = buildNotificationSummaryMap({
    notificationEvents,
    notifications,
  });

  return contents.map((content) => {
    const delivery = deliveryProjection.get(content.contentId) ?? createEmptyDeliveryProjection();
    const notificationsSummary = notificationSummaryMap.get(content.contentId) ?? {
      total: 0,
      reply: 0,
      mention: 0,
      like: 0,
      announce: 0,
      latestAt: null,
      latestNotificationId: null,
    };

    return {
      ...content,
      notifications: notificationsSummary,
      delivery: {
        ...delivery.delivery,
      },
      actionMatrix: {
        ...content.actionMatrix,
        notifications: {
          total: notificationsSummary.total,
          reply: notificationsSummary.reply,
          mention: notificationsSummary.mention,
          like: notificationsSummary.like,
          announce: notificationsSummary.announce,
          unreadTotal: notificationsSummary.unreadTotal,
          unreadReply: notificationsSummary.unreadReply,
          unreadMention: notificationsSummary.unreadMention,
          unreadLike: notificationsSummary.unreadLike,
          unreadAnnounce: notificationsSummary.unreadAnnounce,
        },
        outbound: {
          ...delivery.outbound,
        },
        delivery: {
          total: delivery.delivery.total,
          delivered: delivery.delivery.delivered,
          pending: delivery.delivery.pending,
          retryPending: delivery.delivery.retryPending,
          deadLetter: delivery.delivery.deadLetter,
          partial: delivery.delivery.partial,
        },
      },
    };
  });
}

function buildOutboundAudience({ actor, explicitActorIds = [], object = null, includeFollowers = true }) {
  const objectTo = normalizeAudience(object?.to).length ? normalizeAudience(object?.to) : [PUBLIC_AUDIENCE];
  const objectCc = normalizeAudience(object?.cc);
  const baseCc = includeFollowers ? [actor.followersUrl] : [];

  return {
    to: dedupeValues(objectTo),
    cc: dedupeValues([...baseCc, ...objectCc, ...explicitActorIds]),
  };
}

function parseJsonBody(bodyText) {
  if (!bodyText) {
    return {};
  }

  return JSON.parse(bodyText);
}

function buildQueueItemId(activityId, remoteActorId, index) {
  const encodedActorId = Buffer.from(remoteActorId).toString("base64url");
  return `${activityId}::${index}-${encodedActorId}`;
}

function getDomainFromUri(value) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildAbuseCaseId(now) {
  return `abuse-${now.getTime()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildLegalCaseId(now) {
  return `legal-${now.getTime()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildRateLimitCounterKey(policyKey, actorHandle = null) {
  return actorHandle ? `${policyKey}:${actorHandle}` : policyKey;
}

function buildEvidenceRecordId(now) {
  return `evidence-${now.getTime()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getEvidenceRetentionDays(config) {
  const retentionDays = config.moderation?.evidenceRetentionDays;
  return Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 365;
}

async function verifySignatureWithRemoteActor({ request, bodyText, remoteActor }) {
  const url = new URL(request.url);
  return verifyHttpSignature({
    method: request.method,
    pathnameWithQuery: `${url.pathname}${url.search}`,
    headers: request.headers,
    body: bodyText,
    publicKeyPem: remoteActor.publicKeyPem,
    expectedKeyId: remoteActor.keyId,
  });
}

async function verifyInboundFollow({ request, bodyText, activity, remoteActorDirectory }) {
  const remoteActorId = getActivityActorId(activity);
  let remoteActor = await remoteActorDirectory.resolve(remoteActorId);
  let verification;

  try {
    verification = await verifySignatureWithRemoteActor({
      request,
      bodyText,
      remoteActor,
    });
  } catch (error) {
    remoteActor = await remoteActorDirectory.refresh(remoteActorId);
    verification = await verifySignatureWithRemoteActor({
      request,
      bodyText,
      remoteActor,
    });
  }

  return {
    remoteActorId,
    remoteActor,
    verification,
  };
}

export function createGatewayApp({
  config,
  store,
  deliveryClient = createFetchDeliveryClient({ userAgent: config.delivery.userAgent }),
  remoteActorDirectory = createRemoteActorDirectory({
    seedActors: config.remoteActors,
    store,
    cacheTtlMs: config.remoteDiscovery?.cacheTtlMs ?? 60 * 60 * 1000,
  }),
  outboxBridge = null,
  clock = () => new Date(),
}) {
  const deliveryProcessor = createDeliveryProcessor({
    store,
    deliveryClient,
    config,
    clock,
  });
  const evidenceRetentionDays = getEvidenceRetentionDays(config);
  const mentionFailureRetryMs =
    Number.isFinite(config.remoteDiscovery?.mentionFailureRetryMs) && config.remoteDiscovery.mentionFailureRetryMs > 0
      ? Math.floor(config.remoteDiscovery.mentionFailureRetryMs)
      : DEFAULT_MENTION_FAILURE_RETRY_MS;
  const effectiveOutboxBridge = outboxBridge ?? createStaticOutboxBridge({
    async recordAudit(entry) {
      await store.recordTrace(
        makeTrace(clock, {
          event: `visibility.${entry.decision}`,
          ...entry,
        }),
      );
    },
  });

  function buildEvidenceRecord({
    category,
    actorHandle = null,
    remoteActorId = null,
    remoteDomain = null,
    activityId = null,
    activityType = null,
    objectId = null,
    caseId = null,
    queueItemId = null,
    policyKey = null,
    abuseCaseId = null,
    surface = null,
    reason = null,
    snapshot = {},
  }) {
    const now = clock();
    const retainedAt = now.toISOString();
    const retentionUntil = new Date(now.getTime() + evidenceRetentionDays * 24 * 60 * 60 * 1000).toISOString();

    return {
      id: buildEvidenceRecordId(now),
      status: "retained",
      category,
      actorHandle,
      remoteActorId,
      remoteDomain,
      activityId,
      activityType,
      objectId,
      caseId,
      queueItemId,
      policyKey,
      abuseCaseId,
      surface,
      reason,
      retainedAt,
      retentionUntil,
      snapshot,
    };
  }

  function buildMentionResolutionTrace({
    actorHandle,
    surface,
    objectId = null,
    account,
    status,
    actorId = null,
    failure = null,
    cacheHit = false,
    source = null,
    nextRetryAt = null,
  }) {
    return makeTrace(clock, {
      direction: "outbound",
      event: status === "resolved" ? "mention-resolution.resolved" : "mention-resolution.skipped",
      actorHandle,
      surface,
      objectId,
      account,
      status,
      actorId,
      code: failure?.code ?? null,
      stage: failure?.stage ?? null,
      reason: failure?.message ?? null,
      statusCode: failure?.statusCode ?? null,
      retryable: failure?.retryable ?? null,
      cacheHit,
      source,
      nextRetryAt,
    });
  }

  function buildMentionResolutionRecord({
    existingRecord = null,
    actorHandle,
    surface,
    objectId = null,
    account,
    status,
    actorId = null,
    failure = null,
    source = null,
    nextRetryAt = null,
  }) {
    const attemptedAt = clock().toISOString();
    const baseRecord = {
      account,
      actorHandle,
      surface,
      objectId,
      status,
      actorId,
      source,
      lastAttemptAt: attemptedAt,
      lastStatusChangedAt:
        existingRecord?.status === status ? existingRecord.lastStatusChangedAt ?? attemptedAt : attemptedAt,
      attempts: (existingRecord?.attempts ?? 0) + 1,
      successCount: existingRecord?.successCount ?? 0,
      failureCount: existingRecord?.failureCount ?? 0,
    };

    if (status === "resolved") {
      return {
        ...baseRecord,
        actorId,
        source,
        failure: null,
        nextRetryAt: null,
        lastSuccessAt: attemptedAt,
        lastFailureAt: existingRecord?.lastFailureAt ?? null,
        successCount: (existingRecord?.successCount ?? 0) + 1,
        failureCount: existingRecord?.failureCount ?? 0,
      };
    }

    return {
      ...baseRecord,
      actorId: existingRecord?.actorId ?? actorId ?? null,
      source,
      failure,
      nextRetryAt,
      lastSuccessAt: existingRecord?.lastSuccessAt ?? null,
      lastFailureAt: attemptedAt,
      successCount: existingRecord?.successCount ?? 0,
      failureCount: (existingRecord?.failureCount ?? 0) + 1,
    };
  }

  function shouldReuseMentionResolutionRecord(record, nowIso) {
    if (!record) {
      return false;
    }

    if (record.status === "permanent_error") {
      return true;
    }

    if (record.status !== "retryable_error" || !record.nextRetryAt) {
      return false;
    }

    return Date.parse(record.nextRetryAt) > Date.parse(nowIso);
  }

  function buildUnresolvedMentionTag(account) {
    return {
      type: "Mention",
      name: account,
    };
  }

  function buildMentionResolutionResponse(results = []) {
    return {
      resolved: results
        .filter((entry) => entry.status === "resolved")
        .map((entry) => ({
          account: entry.account,
          actorId: entry.actorId,
          source: entry.source,
          cacheHit: entry.cacheHit,
        })),
      skipped: results
        .filter((entry) => entry.status !== "resolved")
        .map((entry) => ({
          account: entry.account,
          status: entry.status,
          cacheHit: entry.cacheHit,
          nextRetryAt: entry.nextRetryAt ?? null,
          failure: entry.failure ?? null,
        })),
    };
  }

  async function fanOutActivity({ actorHandle, remoteActors, activity, traceEvent }) {
    const deliveries = [];

    for (const [index, remoteActor] of remoteActors.entries()) {
      const queueItem = await store.enqueueOutbound({
        id: buildQueueItemId(activity.id, remoteActor.remoteActorId, index),
        status: "pending",
        attempts: 0,
        actorHandle,
        targetActorId: remoteActor.remoteActorId,
        targetInbox: remoteActor.sharedInbox ?? remoteActor.inbox,
        activity,
        createdAt: clock().toISOString(),
      });
      const outboundResult = await deliveryProcessor.process(queueItem.id);
      deliveries.push(outboundResult);
    }

    await store.recordTrace(
      makeTrace(clock, {
        direction: "outbound",
        event: traceEvent,
        actorHandle,
        activityId: activity.id,
        recipients: remoteActors.map((entry) => entry.remoteActorId),
        deliveryCount: deliveries.length,
      }),
    );

    await syncLocalDomainProjection(actorHandle);

    return deliveries;
  }

  async function resolveExplicitRemoteActors(actorIds = []) {
    const resolvedActors = [];

    for (const actorId of dedupeValues(actorIds)) {
      if (findActorByUrl(config, actorId)) {
        continue;
      }

      const followerRecord = Object.values(config.actors)
        .flatMap((candidate) => store.getFollowers(candidate.handle))
        .find((entry) => entry.remoteActorId === actorId);
      if (followerRecord) {
        resolvedActors.push(followerRecord);
        continue;
      }

      const remoteActor = await remoteActorDirectory.resolve(actorId);
      resolvedActors.push({
        remoteActorId: actorId,
        inbox: remoteActor.inbox,
        sharedInbox: remoteActor.sharedInbox ?? null,
      });
    }

    return resolvedActors.filter(
      (entry, index, list) => list.findIndex((candidate) => candidate.remoteActorId === entry.remoteActorId) === index,
    );
  }

  async function resolveRemoteMentionEntries({ actorHandle, surface, objectId = null, mentionEntries = [], accountCandidates = [] }) {
    const resolvedEntries = [...mentionEntries];
    const resolutionResults = [];
    const existingActorIds = new Set(mentionEntries.map((entry) => entry.actorId));
    const existingAccounts = new Set(
      mentionEntries
        .map((entry) => entry.acct ?? buildAcctString(parseMentionAddress(entry.name ?? "")))
        .filter(Boolean),
    );

    for (const account of dedupeValues(accountCandidates)) {
      const parsed = parseMentionAddress(account);
      if (!parsed?.domain || parsed.domain === config.instance.domain.toLowerCase()) {
        continue;
      }
      const normalizedAccount = buildAcctString(parsed);
      if (existingAccounts.has(normalizedAccount)) {
        continue;
      }

      const cachedResolution = store.getMentionResolution?.(normalizedAccount) ?? null;
      const nowIso = clock().toISOString();

      if (shouldReuseMentionResolutionRecord(cachedResolution, nowIso)) {
        resolutionResults.push({
          account: normalizedAccount,
          status: cachedResolution.status,
          actorId: cachedResolution.actorId ?? null,
          cacheHit: true,
          source: cachedResolution.source ?? "mention-resolution-cache",
          nextRetryAt: cachedResolution.nextRetryAt ?? null,
          failure: cachedResolution.failure ?? null,
        });
        await store.recordTrace(
          buildMentionResolutionTrace({
            actorHandle,
            surface,
            objectId,
            account: normalizedAccount,
            status: cachedResolution.status,
            actorId: cachedResolution.actorId ?? null,
            failure: cachedResolution.failure ?? null,
            cacheHit: true,
            source: cachedResolution.source ?? "mention-resolution-cache",
            nextRetryAt: cachedResolution.nextRetryAt ?? null,
          }),
        );
        continue;
      }

      let remoteActor;
      let resolutionSource = cachedResolution?.status === "resolved" && cachedResolution.actorId ? "actor-id-cache" : "webfinger";

      try {
        if (cachedResolution?.status === "resolved" && cachedResolution.actorId) {
          try {
            remoteActor = await remoteActorDirectory.resolve(cachedResolution.actorId);
          } catch (error) {
            const failure = classifyRemoteActorResolutionError(error);
            const staleRemoteActor = store.getRemoteActor?.(cachedResolution.actorId) ?? null;
            if (failure.retryable && isUsableRemoteDeliveryRecord(staleRemoteActor)) {
              remoteActor = staleRemoteActor;
              resolutionSource = "stale-actor-cache";
            } else {
              throw error;
            }
          }
        } else {
          remoteActor = await remoteActorDirectory.resolveAccount(account);
        }
      } catch (error) {
        const failure = classifyRemoteActorResolutionError(error);
        const nextRetryAt =
          failure.retryable ? new Date(clock().getTime() + mentionFailureRetryMs).toISOString() : null;
        const record = buildMentionResolutionRecord({
          existingRecord: cachedResolution,
          actorHandle,
          surface,
          objectId,
          account: normalizedAccount,
          status: failure.status,
          failure,
          source: failure.stage,
          nextRetryAt,
        });
        await store.upsertMentionResolution?.(normalizedAccount, record);
        await store.recordTrace(
          buildMentionResolutionTrace({
            actorHandle,
            surface,
            objectId,
            account: normalizedAccount,
            status: failure.status,
            actorId: record.actorId ?? null,
            failure,
            cacheHit: false,
            source: failure.stage,
            nextRetryAt,
          }),
        );
        await recordEvidence(
          buildEvidenceRecord({
            category: "mention-resolution",
            actorHandle,
            remoteDomain: parsed.domain,
            objectId,
            surface,
            reason: error.message,
            snapshot: {
              account: normalizedAccount,
              status: failure.status,
              failure,
              nextRetryAt,
            },
          }),
        );
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "mention-resolution.failed",
          actorHandle,
          surface,
          objectId,
          account: normalizedAccount,
          status: failure.status,
          failure,
          nextRetryAt,
        });
        resolutionResults.push({
          account: normalizedAccount,
          status: failure.status,
          actorId: record.actorId ?? null,
          cacheHit: false,
          source: failure.stage,
          nextRetryAt,
          failure,
        });
        continue;
      }

      if (existingActorIds.has(remoteActor.actorId)) {
        existingAccounts.add(normalizedAccount);
        const record = buildMentionResolutionRecord({
          existingRecord: cachedResolution,
          actorHandle,
          surface,
          objectId,
          account: normalizedAccount,
          status: "resolved",
          actorId: remoteActor.actorId,
          source: resolutionSource,
        });
        await store.upsertMentionResolution?.(normalizedAccount, record);
        await store.recordTrace(
          buildMentionResolutionTrace({
            actorHandle,
            surface,
            objectId,
            account: normalizedAccount,
            status: "resolved",
            actorId: remoteActor.actorId,
            cacheHit: resolutionSource !== "webfinger",
            source: resolutionSource,
          }),
        );
        resolutionResults.push({
          account: normalizedAccount,
          status: "resolved",
          actorId: remoteActor.actorId,
          cacheHit: resolutionSource !== "webfinger",
          source: resolutionSource,
        });
        continue;
      }

      const record = buildMentionResolutionRecord({
        existingRecord: cachedResolution,
        actorHandle,
        surface,
        objectId,
        account: normalizedAccount,
        status: "resolved",
        actorId: remoteActor.actorId,
        source: resolutionSource,
      });
      await store.upsertMentionResolution?.(normalizedAccount, record);
      await store.recordTrace(
        buildMentionResolutionTrace({
          actorHandle,
          surface,
          objectId,
          account: normalizedAccount,
          status: "resolved",
          actorId: remoteActor.actorId,
          cacheHit: resolutionSource !== "webfinger",
          source: resolutionSource,
        }),
      );
      resolvedEntries.push({
        actorId: remoteActor.actorId,
        name: normalizedAccount,
        isLocal: false,
        handle: parsed.handle,
        acct: normalizedAccount,
      });
      existingActorIds.add(remoteActor.actorId);
      existingAccounts.add(normalizedAccount);
      resolutionResults.push({
        account: normalizedAccount,
        status: "resolved",
        actorId: remoteActor.actorId,
        cacheHit: resolutionSource !== "webfinger",
        source: resolutionSource,
      });
    }

    return {
      resolvedEntries,
      resolutionResults,
    };
  }

  async function buildFanOutRecipients({ actorHandle, explicitActorIds = [] }) {
    const followerRecipients = store
      .getFollowers(actorHandle)
      .filter((entry) => entry.status === "accepted" && (entry.sharedInbox ?? entry.inbox));
    const explicitRecipients = await resolveExplicitRemoteActors(explicitActorIds);

    return [...followerRecipients, ...explicitRecipients].filter(
      (entry, index, list) => list.findIndex((candidate) => candidate.remoteActorId === entry.remoteActorId) === index,
    );
  }

  async function syncLocalDomainProjection(actorHandle) {
    if (!store.replaceLocalConversations) {
      return [];
    }

    const conversations = buildLocalConversationRecords({
      actorHandle,
      inboundObjects: store.getInboundObjects?.(actorHandle) ?? [],
      inboundEngagements: store.getInboundEngagements?.(actorHandle) ?? [],
      generatedAt: clock().toISOString(),
    });
    const threadedContents = buildLocalContentRecords({
      actorHandle,
      inboundObjects: store.getInboundObjects?.(actorHandle) ?? [],
      conversations,
      generatedAt: clock().toISOString(),
    });
    const outboundItems = store.getOutboundItems?.({ actorHandle }) ?? [];
    const authoredContents = buildLocalAuthoredContentRecords({
      config,
      actorHandle,
      inboundObjects: store.getInboundObjects?.(actorHandle) ?? [],
      outboundItems,
      generatedAt: clock().toISOString(),
    });
    const contents = mergeLocalContentRecords({
      threadedContents,
      authoredContents,
    });
    const notificationEvents = buildLocalNotificationEventRecords({
      config,
      actorHandle,
      inboundObjects: store.getInboundObjects?.(actorHandle) ?? [],
      inboundEngagements: store.getInboundEngagements?.(actorHandle) ?? [],
      contents,
      generatedAt: clock().toISOString(),
    });
    const notifications = buildGroupedNotificationRecords({
      actorHandle,
      notificationEvents,
      previousNotifications: store.getLocalNotifications?.(actorHandle) ?? [],
      generatedAt: clock().toISOString(),
    });
    const enrichedContents = mergeContentApplicationProjection({
      contents,
      notificationEvents,
      notifications,
      outboundItems,
    });
    await store.replaceLocalConversations(actorHandle, conversations);
    await store.replaceLocalContents?.(actorHandle, enrichedContents);
    await store.replaceLocalNotifications?.(actorHandle, notifications);
    return conversations;
  }

  function resolveLocalContentRecord({ actorHandle, contentId = null, threadId = null }) {
    const items = store.getLocalContents?.(actorHandle) ?? [];
    if (contentId) {
      return store.getLocalContent?.(actorHandle, contentId) ?? null;
    }
    if (threadId) {
      return items.find((entry) => entry.threadId === threadId) ?? null;
    }
    return null;
  }

  function buildLocalContentDeliveryReport({
    actorHandle,
    contentId = null,
    threadId = null,
    activityId = null,
    actionType = null,
    status = null,
  }) {
    const content = resolveLocalContentRecord({ actorHandle, contentId, threadId });
    if (!content) {
      return null;
    }

    const projection = store.getContentDeliveryProjection?.(actorHandle) ?? null;
    const records =
      projection?.contents?.find((entry) => entry.contentId === content.contentId)?.activities ??
      buildContentOutboundActivityRecords({
        contents: [content],
        outboundItems: store.getOutboundItems?.({ actorHandle }) ?? [],
      }).get(content.contentId) ??
      [];

    const filtered = records.filter((entry) => {
      if (activityId && entry.activityId !== activityId) {
        return false;
      }
      if (actionType && entry.actionType !== actionType) {
        return false;
      }
      if (status && entry.delivery.status !== status) {
        return false;
      }
      return true;
    });

    return {
      actorHandle,
      content,
      summary: buildDeliveryStatusSummary(filtered),
      items: filtered,
      item: activityId ? filtered.find((entry) => entry.activityId === activityId) ?? null : null,
    };
  }

  function buildContentDeliveryOpsSnapshot({
    actorHandle = null,
    limit = 20,
    status = null,
  } = {}) {
    if (store.getContentDeliveryOpsSnapshot) {
      return store.getContentDeliveryOpsSnapshot({
        actorHandle,
        actorHandles: Object.keys(config.actors),
        limit,
        status,
      });
    }

    return buildStoreContentDeliveryOpsSnapshot({
      actorHandle,
      actorHandles: Object.keys(config.actors),
      limit,
      status,
      getContentsForActor: (handle) => store.getLocalContents?.(handle) ?? [],
      getOutboundItemsForActor: (handle) => store.getOutboundItems?.({ actorHandle: handle }) ?? [],
      auditLog: store.getAuditLog?.(Math.max(limit * 2, 20)) ?? [],
    });
  }

  function buildContentDeliveryActivityIndex({
    actorHandle = null,
    limit = 20,
    status = null,
    actionType = null,
    activityId = null,
    replayedOnly = false,
    replayableOnly = false,
  } = {}) {
    if (store.getContentDeliveryActivityIndex) {
      return store.getContentDeliveryActivityIndex({
        actorHandle,
        actorHandles: Object.keys(config.actors),
        limit,
        status,
        actionType,
        activityId,
        replayedOnly,
        replayableOnly,
      });
    }

    return buildUniqueContentDeliveryActivities({
      actorHandle,
      actorHandles: Object.keys(config.actors),
      limit,
      status,
      actionType,
      activityId,
      replayedOnly,
      replayableOnly,
      auditLog: store.getAuditLog?.(Math.max(limit * 5, 20)) ?? [],
      getContentsForActor: (handle) => store.getLocalContents?.(handle) ?? [],
      getOutboundItemsForActor: (handle) => store.getOutboundItems?.({ actorHandle: handle }) ?? [],
    });
  }

  function getContentDeliveryReviewSnapshot(options = {}) {
    return store.getContentDeliveryReviewSnapshot?.(options) ?? buildContentDeliveryOpsSnapshot(options);
  }

  async function reconcileLocalDomainProjection(actorHandle, { dryRun = false } = {}) {
    const existingObjects = sortThreadObjects(store.getInboundObjects?.(actorHandle) ?? []);
    let workingObjects = existingObjects;

    for (let pass = 0; pass < 3; pass += 1) {
      const priorMap = new Map(workingObjects.map((record) => [record.objectId, record]));
      const rebuiltMap = new Map();

      for (const record of sortThreadObjects(workingObjects)) {
        const rebuilt = rebuildInboundObjectProjection({
          config,
          actorHandle,
          inboundRecord: record,
          getParentRecord(objectId) {
            return rebuiltMap.get(objectId) ?? priorMap.get(objectId) ?? null;
          },
        });
        rebuiltMap.set(rebuilt.objectId, rebuilt);
      }

      const rebuiltObjects = sortThreadObjects([...rebuiltMap.values()]);
      if (JSON.stringify(rebuiltObjects) === JSON.stringify(workingObjects)) {
        workingObjects = rebuiltObjects;
        break;
      }
      workingObjects = rebuiltObjects;
    }

    let mentionsBackfilled = 0;
    let objectsResolved = 0;
    for (const rebuilt of workingObjects) {
      const previous = store.getInboundObject?.(actorHandle, rebuilt.objectId) ?? null;
      if ((previous?.mentions?.length ?? 0) < (rebuilt.mentions?.length ?? 0)) {
        mentionsBackfilled += 1;
      }
      if (previous?.threadResolved === false && rebuilt.threadResolved === true) {
        objectsResolved += 1;
      }
      if (!dryRun) {
        await store.upsertInboundObject?.(actorHandle, rebuilt);
      }
    }

    const existingEngagements = store.getInboundEngagements?.(actorHandle) ?? [];
    let engagementsResolved = 0;
    const rebuiltEngagements = [];
    for (const engagement of existingEngagements) {
      const targetRecord = workingObjects.find((record) => record.objectId === engagement.objectId) ?? null;
      const rebuiltEngagement = {
        ...engagement,
        threadRootId: targetRecord?.threadRootId ?? engagement.objectId ?? null,
        threadResolved: Boolean(targetRecord),
      };
      if (engagement.threadResolved === false && rebuiltEngagement.threadResolved === true) {
        engagementsResolved += 1;
      }
      rebuiltEngagements.push(rebuiltEngagement);
      if (!dryRun) {
        await store.upsertInboundEngagement?.(actorHandle, rebuiltEngagement);
      }
    }

    const conversations = buildLocalConversationRecords({
      actorHandle,
      inboundObjects: workingObjects,
      inboundEngagements: rebuiltEngagements,
      generatedAt: clock().toISOString(),
    });
    const threadedContents = buildLocalContentRecords({
      actorHandle,
      inboundObjects: workingObjects,
      conversations,
      generatedAt: clock().toISOString(),
    });
    const outboundItems = store.getOutboundItems?.({ actorHandle }) ?? [];
    const authoredContents = buildLocalAuthoredContentRecords({
      config,
      actorHandle,
      inboundObjects: workingObjects,
      outboundItems,
      generatedAt: clock().toISOString(),
    });
    const contents = mergeLocalContentRecords({
      threadedContents,
      authoredContents,
    });
    const notificationEvents = buildLocalNotificationEventRecords({
      config,
      actorHandle,
      inboundObjects: workingObjects,
      inboundEngagements: rebuiltEngagements,
      contents,
      generatedAt: clock().toISOString(),
    });
    const notifications = buildGroupedNotificationRecords({
      actorHandle,
      notificationEvents,
      previousNotifications: store.getLocalNotifications?.(actorHandle) ?? [],
      generatedAt: clock().toISOString(),
    });
    const enrichedContents = mergeContentApplicationProjection({
      contents,
      notificationEvents,
      notifications,
      outboundItems,
    });
    if (!dryRun) {
      await store.replaceLocalConversations?.(actorHandle, conversations);
      await store.replaceLocalContents?.(actorHandle, enrichedContents);
      await store.replaceLocalNotifications?.(actorHandle, notifications);
    }

    return {
      actorHandle,
      dryRun,
      objectCount: workingObjects.length,
      conversationCount: conversations.length,
      contentCount: enrichedContents.length,
      notificationCount: notifications.length,
      mentionsBackfilled,
      objectsResolved,
      engagementsResolved,
    };
  }

  async function replayDeadLetterItem(itemId, replayRecord, { surface = "admin-dead-letter-replay" } = {}) {
    const deadLetter = store.getDeadLetter?.(itemId);
    if (!deadLetter) {
      return { error: "Unknown dead letter", statusCode: 404 };
    }

    const actorSuspension = deadLetter.actorHandle
      ? await enforceActorSuspensionIfNeeded(deadLetter.actorHandle, "dead-letter-replay")
      : null;
    if (actorSuspension) {
      return {
        error: "Local actor is suspended",
        statusCode: 403,
        payload: {
          actorHandle: deadLetter.actorHandle,
          reason: actorSuspension.reason,
        },
      };
    }

    const replayState = await store.replayDeadLetter?.(itemId, replayRecord);
    if (!replayState) {
      return { error: "Unable to replay dead letter", statusCode: 409 };
    }

    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "dead-letter.replayed",
      itemId,
      actorHandle: deadLetter.actorHandle,
      replayedBy: replayRecord.replayedBy,
      reason: replayRecord.reason,
      surface,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: "internal",
        event: "dead-letter.replay-requested",
        itemId,
        actorHandle: deadLetter.actorHandle,
        remoteActorId: deadLetter.targetActorId,
        surface,
      }),
    );
    await recordEvidence(
      buildEvidenceRecord({
        category: "manual-replay",
        actorHandle: deadLetter.actorHandle,
        remoteActorId: deadLetter.targetActorId,
        queueItemId: itemId,
        activityId: deadLetter.activityId,
        activityType: deadLetter.activityType,
        surface,
        reason: replayRecord.reason,
        snapshot: {
          deadLetter,
          replayRecord,
        },
      }),
    );

    const delivery = await deliveryProcessor.process(itemId);
    if (deadLetter.actorHandle) {
      await syncLocalDomainProjection(deadLetter.actorHandle);
    }

    return {
      deadLetter: store.getDeadLetter?.(itemId) ?? replayState.deadLetter,
      delivery,
      itemId,
      actorHandle: deadLetter.actorHandle,
      targetActorId: deadLetter.targetActorId,
      activityId: deadLetter.activityId,
    };
  }

  async function verifyInboundActivity(request, bodyText, activity, targetHandle) {
    const verification = await verifyInboundFollow({
      request,
      bodyText,
      activity,
      remoteActorDirectory,
    });

    await store.recordTrace(
      makeTrace(clock, {
        direction: "inbound",
        event:
          verification.remoteActor.source === "refreshed"
            ? "remote-actor.refreshed"
            : verification.remoteActor.source === "discovered"
              ? "remote-actor.discovered"
              : "remote-actor.resolved",
        actorHandle: targetHandle,
        activityId: activity.id ?? null,
        remoteActorId: verification.remoteActorId,
        source: verification.remoteActor.source,
      }),
    );

    return verification;
  }

  async function recordAuditEvent(event) {
    if (store.recordAuditEvent) {
      await store.recordAuditEvent(event);
    }
  }

  async function recordEvidence(evidenceRecord) {
    if (store.recordEvidence) {
      await store.recordEvidence(evidenceRecord);
    }
  }

  async function enforceDomainBlockIfNeeded({ activity, actorHandle }) {
    const remoteActorId = getActivityActorId(activity);
    const remoteDomain = getDomainFromUri(remoteActorId);
    const domainBlock = remoteDomain ? store.getDomainBlock?.(remoteDomain) : null;
    if (!domainBlock) {
      return null;
    }

    const abuseCase = {
      id: buildAbuseCaseId(clock()),
      status: "open",
      category: "domain-block",
      actorHandle,
      remoteActorId,
      remoteDomain,
      activityId: activity.id ?? null,
      activityType: activity.type ?? null,
      reason: domainBlock.reason,
      createdAt: clock().toISOString(),
    };
    await store.recordAbuseCase?.(abuseCase);
    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "domain-block.inbound-enforced",
      actorHandle,
      remoteActorId,
      remoteDomain,
      activityId: activity.id ?? null,
      reason: domainBlock.reason,
      abuseCaseId: abuseCase.id,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: "inbound",
        event: "domain-block.blocked",
        actorHandle,
        remoteActorId,
        activityId: activity.id ?? null,
        remoteDomain,
        reason: domainBlock.reason,
      }),
    );
    await recordEvidence(
      buildEvidenceRecord({
        category: "domain-block",
        actorHandle,
        remoteActorId,
        remoteDomain,
        activityId: activity.id ?? null,
        activityType: activity.type ?? null,
        abuseCaseId: abuseCase.id,
        surface: "inbound",
        reason: domainBlock.reason,
        snapshot: {
          activity,
          domainBlock,
          abuseCase,
        },
      }),
    );

    return {
      remoteDomain,
      domainBlock,
      abuseCase,
    };
  }

  async function enforceActorSuspensionIfNeeded(actorHandle, surface) {
    const suspension = store.getActorSuspension?.(actorHandle);
    if (!suspension) {
      return null;
    }

    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "actor-suspension.enforced",
      actorHandle,
      surface,
      reason: suspension.reason,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: "internal",
        event: "actor-suspension.blocked",
        actorHandle,
        surface,
        reason: suspension.reason,
      }),
    );

    return suspension;
  }

  async function enforceRemoteActorPolicyIfNeeded({ activity, actorHandle, surface }) {
    const remoteActorId = getActivityActorId(activity);
    if (!remoteActorId) {
      return null;
    }

    const remoteActorPolicy = store.getRemoteActorPolicy?.(remoteActorId);
    if (!remoteActorPolicy) {
      return null;
    }

    const action = surface.startsWith("outbound") ? remoteActorPolicy.outboundAction : remoteActorPolicy.inboundAction;
    if (!action || action === "allow") {
      return null;
    }

    const remoteDomain = getDomainFromUri(remoteActorId);
    const abuseCase = {
      id: buildAbuseCaseId(clock()),
      status: "open",
      category: "remote-actor-policy",
      actorHandle,
      remoteActorId,
      remoteDomain,
      activityId: activity.id ?? null,
      activityType: activity.type ?? null,
      reason: remoteActorPolicy.reason,
      createdAt: clock().toISOString(),
    };
    await store.recordAbuseCase?.(abuseCase);
    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "remote-actor-policy.enforced",
      actorHandle,
      remoteActorId,
      remoteDomain,
      activityId: activity.id ?? null,
      activityType: activity.type ?? null,
      surface,
      action,
      reason: remoteActorPolicy.reason,
      abuseCaseId: abuseCase.id,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: surface.startsWith("outbound") ? "outbound" : "inbound",
        event: `remote-actor-policy.${action}`,
        actorHandle,
        remoteActorId,
        activityId: activity.id ?? null,
        activityType: activity.type ?? null,
        surface,
      }),
    );
    await recordEvidence(
      buildEvidenceRecord({
        category: "remote-actor-policy",
        actorHandle,
        remoteActorId,
        remoteDomain,
        activityId: activity.id ?? null,
        activityType: activity.type ?? null,
        abuseCaseId: abuseCase.id,
        surface,
        reason: remoteActorPolicy.reason,
        snapshot: {
          action,
          policy: remoteActorPolicy,
          activity,
          abuseCase,
        },
      }),
    );

    return {
      action,
      policy: remoteActorPolicy,
      abuseCase,
      remoteActorId,
      remoteDomain,
    };
  }

  async function enforceTakedownIfNeeded(objectId, actorHandle, surface) {
    if (!objectId?.trim()) {
      return null;
    }

    const takedown = store.getActiveLegalTakedownByObjectId?.(objectId);
    if (!takedown) {
      return null;
    }

    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "legal-takedown.enforced",
      actorHandle,
      objectId,
      caseId: takedown.caseId,
      surface,
      reason: takedown.reason,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: "internal",
        event: "legal-takedown.blocked",
        actorHandle,
        objectId,
        caseId: takedown.caseId,
        surface,
      }),
    );

    return takedown;
  }

  async function enforceRateLimitIfNeeded({ policyKey, actorHandle = null, surface, remoteActorId = null }) {
    const policy = store.getRateLimitPolicy?.(policyKey);
    if (!policy || policy.enabled === false) {
      return null;
    }

    const counterKey = buildRateLimitCounterKey(policyKey, actorHandle);
    const evaluation = await store.evaluateRateLimit?.({
      policyKey,
      counterKey,
      limit: policy.limit,
      windowMs: policy.windowMs,
      now: clock().toISOString(),
    });
    if (!evaluation || evaluation.allowed) {
      return null;
    }

    const abuseCase =
      surface.startsWith("inbound")
        ? {
            id: buildAbuseCaseId(clock()),
            status: "open",
            category: "rate-limit",
            actorHandle,
            remoteActorId,
            activityId: null,
            activityType: surface,
            reason: `${policyKey} exceeded`,
            createdAt: clock().toISOString(),
          }
        : null;

    if (abuseCase) {
      await store.recordAbuseCase?.(abuseCase);
    }
    await recordAuditEvent({
      timestamp: clock().toISOString(),
      event: "rate-limit.enforced",
      policyKey,
      actorHandle,
      surface,
      remoteActorId,
      counterKey: evaluation.counterKey,
      retryAfterMs: evaluation.retryAfterMs,
      abuseCaseId: abuseCase?.id ?? null,
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: surface.startsWith("outbound") ? "outbound" : "inbound",
        event: "rate-limit.blocked",
        policyKey,
        actorHandle,
        surface,
        remoteActorId,
        counterKey: evaluation.counterKey,
        retryAfterMs: evaluation.retryAfterMs,
      }),
    );
    await recordEvidence(
      buildEvidenceRecord({
        category: "rate-limit",
        actorHandle,
        remoteActorId,
        activityType: surface,
        policyKey,
        abuseCaseId: abuseCase?.id ?? null,
        surface,
        reason: `${policyKey} exceeded`,
        snapshot: {
          evaluation,
          policy,
          abuseCase,
        },
      }),
    );

    return {
      ...evaluation,
      abuseCase,
    };
  }

  async function enforceOutboundActorControls(handle, surface) {
    const actorSuspension = await enforceActorSuspensionIfNeeded(handle, surface);
    if (actorSuspension) {
      return jsonResponse({ error: "Local actor is suspended", actorHandle: handle, reason: actorSuspension.reason }, 403);
    }

    const outboundRateLimit = await enforceRateLimitIfNeeded({
      policyKey: "actor-outbound",
      actorHandle: handle,
      surface: "outbound-actor",
    });
    if (outboundRateLimit) {
      return jsonResponse(
        {
          error: "Actor outbound rate limit exceeded",
          actorHandle: handle,
          policyKey: outboundRateLimit.policyKey,
          retryAfterMs: outboundRateLimit.retryAfterMs,
        },
        429,
      );
    }

    return null;
  }

  async function handleInbox(request, routeHandle = null) {
    const bodyText = await request.text();
    let activity;

    try {
      activity = parseJsonBody(bodyText);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const targetHandle = routeHandle ?? getFollowTargetHandle(config, activity);
    if (!targetHandle || !config.actors[targetHandle]) {
      return jsonResponse({ error: "Unknown local actor" }, 404);
    }
    store.ensureActor(targetHandle);

    const actorSuspension = await enforceActorSuspensionIfNeeded(targetHandle, "inbox");
    if (actorSuspension) {
      return jsonResponse(
        {
          error: "Local actor is suspended",
          actorHandle: targetHandle,
          reason: actorSuspension.reason,
        },
        403,
      );
    }

    const remoteActorId = getActivityActorId(activity);
    const instanceRateLimit = await enforceRateLimitIfNeeded({
      policyKey: "instance-inbound",
      actorHandle: null,
      surface: "inbound-instance",
      remoteActorId,
    });
    if (instanceRateLimit) {
      return jsonResponse(
        {
          error: "Inbound rate limit exceeded",
          policyKey: instanceRateLimit.policyKey,
          retryAfterMs: instanceRateLimit.retryAfterMs,
          abuseCaseId: instanceRateLimit.abuseCase?.id ?? null,
        },
        429,
      );
    }

    const actorRateLimit = await enforceRateLimitIfNeeded({
      policyKey: "actor-inbound",
      actorHandle: targetHandle,
      surface: "inbound-actor",
      remoteActorId,
    });
    if (actorRateLimit) {
      return jsonResponse(
        {
          error: "Actor inbound rate limit exceeded",
          actorHandle: targetHandle,
          policyKey: actorRateLimit.policyKey,
          retryAfterMs: actorRateLimit.retryAfterMs,
          abuseCaseId: actorRateLimit.abuseCase?.id ?? null,
        },
        429,
      );
    }

    await store.recordTrace(
      makeTrace(clock, {
        direction: "inbound",
        event: "inbox.received",
        actorHandle: targetHandle,
        activityType: activity.type,
        activityId: activity.id ?? null,
      }),
    );

    const domainBlockMatch = await enforceDomainBlockIfNeeded({
      activity,
      actorHandle: targetHandle,
    });
    if (domainBlockMatch) {
      return jsonResponse(
        {
          error: "Remote domain is blocked",
          domain: domainBlockMatch.remoteDomain,
          reason: domainBlockMatch.domainBlock.reason,
          abuseCaseId: domainBlockMatch.abuseCase.id,
        },
        403,
      );
    }

    const remoteActorPolicyMatch = await enforceRemoteActorPolicyIfNeeded({
      activity,
      actorHandle: targetHandle,
      surface: "inbound",
    });
    if (remoteActorPolicyMatch) {
      if (remoteActorPolicyMatch.action === "review") {
        await store.recordProcessed(activity.id, {
          handledAt: clock().toISOString(),
          localActor: config.actors[targetHandle].actorUrl,
          disposition: "queued-review",
          abuseCaseId: remoteActorPolicyMatch.abuseCase.id,
        });

        return jsonResponse(
          {
            status: "queued-review",
            activityId: activity.id ?? null,
            abuseCaseId: remoteActorPolicyMatch.abuseCase.id,
            remoteActorId: remoteActorPolicyMatch.remoteActorId,
          },
          202,
        );
      }

      return jsonResponse(
        {
          error: "Remote actor is denied by policy",
          remoteActorId: remoteActorPolicyMatch.remoteActorId,
          reason: remoteActorPolicyMatch.policy.reason,
          abuseCaseId: remoteActorPolicyMatch.abuseCase.id,
        },
        403,
      );
    }

    if (activity.type !== "Follow") {
      if (!["Create", "Like", "Announce", "Undo"].includes(activity.type)) {
        return jsonResponse(
          { status: "ignored", reason: "Only Follow, Create, Like, Announce, and Undo are supported in the current slice" },
          202,
        );
      }
    }

    let verification;
    try {
      verification = await verifyInboundActivity(request, bodyText, activity, targetHandle);
    } catch (error) {
      await store.recordTrace(
        makeTrace(clock, {
          direction: "inbound",
          event: "signature.rejected",
          actorHandle: targetHandle,
          activityId: activity.id ?? null,
          reason: error.message,
        }),
      );
      return jsonResponse({ error: error.message }, 401);
    }

    if (store.hasProcessed(activity.id)) {
      return jsonResponse({ status: "duplicate", activityId: activity.id }, 202);
    }

    if (activity.type === "Create") {
      const object = activity.object;
      if (!object || typeof object !== "object" || Array.isArray(object)) {
        return jsonResponse({ error: "Create.object must be an object" }, 422);
      }

      if (!isPublicCreate(activity, object)) {
        await store.recordTrace(
          makeTrace(clock, {
            direction: "inbound",
            event: "create.ignored",
            actorHandle: targetHandle,
            activityId: activity.id ?? null,
            remoteActorId: verification.remoteActorId,
            reason: "non-public create is out of scope",
          }),
        );
        await store.recordProcessed(activity.id, {
          handledAt: clock().toISOString(),
          localActor: config.actors[targetHandle].actorUrl,
          disposition: "ignored",
          reason: "non-public create is out of scope",
        });

        return jsonResponse(
          { status: "ignored", activityId: activity.id ?? null, reason: "Only public Create is supported" },
          202,
        );
      }

      const inboundRecord = buildInboundObjectRecord({
        config,
        store,
        activity,
        object,
        remoteActorId: verification.remoteActorId,
        actorHandle: targetHandle,
        clock,
      });

      await store.upsertInboundObject(targetHandle, inboundRecord);
      await syncLocalDomainProjection(targetHandle);
      await store.recordProcessed(activity.id, {
        handledAt: clock().toISOString(),
        localActor: config.actors[targetHandle].actorUrl,
        resultObjectId: inboundRecord.objectId,
        disposition: inboundRecord.mapping,
      });
      await store.recordTrace(
        makeTrace(clock, {
          direction: "inbound",
          event: inboundRecord.mapping === "reply" ? "reply.stored" : "create.stored",
          actorHandle: targetHandle,
          activityId: activity.id ?? null,
          remoteActorId: verification.remoteActorId,
          objectId: inboundRecord.objectId,
          inReplyTo: inboundRecord.inReplyTo,
        }),
      );

      return jsonResponse(
        {
          status: "stored",
          activityId: activity.id ?? null,
          objectId: inboundRecord.objectId,
          mapping: inboundRecord.mapping,
        },
        202,
      );
    }

    if (activity.type === "Like" || activity.type === "Announce") {
      const objectId = getObjectReferenceId(activity.object);
      if (!objectId) {
        return jsonResponse({ error: `${activity.type}.object must be a URL or object with id` }, 422);
      }

      const takedown = await enforceTakedownIfNeeded(objectId, targetHandle, `inbound-${activity.type.toLowerCase()}`);
      if (takedown) {
        return jsonResponse(
          {
            error: "Object is under legal takedown",
            caseId: takedown.caseId,
            objectId,
          },
          451,
        );
      }

      const engagementRecord = buildInboundEngagementRecord({
        activity,
        remoteActorId: verification.remoteActorId,
        actorHandle: targetHandle,
        clock,
        threadRootId: store.getInboundObject?.(targetHandle, objectId)?.threadRootId ?? objectId,
        threadResolved: Boolean(store.getInboundObject?.(targetHandle, objectId)),
      });

      await store.upsertInboundEngagement(targetHandle, engagementRecord);
      await syncLocalDomainProjection(targetHandle);
      await store.recordProcessed(activity.id, {
        handledAt: clock().toISOString(),
        localActor: config.actors[targetHandle].actorUrl,
        resultObjectId: engagementRecord.objectId,
        disposition: engagementRecord.mapping,
      });
      await store.recordTrace(
        makeTrace(clock, {
          direction: "inbound",
          event: `${engagementRecord.mapping}.stored`,
          actorHandle: targetHandle,
          activityId: engagementRecord.activityId,
          remoteActorId: verification.remoteActorId,
          objectId: engagementRecord.objectId,
        }),
      );

      return jsonResponse(
        {
          status: "stored",
          activityId: engagementRecord.activityId,
          objectId: engagementRecord.objectId,
          mapping: engagementRecord.mapping,
        },
        202,
      );
    }

    if (activity.type === "Undo") {
      const undoTargetId = getObjectReferenceId(activity.object);
      if (!undoTargetId) {
        return jsonResponse({ error: "Undo.object must be a URL or object with id" }, 422);
      }

      const undoType = typeof activity.object === "object" && activity.object !== null ? activity.object.type : null;
      if (undoType === "Follow") {
        const follower = store.getFollower(targetHandle, verification.remoteActorId);
        if (!follower || follower.lastActivityId !== undoTargetId) {
          return jsonResponse({ status: "ignored", reason: "Undo target is not a known accepted follow" }, 202);
        }

        await store.removeFollower(targetHandle, verification.remoteActorId);
        await store.recordProcessed(activity.id, {
          handledAt: clock().toISOString(),
          localActor: config.actors[targetHandle].actorUrl,
          disposition: "undo-follow",
          undoneActivityId: undoTargetId,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "inbound",
            event: "follow.undone",
            actorHandle: targetHandle,
            activityId: activity.id ?? null,
            remoteActorId: verification.remoteActorId,
            undoneActivityId: undoTargetId,
          }),
        );

        return jsonResponse({ status: "undone", activityId: activity.id ?? null, mapping: "follow" }, 202);
      }

      if (undoType === "Like" || undoType === "Announce") {
        const engagement = store.getInboundEngagement(targetHandle, undoTargetId);
        if (!engagement || engagement.remoteActorId !== verification.remoteActorId) {
          return jsonResponse({ status: "ignored", reason: "Undo target is not a known inbound engagement" }, 202);
        }

        await store.removeInboundEngagement(targetHandle, undoTargetId);
        await syncLocalDomainProjection(targetHandle);
        await store.recordProcessed(activity.id, {
          handledAt: clock().toISOString(),
          localActor: config.actors[targetHandle].actorUrl,
          disposition: `undo-${engagement.mapping}`,
          undoneActivityId: undoTargetId,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "inbound",
            event: `${engagement.mapping}.undone`,
            actorHandle: targetHandle,
            activityId: activity.id ?? null,
            remoteActorId: verification.remoteActorId,
            undoneActivityId: undoTargetId,
          }),
        );

        return jsonResponse({ status: "undone", activityId: activity.id ?? null, mapping: engagement.mapping }, 202);
      }

      return jsonResponse({ status: "ignored", reason: "Undo target type is out of scope" }, 202);
    }

    const localActor = config.actors[targetHandle];
    const followTargetUrl = typeof activity.object === "string" ? activity.object : null;

    if (followTargetUrl !== localActor.actorUrl) {
      return jsonResponse({ error: "Follow target does not match local actor" }, 422);
    }

    const shouldAccept = localActor.autoAcceptFollows !== false;
    if (shouldAccept) {
      await store.upsertFollower(targetHandle, {
        remoteActorId: verification.remoteActorId,
        inbox: verification.remoteActor.inbox,
        sharedInbox: verification.remoteActor.sharedInbox ?? null,
        status: "accepted",
        followedAt: clock().toISOString(),
        lastActivityId: activity.id ?? null,
      });
    }

    const responseActivity = shouldAccept
      ? buildAcceptActivity({
          actor: localActor,
          follow: activity,
          now: clock(),
          instance: config.instance,
        })
      : buildRejectActivity({
          actor: localActor,
          follow: activity,
          now: clock(),
          instance: config.instance,
        });

    const queueItem = await store.enqueueOutbound({
      id: responseActivity.id,
      status: "pending",
      attempts: 0,
      actorHandle: targetHandle,
      targetActorId: verification.remoteActorId,
      targetInbox: verification.remoteActor.sharedInbox ?? verification.remoteActor.inbox,
      activity: responseActivity,
      createdAt: clock().toISOString(),
    });

    const outboundResult = await deliveryProcessor.process(queueItem.id);

    await store.recordProcessed(activity.id, {
      handledAt: clock().toISOString(),
      localActor: localActor.actorUrl,
      resultActivityId: responseActivity.id,
      disposition: shouldAccept ? "accepted" : "rejected",
    });
    await store.recordTrace(
      makeTrace(clock, {
        direction: "inbound",
        event: shouldAccept ? "follow.accepted" : "follow.rejected",
        actorHandle: targetHandle,
        activityId: activity.id ?? null,
        remoteActorId: verification.remoteActorId,
        keyId: verification.verification.keyId,
        outboundStatus: outboundResult?.status ?? "pending",
      }),
    );

    return jsonResponse(
      {
        status: shouldAccept ? "accepted" : "rejected",
        activityId: activity.id ?? null,
        responseActivityId: responseActivity.id,
        deliveryStatus: outboundResult?.status ?? "pending",
      },
      202,
    );
  }

  return {
    async handle(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const handle = extractHandle(pathname);
      const actor = handle ? config.actors[handle] : null;

      if (request.method === "GET" && pathname === "/.well-known/webfinger") {
        const resource = url.searchParams.get("resource") ?? "";
        const expectedPrefix = "acct:";
        if (!resource.startsWith(expectedPrefix)) {
          return jsonResponse({ error: "resource must be an acct URI" }, 400);
        }

        const [subjectHandle, subjectDomain] = resource.slice(expectedPrefix.length).split("@");
        const actorForResource = config.actors[subjectHandle];
        if (!actorForResource || subjectDomain !== config.instance.domain) {
          return jsonResponse({ error: "Unknown actor" }, 404);
        }

        return jsonResponse(buildWebFinger({ instance: config.instance, actor: actorForResource }), 200, "application/jrd+json");
      }

      if (request.method === "GET" && pathname === "/.well-known/host-meta") {
        return textResponse(buildHostMeta({ instance: config.instance }), 200, "application/xrd+xml");
      }

      if (request.method === "GET" && pathname === "/.well-known/nodeinfo") {
        return jsonResponse(buildNodeInfoDirectory({ instance: config.instance }));
      }

      if (request.method === "GET" && pathname === "/nodeinfo/2.1") {
        return jsonResponse(buildNodeInfo({ instance: config.instance, actors: config.actors }));
      }

      if (request.method === "GET" && handle && pathname === `/users/${handle}` && actor) {
        return activityResponse(buildActorDocument({ instance: config.instance, actor }));
      }

      if (request.method === "GET" && handle && pathname === `/users/${handle}/outbox` && actor) {
        const outbox = await effectiveOutboxBridge.getOutbox(actor);
        return activityResponse(outbox);
      }

      if (request.method === "GET" && handle && pathname === `/users/${handle}/followers` && actor) {
        const followers = store.getFollowers(handle).map((entry) => entry.remoteActorId);
        return activityResponse(buildOrderedCollection({ id: actor.followersUrl, items: followers }));
      }

      if (request.method === "GET" && handle && pathname === `/users/${handle}/following` && actor) {
        return activityResponse(buildOrderedCollection({ id: actor.followingUrl, items: [] }));
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/inbox` && actor) {
        return handleInbox(request, handle);
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/update` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-update");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.object || typeof payload.object !== "object" || Array.isArray(payload.object)) {
          return jsonResponse({ error: "object is required" }, 422);
        }

        if (typeof payload.object.id !== "string" || !payload.object.id.trim()) {
          return jsonResponse({ error: "object.id is required" }, 422);
        }

        const takedown = await enforceTakedownIfNeeded(payload.object.id, handle, "outbox-update");
        if (takedown) {
          return jsonResponse({ error: "Object is under legal takedown", caseId: takedown.caseId, objectId: payload.object.id }, 451);
        }

        const activity = buildUpdateActivity({
          actor,
          object: payload.object,
          now: clock(),
          instance: config.instance,
        });
        const followers = await buildFanOutRecipients({
          actorHandle: handle,
        });
        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: followers,
          activity,
          traceEvent: "update.fanned-out",
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: "update",
            recipients: followers.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/create` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-create");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.object || typeof payload.object !== "object" || Array.isArray(payload.object)) {
          return jsonResponse({ error: "object is required" }, 422);
        }
        if (typeof payload.object.id !== "string" || !payload.object.id.trim()) {
          return jsonResponse({ error: "object.id is required" }, 422);
        }

        const initialMentionEntries = mergeMentionEntries(
          normalizeMentionEntries(config, payload.mentions),
          extractMentionEntriesFromTags(config, payload.object.tag),
          extractMentionEntriesFromContent(config, payload.object.content ?? ""),
        );
        let mentionResolution;
        try {
          mentionResolution = await resolveRemoteMentionEntries({
            actorHandle: handle,
            surface: "outbox-create",
            objectId: payload.object.id,
            mentionEntries: initialMentionEntries,
            accountCandidates: dedupeValues([
              ...collectMentionAccountCandidates(payload.mentions),
              ...extractMentionAccountCandidatesFromTags(payload.object.tag),
              ...extractMentionAccountCandidatesFromContent(payload.object.content ?? ""),
            ]),
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        const normalizedMentionEntries = mentionResolution.resolvedEntries;
        const mentionResolutionSummary = buildMentionResolutionResponse(mentionResolution.resolutionResults);
        const mentionEntries = normalizedMentionEntries.map((entry) => entry.actorId);
        const explicitActorIds = dedupeValues([
          ...normalizeActorIdList(payload.targetActorIds),
          ...mentionEntries,
          payload.replyToActorId?.trim() || null,
        ]);
        const object = {
          ...payload.object,
          attributedTo: actor.actorUrl,
          tag: [
            ...(Array.isArray(payload.object.tag) ? payload.object.tag.filter((entry) => entry?.type !== "Mention") : []),
            ...normalizedMentionEntries.map((entry) => buildMentionTag(entry)),
            ...mentionResolutionSummary.skipped.map((entry) => buildUnresolvedMentionTag(entry.account)),
          ],
        };
        const audience = buildOutboundAudience({
          actor,
          explicitActorIds,
          object,
          includeFollowers: payload.includeFollowers !== false,
        });
        object.to = audience.to;
        object.cc = audience.cc;

        const activity = buildCreateActivity({
          actor,
          object,
          now: clock(),
          instance: config.instance,
          mentionTags: normalizedMentionEntries.map((entry) => buildMentionTag(entry)),
          to: audience.to,
          cc: audience.cc,
        });
        let recipients;
        try {
          recipients = await buildFanOutRecipients({
            actorHandle: handle,
            explicitActorIds,
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        if (recipients.length === 0) {
          return jsonResponse(
            {
              error: "At least one recipient is required",
              mentionResolution: mentionResolutionSummary,
            },
            422,
          );
        }
        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: recipients,
          activity,
          traceEvent: object.inReplyTo ? "reply.fanned-out" : "create.fanned-out",
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: object.inReplyTo ? "reply" : "create",
            mentions: mentionEntries,
            mentionResolution: mentionResolutionSummary,
            recipients: recipients.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/like` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-like");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const objectId = payload.objectId?.trim();
        if (!objectId) {
          return jsonResponse({ error: "objectId is required" }, 422);
        }

        const takedown = await enforceTakedownIfNeeded(objectId, handle, "outbox-like");
        if (takedown) {
          return jsonResponse({ error: "Object is under legal takedown", caseId: takedown.caseId, objectId }, 451);
        }

        let mentionResolution;
        try {
          mentionResolution = await resolveRemoteMentionEntries({
            actorHandle: handle,
            surface: "outbox-like",
            objectId,
            mentionEntries: normalizeMentionEntries(config, payload.mentions),
            accountCandidates: collectMentionAccountCandidates(payload.mentions),
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        const resolvedMentionEntries = mentionResolution.resolvedEntries;
        const mentionResolutionSummary = buildMentionResolutionResponse(mentionResolution.resolutionResults);
        const explicitActorIds = dedupeValues([
          payload.targetActorId?.trim() || null,
          ...resolvedMentionEntries.map((entry) => entry.actorId),
        ]);
        const activity = buildLikeActivity({
          actor,
          objectId,
          now: clock(),
          instance: config.instance,
          to: explicitActorIds,
        });
        let recipients;
        try {
          recipients = await buildFanOutRecipients({
            actorHandle: handle,
            explicitActorIds,
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        if (recipients.length === 0) {
          return jsonResponse(
            {
              error: "At least one recipient is required",
              mentionResolution: mentionResolutionSummary,
            },
            422,
          );
        }
        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: recipients,
          activity,
          traceEvent: "like.fanned-out",
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: "like",
            mentionResolution: mentionResolutionSummary,
            recipients: recipients.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/announce` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-announce");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const objectId = payload.objectId?.trim();
        if (!objectId) {
          return jsonResponse({ error: "objectId is required" }, 422);
        }

        const takedown = await enforceTakedownIfNeeded(objectId, handle, "outbox-announce");
        if (takedown) {
          return jsonResponse({ error: "Object is under legal takedown", caseId: takedown.caseId, objectId }, 451);
        }

        let mentionResolution;
        try {
          mentionResolution = await resolveRemoteMentionEntries({
            actorHandle: handle,
            surface: "outbox-announce",
            objectId,
            mentionEntries: normalizeMentionEntries(config, payload.mentions),
            accountCandidates: collectMentionAccountCandidates(payload.mentions),
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        const resolvedMentionEntries = mentionResolution.resolvedEntries;
        const mentionResolutionSummary = buildMentionResolutionResponse(mentionResolution.resolutionResults);
        const explicitActorIds = dedupeValues([
          payload.targetActorId?.trim() || null,
          ...resolvedMentionEntries.map((entry) => entry.actorId),
        ]);
        const audience = buildOutboundAudience({
          actor,
          explicitActorIds,
        });
        const activity = buildAnnounceActivity({
          actor,
          objectId,
          now: clock(),
          instance: config.instance,
          to: audience.to,
          cc: audience.cc,
        });
        let recipients;
        try {
          recipients = await buildFanOutRecipients({
            actorHandle: handle,
            explicitActorIds,
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        if (recipients.length === 0) {
          return jsonResponse(
            {
              error: "At least one recipient is required",
              mentionResolution: mentionResolutionSummary,
            },
            422,
          );
        }
        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: recipients,
          activity,
          traceEvent: "announce.fanned-out",
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: "announce",
            mentionResolution: mentionResolutionSummary,
            recipients: recipients.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/engagement` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-engagement");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const engagementType = payload.type?.trim();
        if (!["Like", "Announce"].includes(engagementType)) {
          return jsonResponse({ error: "type must be Like or Announce" }, 422);
        }

        const objectId = payload.objectId?.trim();
        if (!objectId) {
          return jsonResponse({ error: "objectId is required" }, 422);
        }

        const takedown = await enforceTakedownIfNeeded(objectId, handle, `outbox-${engagementType.toLowerCase()}`);
        if (takedown) {
          return jsonResponse({ error: "Object is under legal takedown", caseId: takedown.caseId, objectId }, 451);
        }

        let mentionResolution;
        try {
          mentionResolution = await resolveRemoteMentionEntries({
            actorHandle: handle,
            surface: "outbox-engagement",
            objectId,
            mentionEntries: normalizeMentionEntries(config, payload.mentions),
            accountCandidates: collectMentionAccountCandidates(payload.mentions),
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        const resolvedMentionEntries = mentionResolution.resolvedEntries;
        const mentionResolutionSummary = buildMentionResolutionResponse(mentionResolution.resolutionResults);
        const explicitActorIds = dedupeValues([
          ...normalizeActorIdList(payload.targetActorIds),
          payload.targetActorId?.trim() || null,
          ...resolvedMentionEntries.map((entry) => entry.actorId),
        ]);
        const activity =
          engagementType === "Like"
            ? buildLikeActivity({
                actor,
                objectId,
                now: clock(),
                instance: config.instance,
                to: explicitActorIds,
              })
            : buildAnnounceActivity({
                actor,
                objectId,
                now: clock(),
                instance: config.instance,
                to: [PUBLIC_AUDIENCE],
                cc: buildOutboundAudience({
                  actor,
                  explicitActorIds,
                }).cc,
              });

        let recipients;
        try {
          recipients = await buildFanOutRecipients({
            actorHandle: handle,
            explicitActorIds,
          });
        } catch (error) {
          return jsonResponse({ error: error.message }, 422);
        }
        if (recipients.length === 0) {
          return jsonResponse(
            {
              error: "At least one recipient is required",
              mentionResolution: mentionResolutionSummary,
            },
            422,
          );
        }

        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: recipients,
          activity,
          traceEvent: `${engagementType.toLowerCase()}.fanned-out`,
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: engagementType.toLowerCase(),
            mentionResolution: mentionResolutionSummary,
            recipients: recipients.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "POST" && handle && pathname === `/users/${handle}/outbox/delete` && actor) {
        const outboundGuard = await enforceOutboundActorControls(handle, "outbox-delete");
        if (outboundGuard) {
          return outboundGuard;
        }

        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (typeof payload.objectId !== "string" || !payload.objectId.trim()) {
          return jsonResponse({ error: "objectId is required" }, 422);
        }

        const activity = buildDeleteActivity({
          actor,
          objectId: payload.objectId,
          now: clock(),
          instance: config.instance,
        });
        const followers = await buildFanOutRecipients({
          actorHandle: handle,
        });
        const deliveries = await fanOutActivity({
          actorHandle: handle,
          remoteActors: followers,
          activity,
          traceEvent: "delete.fanned-out",
        });

        return jsonResponse(
          {
            status: "queued",
            activityId: activity.id,
            mapping: "delete",
            recipients: followers.map((entry) => entry.remoteActorId),
            deliveries: deliveries.map((entry) => ({
              id: entry.id,
              status: entry.status,
              targetActorId: entry.targetActorId,
            })),
          },
          202,
        );
      }

      if (request.method === "GET" && pathname === "/admin/domain-blocks") {
        return jsonResponse({
          items: store.getDomainBlocks?.() ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/actor-suspensions") {
        return jsonResponse({
          items: store.getActorSuspensions?.() ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/remote-actor-policies") {
        return jsonResponse({
          items: store.getRemoteActorPolicies?.() ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/rate-limits") {
        return jsonResponse({
          items: store.getRateLimitPolicies?.() ?? [],
        });
      }

      if (request.method === "POST" && pathname === "/admin/rate-limits") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const policyKey = payload.policyKey?.trim();
        if (!policyKey) {
          return jsonResponse({ error: "policyKey is required" }, 422);
        }
        if (!Number.isFinite(payload.limit) || payload.limit <= 0) {
          return jsonResponse({ error: "positive numeric limit is required" }, 422);
        }
        if (!Number.isFinite(payload.windowMs) || payload.windowMs <= 0) {
          return jsonResponse({ error: "positive numeric windowMs is required" }, 422);
        }

        const policyRecord = {
          policyKey,
          limit: payload.limit,
          windowMs: payload.windowMs,
          enabled: payload.enabled !== false,
          source: payload.source?.trim() || "admin",
          scope: payload.scope?.trim() || policyKey,
          createdAt: clock().toISOString(),
          createdBy: payload.createdBy?.trim() || "system",
        };
        await store.upsertRateLimitPolicy?.(policyRecord);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "rate-limit.created",
          policyKey,
          limit: policyRecord.limit,
          windowMs: policyRecord.windowMs,
          createdBy: policyRecord.createdBy,
        });

        return jsonResponse({ status: "stored", item: policyRecord }, 201);
      }

      if (request.method === "GET" && pathname === "/admin/rate-limit-state") {
        return jsonResponse({
          items: store.getRateLimitCounters?.() ?? [],
        });
      }

      if (request.method === "POST" && pathname === "/admin/actor-suspensions") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandle = payload.actorHandle?.trim();
        if (!actorHandle || !config.actors[actorHandle]) {
          return jsonResponse({ error: "Known actorHandle is required" }, 422);
        }

        const suspensionRecord = {
          actorHandle,
          reason: payload.reason?.trim() || "manual suspension",
          source: payload.source?.trim() || "admin",
          suspendedAt: clock().toISOString(),
          createdBy: payload.createdBy?.trim() || "system",
        };
        await store.upsertActorSuspension?.(suspensionRecord);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "actor-suspension.created",
          actorHandle,
          reason: suspensionRecord.reason,
          createdBy: suspensionRecord.createdBy,
        });

        return jsonResponse({ status: "stored", item: suspensionRecord }, 201);
      }

      if (request.method === "POST" && pathname === "/admin/remote-actor-policies") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorId = payload.actorId?.trim();
        if (!actorId) {
          return jsonResponse({ error: "actorId is required" }, 422);
        }

        const inboundAction = payload.inboundAction?.trim() || "allow";
        const outboundAction = payload.outboundAction?.trim() || "allow";
        if (!["allow", "deny", "review"].includes(inboundAction)) {
          return jsonResponse({ error: "inboundAction must be allow, deny, or review" }, 422);
        }
        if (!["allow", "deny"].includes(outboundAction)) {
          return jsonResponse({ error: "outboundAction must be allow or deny" }, 422);
        }

        const policyRecord = {
          actorId,
          inboundAction,
          outboundAction,
          reason: payload.reason?.trim() || "manual remote actor policy",
          source: payload.source?.trim() || "admin",
          createdAt: clock().toISOString(),
          createdBy: payload.createdBy?.trim() || "system",
        };
        await store.upsertRemoteActorPolicy?.(policyRecord);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "remote-actor-policy.created",
          actorId,
          inboundAction,
          outboundAction,
          createdBy: policyRecord.createdBy,
        });

        return jsonResponse({ status: "stored", item: policyRecord }, 201);
      }

      if (request.method === "POST" && pathname === "/admin/domain-blocks") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const domain = payload.domain?.trim()?.toLowerCase();
        if (!domain) {
          return jsonResponse({ error: "domain is required" }, 422);
        }

        const blockRecord = {
          domain,
          reason: payload.reason?.trim() || "manual block",
          source: payload.source?.trim() || "admin",
          blockedAt: clock().toISOString(),
          createdBy: payload.createdBy?.trim() || "system",
        };
        await store.upsertDomainBlock?.(blockRecord);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "domain-block.created",
          domain,
          reason: blockRecord.reason,
          createdBy: blockRecord.createdBy,
        });

        return jsonResponse({ status: "stored", item: blockRecord }, 201);
      }

      if (request.method === "GET" && pathname === "/admin/abuse-queue") {
        const status = url.searchParams.get("status");
        return jsonResponse({
          items: store.getAbuseQueue?.(status || null) ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/legal-takedowns") {
        const status = url.searchParams.get("status");
        return jsonResponse({
          items: store.getLegalTakedowns?.(status || null) ?? [],
        });
      }

      if (request.method === "POST" && pathname === "/admin/legal-takedowns") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandle = payload.actorHandle?.trim();
        const objectId = payload.objectId?.trim();
        if (!actorHandle || !config.actors[actorHandle]) {
          return jsonResponse({ error: "Known actorHandle is required" }, 422);
        }
        if (!objectId) {
          return jsonResponse({ error: "objectId is required" }, 422);
        }

        const caseId = payload.caseId?.trim() || buildLegalCaseId(clock());
        const takedownRecord = {
          caseId,
          actorHandle,
          objectId,
          status: "open",
          reason: payload.reason?.trim() || "legal takedown",
          source: payload.source?.trim() || "legal",
          createdBy: payload.createdBy?.trim() || "system",
          createdAt: clock().toISOString(),
        };
        await store.upsertLegalTakedown?.(takedownRecord);

        const followers = store
          .getFollowers(actorHandle)
          .filter((entry) => entry.status === "accepted" && (entry.sharedInbox ?? entry.inbox));
        const deleteActivity = buildDeleteActivity({
          actor: config.actors[actorHandle],
          objectId,
          now: clock(),
          instance: config.instance,
        });
        const deliveries = await fanOutActivity({
          actorHandle,
          remoteActors: followers,
          activity: deleteActivity,
          traceEvent: "legal-takedown.delete-fanned-out",
        });

        takedownRecord.propagation = {
          activityId: deleteActivity.id,
          deliveries: deliveries.map((entry) => ({
            id: entry.id,
            status: entry.status,
            targetActorId: entry.targetActorId,
          })),
        };
        await store.upsertLegalTakedown?.(takedownRecord);
        await recordEvidence(
          buildEvidenceRecord({
            category: "legal-takedown",
            actorHandle,
            objectId,
            caseId,
            surface: "admin-legal-takedown",
            reason: takedownRecord.reason,
            snapshot: {
              takedown: takedownRecord,
              propagation: takedownRecord.propagation,
            },
          }),
        );
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "legal-takedown.created",
          caseId,
          actorHandle,
          objectId,
          reason: takedownRecord.reason,
          createdBy: takedownRecord.createdBy,
        });

        return jsonResponse({ status: "stored", item: takedownRecord }, 201);
      }

      if (request.method === "POST" && pathname === "/admin/abuse-queue/resolve") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.id?.trim()) {
          return jsonResponse({ error: "id is required" }, 422);
        }

        const abuseCase = await store.resolveAbuseCase?.(payload.id, {
          resolution: payload.resolution?.trim() || "reviewed",
          resolvedBy: payload.resolvedBy?.trim() || "system",
          resolvedAt: clock().toISOString(),
        });
        if (!abuseCase) {
          return jsonResponse({ error: "Unknown abuse case" }, 404);
        }

        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "abuse-case.resolved",
          abuseCaseId: abuseCase.id,
          resolvedBy: abuseCase.resolution.resolvedBy,
          resolution: abuseCase.resolution.resolution,
        });

        return jsonResponse({ status: "resolved", item: abuseCase });
      }

      if (request.method === "POST" && pathname === "/admin/legal-takedowns/resolve") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.caseId?.trim()) {
          return jsonResponse({ error: "caseId is required" }, 422);
        }

        const takedown = store.getLegalTakedown?.(payload.caseId);
        if (!takedown) {
          return jsonResponse({ error: "Unknown legal takedown" }, 404);
        }

        takedown.status = "resolved";
        takedown.resolution = {
          resolution: payload.resolution?.trim() || "closed",
          resolvedBy: payload.resolvedBy?.trim() || "system",
          resolvedAt: clock().toISOString(),
        };
        await store.upsertLegalTakedown?.(takedown);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "legal-takedown.resolved",
          caseId: takedown.caseId,
          resolvedBy: takedown.resolution.resolvedBy,
          resolution: takedown.resolution.resolution,
        });

        return jsonResponse({ status: "resolved", item: takedown });
      }

      if (request.method === "GET" && pathname === "/admin/audit-log") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
        return jsonResponse({
          items: store.getAuditLog?.(Number.isNaN(limit) ? 50 : limit) ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/visibility-audit") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
        const normalizedLimit = Math.min(Math.max(Number.isNaN(limit) ? 50 : limit, 1), 500);
        const actorHandle = url.searchParams.get("actorHandle") || null;
        const decision = url.searchParams.get("decision") || null;
        const traces = store.getTraces?.({ limit: normalizedLimit, eventPrefix: "visibility." }) ?? [];
        const items = traces
          .filter((entry) => !actorHandle || entry.actorHandle === actorHandle)
          .filter((entry) => !decision || entry.decision === decision)
          .map((entry) => ({
            timestamp: entry.timestamp ?? null,
            event: entry.event,
            source: entry.source ?? null,
            actorHandle: entry.actorHandle ?? null,
            actorUrl: entry.actorUrl ?? null,
            decision: entry.decision ?? null,
            reason: entry.reason ?? null,
            visibility: entry.visibility ?? null,
            activityId: entry.activityId ?? null,
            objectId: entry.objectId ?? null,
            objectType: entry.objectType ?? null,
          }));

        return jsonResponse({ items });
      }

      if (request.method === "GET" && pathname === "/admin/evidence") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
        return jsonResponse({
          items:
            store.getEvidenceRecords?.({
              category: url.searchParams.get("category") || null,
              actorHandle: url.searchParams.get("actorHandle") || null,
              status: url.searchParams.get("status") || null,
              limit: Number.isNaN(limit) ? 50 : limit,
            }) ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/remote-mentions") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
        const account = url.searchParams.get("account") || null;

        return jsonResponse({
          items:
            store.getMentionResolutions?.({
              status: url.searchParams.get("status") || null,
              actorHandle: url.searchParams.get("actorHandle") || null,
              surface: url.searchParams.get("surface") || null,
              limit: Number.isNaN(limit) ? 50 : limit,
            }) ?? [],
          item: account ? store.getMentionResolution?.(account) ?? null : null,
        });
      }

      if (request.method === "GET" && pathname === "/admin/dead-letters") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
        return jsonResponse({
          items:
            store.getDeadLetters?.({
              status: url.searchParams.get("status") || null,
              actorHandle: url.searchParams.get("actorHandle") || null,
              limit: Number.isNaN(limit) ? 50 : limit,
            }) ?? [],
        });
      }

      if (request.method === "GET" && pathname === "/admin/threads") {
        const actorHandle = url.searchParams.get("actorHandle");
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        return jsonResponse(
          buildThreadReport({
            actorHandle,
            inboundObjects: store.getInboundObjects?.(actorHandle) ?? [],
            threadId: url.searchParams.get("threadId") || null,
            objectId: url.searchParams.get("objectId") || null,
          }),
        );
      }

      if (request.method === "GET" && pathname === "/admin/local-domain") {
        const actorHandle = url.searchParams.get("actorHandle");
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        return jsonResponse({
          actorHandle,
          conversations: store.getLocalConversations?.(actorHandle) ?? [],
          thread: url.searchParams.get("threadId") ? store.getLocalConversation?.(actorHandle, url.searchParams.get("threadId")) ?? null : null,
        });
      }

      if (request.method === "GET" && pathname === "/admin/local-content") {
        const actorHandle = url.searchParams.get("actorHandle");
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const contentId = url.searchParams.get("contentId") || null;
        const threadId = url.searchParams.get("threadId") || null;
        const items = store.getLocalContents?.(actorHandle) ?? [];
        const item = contentId
          ? store.getLocalContent?.(actorHandle, contentId) ?? null
          : threadId
            ? items.find((entry) => entry.threadId === threadId) ?? null
            : null;

        return jsonResponse({
          actorHandle,
          items,
          item,
        });
      }

      if (request.method === "GET" && pathname === "/admin/local-content/delivery") {
        const actorHandle = url.searchParams.get("actorHandle");
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const contentId = url.searchParams.get("contentId") || null;
        const threadId = url.searchParams.get("threadId") || null;
        if (!contentId && !threadId) {
          return jsonResponse({ error: "contentId or threadId is required" }, 422);
        }

        const report = buildLocalContentDeliveryReport({
          actorHandle,
          contentId,
          threadId,
          activityId: url.searchParams.get("activityId") || null,
          actionType: url.searchParams.get("actionType") || null,
          status: url.searchParams.get("status") || null,
        });
        if (!report) {
          return jsonResponse({ error: "Unknown local content" }, 404);
        }

        return jsonResponse(report);
      }

      if (request.method === "GET" && pathname === "/admin/local-content/delivery/activities") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const actorHandle = url.searchParams.get("actorHandle") || null;
        const snapshot = buildContentDeliveryActivityIndex({
          actorHandle,
          limit: Number.isNaN(limit) ? 20 : limit,
          status: url.searchParams.get("status") || null,
          actionType: url.searchParams.get("actionType") || null,
          activityId: url.searchParams.get("activityId") || null,
          replayedOnly: url.searchParams.get("replayedOnly") === "true",
          replayableOnly: url.searchParams.get("replayableOnly") === "true",
        });

        return jsonResponse(snapshot);
      }

      if (request.method === "POST" && pathname === "/admin/local-content/delivery/activities/replay") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandle = payload.actorHandle?.trim();
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const activityId = payload.activityId?.trim();
        if (!activityId) {
          return jsonResponse({ error: "activityId is required" }, 422);
        }

        const snapshot = buildContentDeliveryActivityIndex({
          actorHandle,
          limit: 200,
          activityId,
          status: payload.status?.trim() || null,
          actionType: payload.actionType?.trim() || null,
        });
        const activity = snapshot.items.find((entry) => entry.activityId === activityId) ?? null;
        if (!activity) {
          return jsonResponse({ error: "Unknown delivery activity" }, 404);
        }

        const queueItemIds = dedupeValues(activity.delivery.replayableQueueItemIds ?? []);
        if (!queueItemIds.length) {
          return jsonResponse({ error: "No replayable delivery items found for this activity" }, 422);
        }

        const replayRecord = {
          replayedAt: clock().toISOString(),
          replayedBy: payload.replayedBy?.trim() || "system",
          reason: payload.reason?.trim() || "content delivery activity replay",
        };
        const results = [];
        for (const itemId of queueItemIds) {
          const result = await replayDeadLetterItem(itemId, replayRecord, {
            surface: "admin-local-content-delivery-activity-replay",
          });
          if (result.error) {
            return jsonResponse(
              {
                error: result.error,
                ...(result.payload ?? {}),
                itemId,
              },
              result.statusCode ?? 409,
            );
          }
          results.push({
            itemId: result.itemId,
            activityId: result.activityId,
            actorHandle: result.actorHandle,
            targetActorId: result.targetActorId,
            delivery: result.delivery
              ? {
                  id: result.delivery.id,
                  status: result.delivery.status,
                  targetActorId: result.delivery.targetActorId,
                  lastError: result.delivery.lastError ?? null,
                }
              : null,
            deadLetter: result.deadLetter,
          });
        }

        return jsonResponse({
          status: "replayed",
          actorHandle,
          activityId,
          contentRefs: activity.contentRefs,
          items: results,
        });
      }

      if (request.method === "POST" && pathname === "/admin/local-content/delivery/replay") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandle = payload.actorHandle?.trim();
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const contentId = payload.contentId?.trim() || null;
        const threadId = payload.threadId?.trim() || null;
        if (!contentId && !threadId) {
          return jsonResponse({ error: "contentId or threadId is required" }, 422);
        }

        const report = buildLocalContentDeliveryReport({
          actorHandle,
          contentId,
          threadId,
          activityId: payload.activityId?.trim() || null,
        });
        if (!report) {
          return jsonResponse({ error: "Unknown local content" }, 404);
        }

        const queueItemIds = dedupeValues(
          report.items.flatMap((entry) =>
            entry.delivery.replayableQueueItemIds?.length
              ? entry.delivery.replayableQueueItemIds
              : payload.activityId?.trim()
                ? []
                : [],
          ),
        );
        if (!queueItemIds.length) {
          return jsonResponse({ error: "No replayable delivery items found for this content" }, 422);
        }

        const replayRecord = {
          replayedAt: clock().toISOString(),
          replayedBy: payload.replayedBy?.trim() || "system",
          reason: payload.reason?.trim() || "content delivery replay",
        };
        const results = [];
        for (const itemId of queueItemIds) {
          const result = await replayDeadLetterItem(itemId, replayRecord, {
            surface: "admin-local-content-delivery-replay",
          });
          if (result.error) {
            return jsonResponse(
              {
                error: result.error,
                ...(result.payload ?? {}),
                itemId,
              },
              result.statusCode ?? 409,
            );
          }
          results.push({
            itemId: result.itemId,
            activityId: result.activityId,
            actorHandle: result.actorHandle,
            targetActorId: result.targetActorId,
            delivery: result.delivery
              ? {
                  id: result.delivery.id,
                  status: result.delivery.status,
                  targetActorId: result.delivery.targetActorId,
                  lastError: result.delivery.lastError ?? null,
                }
              : null,
            deadLetter: result.deadLetter,
          });
        }

        return jsonResponse({
          status: "replayed",
          actorHandle,
          contentId: report.content.contentId,
          activityId: payload.activityId?.trim() || null,
          items: results,
        });
      }

      if (request.method === "GET" && pathname === "/admin/local-notifications") {
        const actorHandle = url.searchParams.get("actorHandle");
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const notificationId = url.searchParams.get("notificationId") || null;
        const contentId = url.searchParams.get("contentId") || null;
        const category = url.searchParams.get("category") || null;
        const unreadOnly = url.searchParams.get("unreadOnly") === "true";
        const items = (store.getLocalNotifications?.(actorHandle) ?? []).filter((entry) => {
          if (contentId && entry.contentId !== contentId) {
            return false;
          }
          if (category && entry.primaryCategory !== category) {
            return false;
          }
          if (unreadOnly && entry.state?.read === true) {
            return false;
          }
          return true;
        });

        return jsonResponse({
          actorHandle,
          items,
          item: notificationId ? store.getLocalNotification?.(actorHandle, notificationId) ?? null : null,
        });
      }

      if (request.method === "POST" && pathname === "/admin/local-notifications/read") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandle = payload.actorHandle?.trim();
        if (!actorHandle) {
          return jsonResponse({ error: "actorHandle is required" }, 422);
        }

        const markRead = payload.read !== false;
        const notificationIds = payload.all === true
          ? (store.getLocalNotifications?.(actorHandle) ?? []).map((entry) => entry.notificationId)
          : dedupeValues([
              payload.notificationId?.trim() || null,
              ...((Array.isArray(payload.notificationIds) ? payload.notificationIds : [])
                .map((entry) => (typeof entry === "string" ? entry.trim() : null))
                .filter(Boolean)),
            ]);

        if (!notificationIds.length) {
          return jsonResponse({ error: "notificationId or notificationIds is required" }, 422);
        }

        const notifications = store.getLocalNotifications?.(actorHandle) ?? [];
        const updated = notifications.map((entry) => {
          if (!notificationIds.includes(entry.notificationId)) {
            return entry;
          }

          return {
            ...entry,
            unreadCount: markRead ? 0 : entry.eventCount,
            state: {
              read: markRead,
              readAt: markRead ? clock().toISOString() : null,
              readBy: markRead ? payload.updatedBy?.trim() || "system" : null,
              readEventCount: markRead ? entry.eventCount : 0,
            },
            updatedAt: clock().toISOString(),
          };
        });

        await store.replaceLocalNotifications?.(actorHandle, updated);
        await store.replaceLocalContents?.(
          actorHandle,
          mergeContentApplicationProjection({
            contents: store.getLocalContents?.(actorHandle) ?? [],
            notificationEvents: [],
            notifications: updated,
            outboundItems: store.getOutboundItems?.({ actorHandle }) ?? [],
          }),
        );
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: markRead ? "notification.mark-read" : "notification.mark-unread",
          actorHandle,
          notificationIds,
          updatedBy: payload.updatedBy?.trim() || "system",
        });

        return jsonResponse({
          status: markRead ? "marked-read" : "marked-unread",
          actorHandle,
          items: updated.filter((entry) => notificationIds.includes(entry.notificationId)),
        });
      }

      if (request.method === "POST" && pathname === "/admin/local-domain/reconcile") {
        const bodyText = await request.text();
        let payload = {};

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const actorHandles = payload.actorHandle?.trim()
          ? [payload.actorHandle.trim()]
          : Object.keys(config.actors);
        const reports = [];

        for (const actorHandle of actorHandles) {
          reports.push(await reconcileLocalDomainProjection(actorHandle, { dryRun: payload.dryRun === true }));
        }

        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "local-domain.reconciled",
          actorHandles,
          dryRun: payload.dryRun === true,
          requestedBy: payload.requestedBy?.trim() || "system",
          reports,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: "local-domain.reconciled",
            actorHandles,
            dryRun: payload.dryRun === true,
            reports,
          }),
        );

        return jsonResponse({ status: "ok", reports });
      }

      if (request.method === "GET" && pathname === "/admin/runtime/storage") {
        const now = clock().toISOString();
        return jsonResponse({
          runtime: store.getRuntimeMetadata?.() ?? {
            driver: config.runtime?.storeDriver ?? "unknown",
          },
          alerts:
            store.getStorageAlerts?.({
              now,
              thresholds: getStorageAlertThresholds(config),
            }) ?? { generatedAt: now, thresholds: {}, items: [] },
        });
      }

      if (request.method === "GET" && pathname === "/admin/runtime/metrics") {
        return jsonResponse({
          metrics: buildRuntimeMetrics({
            store,
            config,
            now: clock().toISOString(),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/admin/runtime/metrics/dispatch") {
        const bodyText = await request.text();
        let payload = {};

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const now = clock().toISOString();
        const bundle = buildRuntimeMetricsBundle({
          store,
          config,
          now,
        });

        let outputFile = null;
        if (payload.outputFile?.trim()) {
          outputFile = await writeRuntimeDispatchBundle(payload.outputFile, bundle);
        }

        const metricsDispatch = resolveRuntimeDispatch({
          configuredDispatch: config.runtime?.metrics?.dispatch ?? {},
          override: {
            webhookUrl: payload.webhookUrl,
            webhookHeaders: payload.webhookHeaders,
            webhookBearerToken: payload.webhookBearerToken,
            timeoutMs: payload.timeoutMs,
          },
        });
        let webhook = null;
        const requestedBy = payload.requestedBy?.trim() || "system";

        try {
          webhook = await dispatchRuntimeWebhook({
            ...metricsDispatch,
            bundle,
          });
        } catch (error) {
          const sinkTypes = [...(outputFile ? ["file"] : []), "webhook"];
          await recordAuditEvent({
            timestamp: now,
            event: "runtime-metrics.dispatch-failed",
            gaugeCount: bundle.metrics.gauges?.length ?? 0,
            outputFile,
            sinkType: "webhook",
            sinkTypes,
            webhookHost: error.host ?? null,
            webhookStatus: error.status ?? null,
            error: error.message,
            requestedBy,
          });
          await store.recordTrace(
            makeTrace(clock, {
              direction: "internal",
              event: "runtime-metrics.dispatch-failed",
              gaugeCount: bundle.metrics.gauges?.length ?? 0,
              outputFile,
              sinkType: "webhook",
              sinkTypes,
              webhookHost: error.host ?? null,
              webhookStatus: error.status ?? null,
              error: error.message,
            }),
          );

          return jsonResponse(
            {
              error: "Runtime metrics dispatch failed",
              outputFile,
              webhook: error.host
                ? {
                    type: "webhook",
                    host: error.host,
                    status: error.status ?? null,
                  }
                : null,
              bundle,
            },
            502,
          );
        }

        const sinkTypes = [...(outputFile ? ["file"] : []), ...(webhook ? ["webhook"] : [])];
        const eventName = outputFile || webhook ? "runtime-metrics.dispatched" : "runtime-metrics.previewed";
        await recordAuditEvent({
          timestamp: now,
          event: eventName,
          gaugeCount: bundle.metrics.gauges?.length ?? 0,
          outputFile,
          sinkType: webhook ? "webhook" : outputFile ? "file" : "preview",
          sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
          webhookHost: webhook?.host ?? null,
          webhookStatus: webhook?.status ?? null,
          requestedBy,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: eventName,
            gaugeCount: bundle.metrics.gauges?.length ?? 0,
            outputFile,
            sinkType: webhook ? "webhook" : outputFile ? "file" : "preview",
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhookHost: webhook?.host ?? null,
            webhookStatus: webhook?.status ?? null,
          }),
        );

        return jsonResponse(
          {
            status: outputFile || webhook ? "dispatched" : "preview",
            outputFile,
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhook,
            bundle,
          },
          outputFile || webhook ? 201 : 200,
        );
      }

      if (request.method === "POST" && pathname === "/admin/runtime/logs/dispatch") {
        const bodyText = await request.text();
        let payload = {};

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const now = clock().toISOString();
        const configuredDispatch = config.runtime?.logs?.dispatch ?? {};
        const auditLimit =
          Number.isFinite(payload.auditLimit) && payload.auditLimit > 0
            ? Math.floor(payload.auditLimit)
            : configuredDispatch.auditLimit ?? 100;
        const traceLimit =
          Number.isFinite(payload.traceLimit) && payload.traceLimit > 0
            ? Math.floor(payload.traceLimit)
            : configuredDispatch.traceLimit ?? 100;
        const traceEventPrefix =
          typeof payload.traceEventPrefix === "string" && payload.traceEventPrefix.trim()
            ? payload.traceEventPrefix.trim()
            : configuredDispatch.traceEventPrefix ?? null;
        const bundle = buildRuntimeLogsBundle({
          store,
          now,
          auditLimit,
          traceLimit,
          traceEventPrefix,
        });

        let outputFile = null;
        if (payload.outputFile?.trim()) {
          outputFile = await writeRuntimeDispatchBundle(payload.outputFile, bundle);
        }

        const logsDispatch = resolveRuntimeDispatch({
          configuredDispatch,
          override: {
            webhookUrl: payload.webhookUrl,
            webhookHeaders: payload.webhookHeaders,
            webhookBearerToken: payload.webhookBearerToken,
            timeoutMs: payload.timeoutMs,
          },
        });
        let webhook = null;
        const requestedBy = payload.requestedBy?.trim() || "system";

        try {
          webhook = await dispatchRuntimeWebhook({
            ...logsDispatch,
            bundle,
          });
        } catch (error) {
          const sinkTypes = [...(outputFile ? ["file"] : []), "webhook"];
          await recordAuditEvent({
            timestamp: now,
            event: "runtime-logs.dispatch-failed",
            auditCount: bundle.audit.total,
            traceCount: bundle.traces.total,
            outputFile,
            sinkType: "webhook",
            sinkTypes,
            webhookHost: error.host ?? null,
            webhookStatus: error.status ?? null,
            error: error.message,
            requestedBy,
          });
          await store.recordTrace(
            makeTrace(clock, {
              direction: "internal",
              event: "runtime-logs.dispatch-failed",
              auditCount: bundle.audit.total,
              traceCount: bundle.traces.total,
              outputFile,
              sinkType: "webhook",
              sinkTypes,
              webhookHost: error.host ?? null,
              webhookStatus: error.status ?? null,
              error: error.message,
            }),
          );

          return jsonResponse(
            {
              error: "Runtime logs dispatch failed",
              outputFile,
              webhook: error.host
                ? {
                    type: "webhook",
                    host: error.host,
                    status: error.status ?? null,
                  }
                : null,
              bundle,
            },
            502,
          );
        }

        const sinkTypes = [...(outputFile ? ["file"] : []), ...(webhook ? ["webhook"] : [])];
        const eventName = outputFile || webhook ? "runtime-logs.dispatched" : "runtime-logs.previewed";
        await recordAuditEvent({
          timestamp: now,
          event: eventName,
          auditCount: bundle.audit.total,
          traceCount: bundle.traces.total,
          outputFile,
          sinkType: webhook ? "webhook" : outputFile ? "file" : "preview",
          sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
          webhookHost: webhook?.host ?? null,
          webhookStatus: webhook?.status ?? null,
          requestedBy,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: eventName,
            auditCount: bundle.audit.total,
            traceCount: bundle.traces.total,
            outputFile,
            sinkType: webhook ? "webhook" : outputFile ? "file" : "preview",
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhookHost: webhook?.host ?? null,
            webhookStatus: webhook?.status ?? null,
          }),
        );

        return jsonResponse(
          {
            status: outputFile || webhook ? "dispatched" : "preview",
            outputFile,
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhook,
            bundle,
          },
          outputFile || webhook ? 201 : 200,
        );
      }

      if (request.method === "GET" && pathname === "/admin/runtime/alerts") {
        const minimumSeverity = url.searchParams.get("minimumSeverity") || "info";
        const now = clock().toISOString();
        const bundle = buildRuntimeAlertBundle({
          store,
          config,
          now,
          minimumSeverity,
        });

        return jsonResponse({
          alerts: bundle.alerts,
          metrics: bundle.metrics,
        });
      }

      if (request.method === "POST" && pathname === "/admin/runtime/storage/backup") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.outputFile?.trim()) {
          return jsonResponse({ error: "outputFile is required" }, 422);
        }

        if (!store.createBackup) {
          return jsonResponse({ error: "Active store does not support backups" }, 501);
        }

        const backup = await store.createBackup(payload.outputFile);
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "storage.backup-created",
          driver: backup.driver,
          backupFile: backup.backupFile,
          createdAt: backup.createdAt,
          requestedBy: payload.requestedBy?.trim() || "system",
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: "storage.backup-created",
            backupFile: backup.backupFile,
            driver: backup.driver,
          }),
        );

        return jsonResponse({ status: "created", backup }, 201);
      }

      if (request.method === "POST" && pathname === "/admin/runtime/storage/reconcile") {
        const bodyText = await request.text();
        let payload = {};

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!store.reconcileStorage) {
          return jsonResponse({ error: "Active store does not support reconciliation" }, 501);
        }

        const report = await store.reconcileStorage({
          now: clock().toISOString(),
          dryRun: payload.dryRun === true,
        });
        await recordAuditEvent({
          timestamp: clock().toISOString(),
          event: "storage.reconciled",
          driver: report.driver,
          dryRun: report.dryRun,
          summary: report.summary,
          requestedBy: payload.requestedBy?.trim() || "system",
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: "storage.reconciled",
            driver: report.driver,
            dryRun: report.dryRun,
            summary: report.summary,
          }),
        );

        return jsonResponse({ status: "ok", report });
      }

      if (request.method === "POST" && pathname === "/admin/runtime/alerts/dispatch") {
        const bodyText = await request.text();
        let payload = {};

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const now = clock().toISOString();
        const minimumSeverity = payload.minimumSeverity?.trim() || "warn";
        const bundle = buildRuntimeAlertBundle({
          store,
          config,
          now,
          minimumSeverity,
        });

        let outputFile = null;
        if (payload.outputFile?.trim()) {
          outputFile = await writeRuntimeAlertBundle(payload.outputFile, bundle);
        }

        const alertDispatch = resolveRuntimeAlertDispatch({
          config,
          override: {
            webhookUrl: payload.webhookUrl,
            webhookHeaders: payload.webhookHeaders,
            webhookBearerToken: payload.webhookBearerToken,
            slackWebhookUrl: payload.slackWebhookUrl,
            slackChannel: payload.slackChannel,
            slackUsername: payload.slackUsername,
            slackIconEmoji: payload.slackIconEmoji,
            timeoutMs: payload.timeoutMs,
          },
        });
        let webhook = null;
        let slack = null;
        const requestedBy = payload.requestedBy?.trim() || "system";

        try {
          if (alertDispatch.webhookUrl) {
            webhook = await dispatchRuntimeAlertWebhook({
              ...alertDispatch,
              bundle,
            });
          }
          if (alertDispatch.slackWebhookUrl) {
            slack = await dispatchRuntimeAlertSlackWebhook({
              ...alertDispatch,
              bundle,
              config,
            });
          }
        } catch (error) {
          const failedSinkType = error.type ?? "webhook";
          const sinkTypes = [
            ...(outputFile ? ["file"] : []),
            ...(webhook ? ["webhook"] : []),
            ...(slack ? ["slack"] : []),
            failedSinkType,
          ];
          await recordAuditEvent({
            timestamp: now,
            event: "runtime-alerts.dispatch-failed",
            minimumSeverity,
            alertCount: bundle.alerts.items.length,
            outputFile,
            sinkType: failedSinkType,
            sinkTypes,
            webhookHost: failedSinkType === "webhook" ? error.host ?? null : webhook?.host ?? null,
            webhookStatus: failedSinkType === "webhook" ? error.status ?? null : webhook?.status ?? null,
            slackHost: failedSinkType === "slack" ? error.host ?? null : slack?.host ?? null,
            slackStatus: failedSinkType === "slack" ? error.status ?? null : slack?.status ?? null,
            error: error.message,
            requestedBy,
          });
          await store.recordTrace(
            makeTrace(clock, {
              direction: "internal",
              event: "runtime-alerts.dispatch-failed",
              minimumSeverity,
              alertCount: bundle.alerts.items.length,
              outputFile,
              sinkType: failedSinkType,
              sinkTypes,
              webhookHost: failedSinkType === "webhook" ? error.host ?? null : webhook?.host ?? null,
              webhookStatus: failedSinkType === "webhook" ? error.status ?? null : webhook?.status ?? null,
              slackHost: failedSinkType === "slack" ? error.host ?? null : slack?.host ?? null,
              slackStatus: failedSinkType === "slack" ? error.status ?? null : slack?.status ?? null,
              error: error.message,
            }),
          );

          return jsonResponse(
            {
              error: "Runtime alert dispatch failed",
              outputFile,
              failedSinkType,
              sinkTypes,
              webhook:
                failedSinkType === "webhook" && error.host
                ? {
                    type: "webhook",
                    host: error.host,
                    status: error.status ?? null,
                  }
                : webhook,
              slack:
                failedSinkType === "slack" && error.host
                  ? {
                      type: "slack",
                      host: error.host,
                      status: error.status ?? null,
                    }
                  : slack,
              bundle,
            },
            502,
          );
        }

        const sinkTypes = [
          ...(outputFile ? ["file"] : []),
          ...(webhook ? ["webhook"] : []),
          ...(slack ? ["slack"] : []),
        ];
        const eventName = outputFile || webhook || slack ? "runtime-alerts.dispatched" : "runtime-alerts.previewed";
        await recordAuditEvent({
          timestamp: now,
          event: eventName,
          minimumSeverity,
          alertCount: bundle.alerts.items.length,
          outputFile,
          sinkType: slack ? "slack" : webhook ? "webhook" : outputFile ? "file" : "preview",
          sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
          webhookHost: webhook?.host ?? null,
          webhookStatus: webhook?.status ?? null,
          slackHost: slack?.host ?? null,
          slackStatus: slack?.status ?? null,
          requestedBy,
        });
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: eventName,
            minimumSeverity,
            alertCount: bundle.alerts.items.length,
            outputFile,
            sinkType: slack ? "slack" : webhook ? "webhook" : outputFile ? "file" : "preview",
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhookHost: webhook?.host ?? null,
            webhookStatus: webhook?.status ?? null,
            slackHost: slack?.host ?? null,
            slackStatus: slack?.status ?? null,
          }),
        );

        return jsonResponse(
          {
            status: outputFile || webhook || slack ? "dispatched" : "preview",
            outputFile,
            sinkTypes: sinkTypes.length > 0 ? sinkTypes : ["preview"],
            webhook,
            slack,
            bundle,
          },
          outputFile || webhook || slack ? 201 : 200,
        );
      }

      if (request.method === "GET" && pathname === "/admin/queues/outbound") {
        const traceLimit = Number.parseInt(url.searchParams.get("traceLimit") ?? "20", 10);
        return jsonResponse({
          queue: store.getQueueSnapshot?.({
            traceLimit: Number.isNaN(traceLimit) ? 20 : traceLimit,
          }) ?? {
            summary: {},
            deadLetters: {},
            recentDeadLetters: [],
            recentDeliveryTraces: [],
          },
        });
      }

      if (request.method === "POST" && pathname === "/admin/dead-letters/replay") {
        const bodyText = await request.text();
        let payload;

        try {
          payload = parseJsonBody(bodyText);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload.id?.trim()) {
          return jsonResponse({ error: "id is required" }, 422);
        }

        const replayRecord = {
          replayedAt: clock().toISOString(),
          replayedBy: payload.replayedBy?.trim() || "system",
          reason: payload.reason?.trim() || "manual replay",
        };
        const result = await replayDeadLetterItem(payload.id, replayRecord, {
          surface: "admin-dead-letter-replay",
        });
        if (result.error) {
          return jsonResponse(
            {
              error: result.error,
              ...(result.payload ?? {}),
            },
            result.statusCode ?? 409,
          );
        }
        return jsonResponse(
          {
            status: "replayed",
            itemId: payload.id,
            deadLetter: result.deadLetter,
            delivery: result.delivery
              ? {
                  id: result.delivery.id,
                  status: result.delivery.status,
                  targetActorId: result.delivery.targetActorId,
                  lastError: result.delivery.lastError ?? null,
                }
              : null,
          },
          202,
        );
      }

      if (request.method === "GET" && pathname === "/admin/dashboard") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
        const contentDelivery = getContentDeliveryReviewSnapshot({
          actorHandle: url.searchParams.get("actorHandle") || null,
          limit: Number.isNaN(limit) ? 10 : limit,
          status: url.searchParams.get("status") || null,
          replayedOnly: url.searchParams.get("replayedOnly") === "true",
          replayableOnly: url.searchParams.get("replayableOnly") === "true",
        });
        return jsonResponse({
          summary: store.getDashboardSnapshot?.() ?? {},
          contentDelivery: normalizeContentDeliveryReviewSnapshot(contentDelivery),
        });
      }

      if (request.method === "GET" && pathname === "/admin/review-queue") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const surface = url.searchParams.get("surface") || "content-delivery";
        if (surface !== "content-delivery") {
          return jsonResponse({ error: "surface must be content-delivery" }, 422);
        }

        const snapshot = getContentDeliveryReviewSnapshot({
          actorHandle: url.searchParams.get("actorHandle") || null,
          limit: Number.isNaN(limit) ? 20 : limit,
          status: url.searchParams.get("status") || null,
          replayedOnly: url.searchParams.get("replayedOnly") === "true",
          replayableOnly: url.searchParams.get("replayableOnly") === "true",
        });
        const normalizedSnapshot = normalizeContentDeliveryReviewSnapshot(snapshot);

        return jsonResponse({
          surface,
          ...normalizedSnapshot,
        });
      }

      if (request.method === "POST" && pathname === "/inbox") {
        return handleInbox(request, null);
      }

      if (request.method === "POST" && pathname === "/jobs/delivery") {
        const body = await request.text();
        const payload = parseJsonBody(body);
        const now = clock().toISOString();
        const recovered =
          (await store.recoverStaleOutboundDeliveries?.({
            now,
            maxLeaseAgeMs: config.delivery?.processingLeaseTimeoutMs ?? 15 * 60 * 1000,
          })) ?? [];

        for (const recoveredItem of recovered) {
          await store.recordTrace({
            timestamp: now,
            direction: "internal",
            event: "delivery.recovered",
            itemId: recoveredItem.id,
            actorHandle: recoveredItem.actorHandle ?? null,
            remoteActorId: recoveredItem.targetActorId ?? null,
            recoveredAt: now,
          });
          await recordAuditEvent({
            timestamp: now,
            event: "delivery.recovered",
            itemId: recoveredItem.id,
            actorHandle: recoveredItem.actorHandle ?? null,
            remoteActorId: recoveredItem.targetActorId ?? null,
            recoveredAt: now,
          });
        }

        const itemIds = payload.id
          ? [payload.id]
          : store.getPendingOutbound().map((item) => item.id);
        const processed = [];

        for (const itemId of itemIds) {
          processed.push(await deliveryProcessor.process(itemId));
        }

        const touchedActors = dedupeValues(processed.map((item) => item?.actorHandle ?? null));
        for (const actorHandle of touchedActors) {
          await syncLocalDomainProjection(actorHandle);
        }

        return jsonResponse({
          processed: processed.length,
          items: processed,
        });
      }

      if (request.method === "POST" && pathname === "/jobs/remote-actors/refresh") {
        const body = await request.text();
        const payload = parseJsonBody(body);
        const actorId = payload.actorId;
        if (!actorId?.trim()) {
          return jsonResponse({ error: "actorId is required" }, 400);
        }

        const remoteActor = await remoteActorDirectory.refresh(actorId);
        await store.recordTrace(
          makeTrace(clock, {
            direction: "internal",
            event: "remote-actor.manual-refresh",
            remoteActorId: actorId,
          }),
        );
        return jsonResponse(remoteActor, 200);
      }

      return jsonResponse({ error: "Not found" }, 404);
    },
  };
}
