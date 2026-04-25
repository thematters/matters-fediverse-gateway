function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dedupeValues(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function getObjectReferenceId(value) {
  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }

  if (value && typeof value === "object") {
    return normalizeOptionalString(value.id) ?? normalizeOptionalString(value.url);
  }

  return null;
}

export function buildContentIdentitySet(content) {
  if (content.relations?.identityObjectIds?.length) {
    return new Set(dedupeValues(content.relations.identityObjectIds));
  }

  return new Set(
    dedupeValues([
      content.contentId,
      content.threadId,
      content.threadRootId,
      content.rootObjectId,
      ...(content.relations?.replyObjectIds ?? []),
    ]),
  );
}

export function getOutboundActivityProjection(item) {
  const activity = item?.activity ?? {};
  const object = activity.object && typeof activity.object === "object" ? activity.object : null;
  const objectId = getObjectReferenceId(activity.object);
  const normalizedType = normalizeOptionalString(activity.type);

  return {
    activityId: normalizeOptionalString(activity.id),
    activityType: normalizedType,
    actionType:
      normalizedType === "Create"
        ? normalizeOptionalString(object?.inReplyTo)
          ? "reply"
          : "create"
        : normalizedType === "Like"
          ? "like"
          : normalizedType === "Announce"
            ? "announce"
            : normalizedType === "Update"
              ? "update"
              : normalizedType === "Delete"
                ? "delete"
                : null,
    objectId,
    inReplyTo: normalizeOptionalString(object?.inReplyTo),
    targetActorId: normalizeOptionalString(item.targetActorId),
    status: normalizeOptionalString(item.status),
    attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
    createdAt: normalizeOptionalString(item.createdAt),
    deliveredAt: normalizeOptionalString(item.deliveredAt),
    lastFailureAt: normalizeOptionalString(item.lastFailureAt) ?? normalizeOptionalString(item.deadLetteredAt),
    lastError: normalizeOptionalString(item.lastError),
  };
}

export function summarizeOutboundActivityDelivery(entries = []) {
  const latestDeliveredAt = entries
    .map((entry) => entry.deliveredAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const latestFailureEntry =
    [...entries]
      .filter((entry) => entry.lastFailureAt || entry.lastError)
      .sort((left, right) => (left.lastFailureAt ?? "").localeCompare(right.lastFailureAt ?? ""))
      .at(-1) ?? null;
  const allDelivered = entries.length > 0 && entries.every((entry) => entry.status === "delivered");
  const allPending = entries.length > 0 && entries.every((entry) => entry.status === "pending");
  const allDeadLetter = entries.length > 0 && entries.every((entry) => entry.status === "dead-letter");

  let status = "partial";
  if (allDelivered) {
    status = "delivered";
  } else if (allDeadLetter) {
    status = "deadLetter";
  } else if (allPending) {
    status = entries.some((entry) => entry.attempts > 0 || entry.lastFailureAt) ? "retryPending" : "pending";
  }

  return {
    status,
    lastDeliveredAt: latestDeliveredAt,
    lastFailureAt: latestFailureEntry?.lastFailureAt ?? null,
    lastError: latestFailureEntry?.lastError ?? null,
  };
}

export function buildContentOutboundActivityRecords({ contents, outboundItems = [] }) {
  const activityMaps = new Map(contents.map((content) => [content.contentId, new Map()]));

  for (const item of outboundItems) {
    const activity = getOutboundActivityProjection(item);
    if (!activity.actionType) {
      continue;
    }

    for (const content of contents) {
      const contentIdentity = buildContentIdentitySet(content);
      if (!contentIdentity.has(activity.objectId) && !(activity.inReplyTo && contentIdentity.has(activity.inReplyTo))) {
        continue;
      }

      const activityMap = activityMaps.get(content.contentId);
      const activityKey = activity.activityId ?? item.id;
      const currentActivity = activityMap.get(activityKey) ?? {
        activityId: activityKey,
        actionType: activity.actionType,
        activityType: activity.activityType,
        objectId: activity.objectId,
        inReplyTo: activity.inReplyTo,
        createdAt: activity.createdAt,
        recipients: [],
      };
      currentActivity.createdAt =
        [currentActivity.createdAt, activity.createdAt].filter(Boolean).sort().at(0) ?? currentActivity.createdAt ?? null;
      currentActivity.recipients.push({
        queueItemId: item.id,
        targetActorId: activity.targetActorId,
        status: activity.status,
        attempts: activity.attempts,
        createdAt: activity.createdAt,
        deliveredAt: activity.deliveredAt,
        lastFailureAt: activity.lastFailureAt,
        lastError: activity.lastError,
      });
      activityMap.set(activityKey, currentActivity);
    }
  }

  return new Map(
    [...activityMaps.entries()].map(([contentId, activityMap]) => [
      contentId,
      [...activityMap.values()]
        .map((activity) => {
          const summary = summarizeOutboundActivityDelivery(activity.recipients);
          const recipientActorIds = dedupeValues(activity.recipients.map((entry) => entry.targetActorId));

          return {
            activityId: activity.activityId,
            activityType: activity.activityType,
            actionType: activity.actionType,
            objectId: activity.objectId,
            inReplyTo: activity.inReplyTo,
            createdAt: activity.createdAt,
            recipientActorIds,
            recipientCount: recipientActorIds.length,
            recipients: [...activity.recipients].sort((left, right) =>
              (left.targetActorId ?? "").localeCompare(right.targetActorId ?? ""),
            ),
            delivery: {
              status: summary.status,
              lastDeliveredAt: summary.lastDeliveredAt,
              lastFailureAt: summary.lastFailureAt,
              lastError: summary.lastError,
              recipients: {
                total: activity.recipients.length,
                delivered: activity.recipients.filter((entry) => entry.status === "delivered").length,
                pending: activity.recipients.filter((entry) => entry.status === "pending").length,
                retryPending: activity.recipients.filter(
                  (entry) => entry.status === "pending" && ((entry.attempts ?? 0) > 0 || entry.lastFailureAt),
                ).length,
                deadLetter: activity.recipients.filter((entry) => entry.status === "dead-letter").length,
              },
              replayableQueueItemIds: activity.recipients
                .filter((entry) => entry.status === "dead-letter")
                .map((entry) => entry.queueItemId),
            },
          };
        })
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")),
    ]),
  );
}

export function buildDeliveryStatusSummary(records = []) {
  return {
    total: records.length,
    delivered: records.filter((entry) => entry.delivery.status === "delivered").length,
    pending: records.filter((entry) => entry.delivery.status === "pending").length,
    retryPending: records.filter((entry) => entry.delivery.status === "retryPending").length,
    deadLetter: records.filter((entry) => entry.delivery.status === "deadLetter").length,
    partial: records.filter((entry) => entry.delivery.status === "partial").length,
    recipients: {
      total: records.reduce((sum, entry) => sum + entry.delivery.recipients.total, 0),
      delivered: records.reduce((sum, entry) => sum + entry.delivery.recipients.delivered, 0),
      pending: records.reduce((sum, entry) => sum + entry.delivery.recipients.pending, 0),
      retryPending: records.reduce((sum, entry) => sum + entry.delivery.recipients.retryPending, 0),
      deadLetter: records.reduce((sum, entry) => sum + entry.delivery.recipients.deadLetter, 0),
    },
  };
}

export function buildContentDeliveryProjectionItems({ actorHandle = null, contents = [], outboundItems = [] }) {
  const activityMap = buildContentOutboundActivityRecords({ contents, outboundItems });

  return contents
    .map((content) => {
      const activities = activityMap.get(content.contentId) ?? [];
      return {
        actorHandle: actorHandle ?? content.actorHandle ?? null,
        contentId: content.contentId,
        threadId: content.threadId,
        threadRootId: content.threadRootId,
        headline: content.headline,
        preview: content.preview,
        latestPublishedAt: content.latestPublishedAt ?? null,
        delivery: buildDeliveryStatusSummary(activities),
        activities,
      };
    })
    .sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""));
}

export function buildContentDeliveryOpsSnapshot({
  actorHandles = [],
  getContentsForActor,
  getOutboundItemsForActor,
  getProjectionItemsForActor,
  auditLog = [],
  actorHandle = null,
  limit = 20,
  status = null,
} = {}) {
  const handles = actorHandle?.trim() ? [actorHandle.trim()] : actorHandles;
  const items = [];
  const replayableQueueItemIds = new Set();
  const uniqueActivityStatusMap = new Map();
  const summary = {
    actors: handles.length,
    contents: 0,
    activities: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
      partial: 0,
    },
    uniqueActivities: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
      partial: 0,
    },
    replayableItems: 0,
    contentsWithIssues: 0,
    recipients: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
    },
  };
  const recentReplays = auditLog
    .filter(
      (entry) =>
        entry.event === "dead-letter.replayed" ||
        (!entry.event && entry.timestamp && entry.itemId && (entry.replayedBy || entry.surface || entry.reason)),
    )
    .filter((entry) => !actorHandle || entry.actorHandle === actorHandle)
    .slice(0, limit)
    .map((entry) => ({
      timestamp: entry.timestamp ?? null,
      actorHandle: entry.actorHandle ?? null,
      itemId: entry.itemId ?? null,
      replayedBy: entry.replayedBy ?? null,
      reason: entry.reason ?? null,
      surface: entry.surface ?? null,
    }));

  for (const handle of handles) {
    const projectionItems = getProjectionItemsForActor
      ? getProjectionItemsForActor(handle)
      : buildContentDeliveryProjectionItems({
          actorHandle: handle,
          contents: getContentsForActor(handle),
          outboundItems: getOutboundItemsForActor(handle),
        });

    for (const content of projectionItems) {
      const records = content.activities ?? [];
      if (!records.length) {
        continue;
      }

      summary.contents += 1;
      const contentSummary = buildDeliveryStatusSummary(records);
      summary.activities.total += contentSummary.total;
      summary.activities.delivered += contentSummary.delivered;
      summary.activities.pending += contentSummary.pending;
      summary.activities.retryPending += contentSummary.retryPending;
      summary.activities.deadLetter += contentSummary.deadLetter;
      summary.activities.partial += contentSummary.partial;
      summary.recipients.total += contentSummary.recipients.total;
      summary.recipients.delivered += contentSummary.recipients.delivered;
      summary.recipients.pending += contentSummary.recipients.pending;
      summary.recipients.retryPending += contentSummary.recipients.retryPending;
      summary.recipients.deadLetter += contentSummary.recipients.deadLetter;
      for (const record of records) {
        uniqueActivityStatusMap.set(record.activityId, record.delivery.status);
      }

      const issueRecords = records.filter((entry) =>
        ["pending", "retryPending", "deadLetter", "partial"].includes(entry.delivery.status),
      );
      for (const queueItemId of issueRecords.flatMap((entry) => entry.delivery.replayableQueueItemIds ?? [])) {
        replayableQueueItemIds.add(queueItemId);
      }
      if (issueRecords.length) {
        summary.contentsWithIssues += 1;
      }

      const filteredRecords = status ? issueRecords.filter((entry) => entry.delivery.status === status) : issueRecords;
      if (!filteredRecords.length) {
        continue;
      }

      items.push({
        actorHandle: handle,
        contentId: content.contentId,
        threadId: content.threadId,
        threadRootId: content.threadRootId,
        headline: content.headline,
        preview: content.preview,
        latestPublishedAt: content.latestPublishedAt ?? null,
        delivery: buildDeliveryStatusSummary(filteredRecords),
        activities: filteredRecords,
        ops: buildContentDeliveryReviewItemOps(
          {
            activities: issueRecords,
          },
          recentReplays,
        ),
      });
    }
  }

  items.sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""));
  summary.replayableItems = replayableQueueItemIds.size;
  summary.uniqueActivities.total = uniqueActivityStatusMap.size;
  for (const statusValue of uniqueActivityStatusMap.values()) {
    if (statusValue in summary.uniqueActivities) {
      summary.uniqueActivities[statusValue] += 1;
    }
  }

  return {
    actorHandle: actorHandle?.trim() || null,
    ...buildContentDeliverySummaryEnvelope({
      summary,
      currentSummaryMode: "full",
    }),
    items: items.slice(0, limit),
    recentReplays,
  };
}

function createEmptyContentDeliverySummary() {
  return {
    actors: 0,
    contents: 0,
    activities: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
      partial: 0,
    },
    uniqueActivities: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
      partial: 0,
    },
    replayableItems: 0,
    contentsWithIssues: 0,
    recipients: {
      total: 0,
      delivered: 0,
      pending: 0,
      retryPending: 0,
      deadLetter: 0,
    },
  };
}

function buildContentDeliverySummaryEnvelope({
  summary,
  filteredSummary = summary,
  currentSummary = filteredSummary,
  currentSummaryMode = "filtered",
} = {}) {
  const contractVersion = 1;
  const canonicalSummaryKey = "summaries.current";
  const legacySummaryKeys = ["summary", "fullSummary", "filteredSummary", "viewSummary"];
  const summaryAliases = {
    summary: "summaries.full",
    fullSummary: "summaries.full",
    filteredSummary: "summaries.filtered",
    viewSummary: "summaries.current",
  };
  const legacyFields = {
    summary: {
      status: "compatibility",
      replacement: "summaries.full",
    },
    fullSummary: {
      status: "compatibility",
      replacement: "summaries.full",
    },
    filteredSummary: {
      status: "compatibility",
      replacement: "summaries.filtered",
    },
    viewSummary: {
      status: "compatibility",
      replacement: "summaries.current",
    },
  };

  return {
    contractVersion,
    summary,
    fullSummary: summary,
    filteredSummary,
    viewSummary: currentSummary,
    canonicalSummaryKey,
    currentSummaryMode,
    legacySummaryKeys,
    summaryAliases,
    contract: {
      version: contractVersion,
      canonicalSummaryKey,
      currentSummaryMode,
      legacySummaryKeys,
      summaryAliases,
      legacyFields,
    },
    summaries: {
      full: summary,
      filtered: filteredSummary,
      current: currentSummary,
    },
  };
}

export function normalizeContentDeliveryReviewSnapshot(snapshot = {}) {
  const summary = snapshot.summary ?? snapshot.fullSummary ?? createEmptyContentDeliverySummary();
  const filteredSummary = snapshot.filteredSummary ?? summary;
  const hasActiveSummaryFilter = Boolean(
    snapshot.appliedFilters?.status || snapshot.appliedFilters?.replayedOnly || snapshot.appliedFilters?.replayableOnly,
  );
  const currentSummaryMode = snapshot.currentSummaryMode ?? (hasActiveSummaryFilter ? "filtered" : "full");
  const currentSummary =
    snapshot.viewSummary ??
    snapshot.summaries?.current ??
    (currentSummaryMode === "filtered" ? filteredSummary : summary);

  return {
    ...snapshot,
    ...buildContentDeliverySummaryEnvelope({
      summary,
      filteredSummary,
      currentSummary,
      currentSummaryMode,
    }),
  };
}

function buildFilteredContentDeliverySummary(items = []) {
  const summary = createEmptyContentDeliverySummary();
  const actorHandles = new Set();
  const contentKeys = new Set();
  const replayableQueueItemIds = new Set();
  const uniqueActivityStatusMap = new Map();
  const deliveryRecords = [];

  for (const item of items) {
    if (item?.actorHandle) {
      actorHandles.add(item.actorHandle);
    }
    contentKeys.add([item?.actorHandle ?? "", item?.contentId ?? "", item?.threadId ?? ""].join("|"));
    for (const activity of item?.activities ?? []) {
      deliveryRecords.push(activity);
      const activityKey = activity?.activityId ?? `${item?.actorHandle ?? ""}:${activity?.objectId ?? item?.contentId ?? ""}`;
      uniqueActivityStatusMap.set(activityKey, activity?.delivery?.status ?? null);
      for (const queueItemId of activity?.delivery?.replayableQueueItemIds ?? []) {
        replayableQueueItemIds.add(queueItemId);
      }
    }
  }

  const deliverySummary = buildDeliveryStatusSummary(deliveryRecords);
  summary.actors = actorHandles.size;
  summary.contents = contentKeys.size;
  summary.contentsWithIssues = contentKeys.size;
  summary.activities = deliverySummary;
  summary.recipients = deliverySummary.recipients;
  summary.replayableItems = replayableQueueItemIds.size;
  summary.uniqueActivities.total = uniqueActivityStatusMap.size;
  for (const statusValue of uniqueActivityStatusMap.values()) {
    if (statusValue && statusValue in summary.uniqueActivities) {
      summary.uniqueActivities[statusValue] += 1;
    }
  }
  return summary;
}

function hasActiveContentDeliveryFilters({ status = null, replayedOnly = false, replayableOnly = false } = {}) {
  return Boolean((typeof status === "string" && status.trim()) || replayedOnly || replayableOnly);
}

function addContentDeliverySummary(target, source) {
  if (!source) {
    return target;
  }

  target.actors += source.actors ?? 0;
  target.contents += source.contents ?? 0;
  target.activities.total += source.activities?.total ?? 0;
  target.activities.delivered += source.activities?.delivered ?? 0;
  target.activities.pending += source.activities?.pending ?? 0;
  target.activities.retryPending += source.activities?.retryPending ?? 0;
  target.activities.deadLetter += source.activities?.deadLetter ?? 0;
  target.activities.partial += source.activities?.partial ?? 0;
  target.uniqueActivities.total += source.uniqueActivities?.total ?? 0;
  target.uniqueActivities.delivered += source.uniqueActivities?.delivered ?? 0;
  target.uniqueActivities.pending += source.uniqueActivities?.pending ?? 0;
  target.uniqueActivities.retryPending += source.uniqueActivities?.retryPending ?? 0;
  target.uniqueActivities.deadLetter += source.uniqueActivities?.deadLetter ?? 0;
  target.uniqueActivities.partial += source.uniqueActivities?.partial ?? 0;
  target.replayableItems += source.replayableItems ?? 0;
  target.contentsWithIssues += source.contentsWithIssues ?? 0;
  target.recipients.total += source.recipients?.total ?? 0;
  target.recipients.delivered += source.recipients?.delivered ?? 0;
  target.recipients.pending += source.recipients?.pending ?? 0;
  target.recipients.retryPending += source.recipients?.retryPending ?? 0;
  target.recipients.deadLetter += source.recipients?.deadLetter ?? 0;
  return target;
}

function mergeContentDeliveryItems(items, limit, keySelector) {
  const itemMap = new Map();

  for (const item of items) {
    const key = keySelector(item);
    const existing = itemMap.get(key) ?? null;
    if (!existing) {
      itemMap.set(key, {
        ...item,
        recipients: [...(item.recipients ?? [])],
        contentRefs: [...(item.contentRefs ?? [])],
      });
      continue;
    }

    existing.createdAt =
      [existing.createdAt, item.createdAt].filter(Boolean).sort().at(0) ?? existing.createdAt ?? null;
    existing.delivery = item.delivery ?? existing.delivery;
    existing.recipients = [
      ...(existing.recipients ?? []),
      ...(item.recipients ?? []),
    ].filter(
      (recipient, index, recipients) =>
        recipients.findIndex(
          (candidate) =>
            candidate.queueItemId === recipient.queueItemId && candidate.targetActorId === recipient.targetActorId,
        ) === index,
    );
    existing.contentRefs = [
      ...(existing.contentRefs ?? []),
      ...(item.contentRefs ?? []),
    ].filter(
      (ref, index, refs) =>
        refs.findIndex((candidate) => candidate.contentId === ref.contentId && candidate.threadId === ref.threadId) ===
        index,
    );
    itemMap.set(key, existing);
  }

  return [...itemMap.values()]
    .map((entry) => ({
      ...entry,
      contentRefs: (entry.contentRefs ?? []).sort((left, right) =>
        (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""),
      ),
    }))
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
    .slice(0, limit);
}

function buildContentDeliveryReplayKey(entry) {
  return [
    entry?.timestamp ?? "",
    entry?.actorHandle ?? "",
    entry?.itemId ?? "",
    entry?.replayedBy ?? "",
    entry?.reason ?? "",
    entry?.surface ?? "",
  ].join("|");
}

function buildContentDeliveryReviewItemOps(item, recentReplays = []) {
  const activities = item?.activities ?? [];
  const relatedQueueItemIds = [
    ...new Set(activities.flatMap((activity) => (activity.recipients ?? []).map((recipient) => recipient.queueItemId))),
  ].filter(Boolean);
  const replayableQueueItemIds = [...new Set(activities.flatMap((activity) => activity.delivery?.replayableQueueItemIds ?? []))];
  const relatedQueueItemLookup = new Set(relatedQueueItemIds);
  const relatedReplays = recentReplays.filter((entry) => entry?.itemId && relatedQueueItemLookup.has(entry.itemId));
  const staleSince =
    [...activities]
      .map((activity) => activity.createdAt ?? null)
      .filter(Boolean)
      .sort()
      .at(0) ?? null;

  return {
    replayableItems: replayableQueueItemIds.length,
    replayCount: relatedReplays.length,
    lastReplayAt:
      [...relatedReplays]
        .map((entry) => entry.timestamp ?? null)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    staleSince,
  };
}

function buildContentDeliveryActivityOps(item, recentReplays = []) {
  const recipients = item?.recipients ?? [];
  const relatedQueueItemIds = [...new Set(recipients.map((recipient) => recipient?.queueItemId).filter(Boolean))];
  const replayableQueueItemIds = [...new Set(item?.delivery?.replayableQueueItemIds ?? [])];
  const relatedQueueItemLookup = new Set(relatedQueueItemIds);
  const relatedReplays = recentReplays.filter((entry) => entry?.itemId && relatedQueueItemLookup.has(entry.itemId));

  return {
    replayableItems: replayableQueueItemIds.length,
    replayCount: relatedReplays.length,
    lastReplayAt:
      [...relatedReplays]
        .map((entry) => entry.timestamp ?? null)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  };
}

export function buildContentDeliveryRecentReplayItems(auditLog = [], { actorHandle = null, limit = 20 } = {}) {
  const items = auditLog
    .filter((entry) => entry?.event === "dead-letter.replayed")
    .filter((entry) => !actorHandle || entry.actorHandle === actorHandle)
    .map((entry) => ({
      timestamp: entry.timestamp ?? null,
      actorHandle: entry.actorHandle ?? null,
      itemId: entry.itemId ?? null,
      replayedBy: entry.replayedBy ?? null,
      reason: entry.reason ?? null,
      surface: entry.surface ?? null,
    }));

  return [...new Map(items.map((entry) => [buildContentDeliveryReplayKey(entry), entry])).values()]
    .sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? ""))
    .slice(0, limit);
}

export function buildContentDeliveryProjectionBundle({
  actorHandle,
  contents = [],
  outboundItems = [],
  recentReplays = [],
} = {}) {
  const normalizedActorHandle = actorHandle?.trim() || null;
  const contentItems = buildContentDeliveryProjectionItems({
    actorHandle: normalizedActorHandle,
    contents,
    outboundItems,
  });
  const review = buildContentDeliveryOpsSnapshot({
    actorHandle: normalizedActorHandle,
    actorHandles: normalizedActorHandle ? [normalizedActorHandle] : [],
    limit: Number.MAX_SAFE_INTEGER,
    getProjectionItemsForActor: () => contentItems,
    auditLog: recentReplays,
  });
  const activityIndex = buildUniqueContentDeliveryActivities({
    actorHandle: normalizedActorHandle,
    actorHandles: normalizedActorHandle ? [normalizedActorHandle] : [],
    limit: Number.MAX_SAFE_INTEGER,
    auditLog: recentReplays,
    getProjectionItemsForActor: () => contentItems,
  });

  return {
    actorHandle: normalizedActorHandle,
    generatedAt: new Date().toISOString(),
    contents: contentItems,
    review,
    activityIndex,
  };
}

export function combineContentDeliveryReviewSnapshots(
  snapshots = [],
  {
    actorHandle = null,
    limit = 20,
    status = null,
    replayedOnly = false,
    replayableOnly = false,
    recentReplayEntries = [],
  } = {},
) {
  const reviewSnapshots = snapshots
    .map((snapshot) => snapshot?.review ?? snapshot)
    .filter(Boolean);
  const summary = createEmptyContentDeliverySummary();
  const items = [];
  const recentReplays = [];

  for (const snapshot of reviewSnapshots) {
    addContentDeliverySummary(summary, snapshot.summary);
    items.push(...(snapshot.items ?? []));
    recentReplays.push(...(snapshot.recentReplays ?? []));
  }

  recentReplays.push(...recentReplayEntries);
  const filteredItems = status
    ? items.filter((item) => (item.activities ?? []).some((activity) => activity.delivery?.status === status))
    : items;
  const recentReplayItems = [
    ...new Map(recentReplays.map((entry) => [buildContentDeliveryReplayKey(entry), entry])).values(),
  ]
    .sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? ""))
    .slice(0, limit);
  const queueItems = filteredItems
    .map((item) => ({
      ...item,
      ops: buildContentDeliveryReviewItemOps(item, recentReplayItems),
    }))
    .filter((item) => {
      if (replayedOnly && !item.ops?.lastReplayAt) {
        return false;
      }
      if (replayableOnly && (item.ops?.replayableItems ?? 0) === 0) {
        return false;
      }
      return true;
    });
  const filteredSummary = buildFilteredContentDeliverySummary(queueItems);
  const currentSummary = hasActiveContentDeliveryFilters({ status, replayedOnly, replayableOnly })
    ? filteredSummary
    : summary;
  const currentSummaryMode = hasActiveContentDeliveryFilters({ status, replayedOnly, replayableOnly })
    ? "filtered"
    : "full";

  return {
    actorHandle: actorHandle?.trim() || null,
    appliedFilters: {
      actorHandle: actorHandle?.trim() || null,
      status: status?.trim() || null,
      replayedOnly,
      replayableOnly,
      limit,
    },
    ...buildContentDeliverySummaryEnvelope({
      summary,
      filteredSummary,
      currentSummary,
      currentSummaryMode,
    }),
    items: queueItems
      .sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? ""))
      .slice(0, limit),
    recentReplays: recentReplayItems,
  };
}

export function combineContentDeliveryActivityIndexes(
  snapshots = [],
  {
    actorHandle = null,
    limit = 20,
    status = null,
    actionType = null,
    activityId = null,
    replayedOnly = false,
    replayableOnly = false,
    recentReplayEntries = [],
  } = {},
) {
  const items = [];
  const recentReplays = [];

  for (const snapshot of snapshots) {
    const list = snapshot?.activityIndex?.items ?? snapshot?.items ?? [];
    items.push(...list);
    recentReplays.push(...(snapshot?.review?.recentReplays ?? []));
  }

  recentReplays.push(...recentReplayEntries);
  const recentReplayItems = [
    ...new Map(recentReplays.map((entry) => [buildContentDeliveryReplayKey(entry), entry])).values(),
  ]
    .sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? ""))
    .slice(0, limit);

  const filteredItems = items.filter((item) => {
    if (activityId && item.activityId !== activityId) {
      return false;
    }
    if (status && item.delivery?.status !== status) {
      return false;
    }
    if (actionType && item.actionType !== actionType) {
      return false;
    }
    return true;
  });

  const deduped = mergeContentDeliveryItems(
    filteredItems,
    limit,
    (item) => item.activityId ?? `${item.actorHandle}:${item.objectId}`,
  )
    .map((item) => ({
      ...item,
      ops: buildContentDeliveryActivityOps(item, recentReplayItems),
    }))
    .filter((item) => {
      if (replayedOnly && !item.ops?.lastReplayAt) {
        return false;
      }
      if (replayableOnly && (item.ops?.replayableItems ?? 0) === 0) {
        return false;
      }
      return true;
    });
  return {
    actorHandle: actorHandle?.trim() || null,
    summary: buildDeliveryStatusSummary(deduped.map((entry) => ({ delivery: entry.delivery }))),
    items: deduped,
  };
}

export function buildUniqueContentDeliveryActivities({
  actorHandles = [],
  getContentsForActor,
  getOutboundItemsForActor,
  getProjectionItemsForActor,
  actorHandle = null,
  limit = 20,
  status = null,
  actionType = null,
  activityId = null,
  replayedOnly = false,
  replayableOnly = false,
  auditLog = [],
} = {}) {
  const handles = actorHandle?.trim() ? [actorHandle.trim()] : actorHandles;
  const activityMap = new Map();
  const recentReplayItems = buildContentDeliveryRecentReplayItems(auditLog, { actorHandle, limit });

  for (const handle of handles) {
    const projectionItems = getProjectionItemsForActor
      ? getProjectionItemsForActor(handle)
      : buildContentDeliveryProjectionItems({
          actorHandle: handle,
          contents: getContentsForActor(handle),
          outboundItems: getOutboundItemsForActor(handle),
        });

    for (const content of projectionItems) {
      const records = content.activities ?? [];
      for (const record of records) {
        if (activityId && record.activityId !== activityId) {
          continue;
        }
        if (status && record.delivery.status !== status) {
          continue;
        }
        if (actionType && record.actionType !== actionType) {
          continue;
        }

        const key = record.activityId ?? `${handle}:${record.objectId ?? content.contentId}`;
        const existing = activityMap.get(key) ?? {
          actorHandle: handle,
          activityId: record.activityId,
          activityType: record.activityType,
          actionType: record.actionType,
          objectId: record.objectId,
          inReplyTo: record.inReplyTo,
          createdAt: record.createdAt,
          delivery: record.delivery,
          recipients: [...(record.recipients ?? [])],
          contentRefs: [],
        };
        existing.createdAt =
          [existing.createdAt, record.createdAt].filter(Boolean).sort().at(0) ?? existing.createdAt ?? null;
        existing.delivery = record.delivery;
        existing.recipients = [...(record.recipients ?? [])];
        existing.contentRefs.push({
          contentId: content.contentId,
          threadId: content.threadId,
          threadRootId: content.threadRootId,
          headline: content.headline,
          preview: content.preview,
          latestPublishedAt: content.latestPublishedAt ?? null,
        });
        activityMap.set(key, existing);
      }
    }
  }

  const items = [...activityMap.values()]
    .map((entry) => ({
      ...entry,
      ops: buildContentDeliveryActivityOps(entry, recentReplayItems),
      contentRefs: entry.contentRefs
        .filter(
          (ref, index, refs) =>
            refs.findIndex((candidate) => candidate.contentId === ref.contentId && candidate.threadId === ref.threadId) ===
            index,
        )
        .sort((left, right) => (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? "")),
    }))
    .filter((entry) => {
      if (replayedOnly && !entry.ops?.lastReplayAt) {
        return false;
      }
      if (replayableOnly && (entry.ops?.replayableItems ?? 0) === 0) {
        return false;
      }
      return true;
    })
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
    .slice(0, limit);

  return {
    actorHandle: actorHandle?.trim() || null,
    summary: buildDeliveryStatusSummary(items.map((entry) => ({ delivery: entry.delivery }))),
    items,
  };
}
