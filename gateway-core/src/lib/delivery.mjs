import { signHttpRequest } from "../security/http-signatures.mjs";

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

function classifyDeliveryError(error) {
  if (error?.temporary === false) {
    return "permanent";
  }

  if (typeof error?.status === "number") {
    if (error.status >= 500 || error.status === 429) {
      return "temporary";
    }

    if (error.status >= 400) {
      return "permanent";
    }
  }

  return "temporary";
}

function buildEvidenceRecordId(now) {
  return `evidence-${now.getTime()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createFetchDeliveryClient({ userAgent }) {
  return {
    async deliver({ item, actor }) {
      const body = JSON.stringify(item.activity);
      const signedHeaders = signHttpRequest({
        method: "POST",
        url: item.targetInbox,
        body,
        keyId: actor.keyId,
        privateKeyPem: actor.privateKeyPem,
      });
      const response = await fetch(item.targetInbox, {
        method: "POST",
        headers: {
          "Content-Type": "application/activity+json",
          "User-Agent": userAgent,
          ...signedHeaders,
        },
        body,
      });

      if (response.ok || response.status === 202) {
        return {
          status: response.status,
        };
      }

      const error = new Error(`Delivery failed with status ${response.status}`);
      error.status = response.status;
      error.temporary = response.status >= 500 || response.status === 429;
      throw error;
    },
  };
}

export function createDeliveryProcessor({ store, deliveryClient, config, clock = () => new Date() }) {
  const evidenceRetentionDays =
    Number.isFinite(config.moderation?.evidenceRetentionDays) && config.moderation.evidenceRetentionDays > 0
      ? Math.floor(config.moderation.evidenceRetentionDays)
      : 365;

  async function recordEvidence({
    category,
    actorHandle,
    remoteActorId = null,
    remoteDomain = null,
    queueItemId,
    activityId = null,
    activityType = null,
    objectId = null,
    reason = null,
    surface = "outbound",
    snapshot = {},
  }) {
    if (!store.recordEvidence) {
      return;
    }

    const now = clock();
    await store.recordEvidence({
      id: buildEvidenceRecordId(now),
      status: "retained",
      category,
      actorHandle,
      remoteActorId,
      remoteDomain,
      queueItemId,
      activityId,
      activityType,
      objectId,
      reason,
      surface,
      retainedAt: now.toISOString(),
      retentionUntil: new Date(now.getTime() + evidenceRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
      snapshot,
    });
  }

  return {
    async process(itemId) {
      const existingItem = store.getOutboundItem(itemId);
      if (!existingItem) {
        throw new Error(`Unknown delivery item ${itemId}`);
      }

      if (existingItem.status !== "pending") {
        return existingItem;
      }

      const leasedAt = clock().toISOString();
      const leaseId = `${itemId}:${Date.parse(leasedAt)}:${Math.random().toString(16).slice(2, 10)}`;
      const item = await store.claimOutboundDelivery?.(itemId, {
        leaseId,
        leasedAt,
      });
      if (!item) {
        return store.getOutboundItem(itemId);
      }

      const targetDomain = getDomainFromUri(item.targetActorId) ?? getDomainFromUri(item.targetInbox);
      const remoteActorPolicy = store.getRemoteActorPolicy?.(item.targetActorId);
      if (remoteActorPolicy?.outboundAction === "deny") {
        const error = new Error(`Delivery blocked for remote actor ${item.targetActorId}`);
        error.temporary = false;
        await store.moveOutboundToDeadLetter(item.id, error);
        await store.recordTrace({
          timestamp: clock().toISOString(),
          direction: "outbound",
          event: "remote-actor-policy.blocked",
          itemId: item.id,
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          targetDomain,
          reason: remoteActorPolicy.reason,
        });
        await store.recordAuditEvent?.({
          timestamp: clock().toISOString(),
          event: "remote-actor-policy.outbound-enforced",
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          targetDomain,
          reason: remoteActorPolicy.reason,
          itemId: item.id,
        });
        await recordEvidence({
          category: "remote-actor-policy",
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          remoteDomain: targetDomain,
          queueItemId: item.id,
          activityId: item.activity?.id ?? null,
          activityType: item.activity?.type ?? null,
          objectId: typeof item.activity?.object === "string" ? item.activity.object : item.activity?.object?.id ?? null,
          reason: remoteActorPolicy.reason,
          snapshot: {
            action: "deny",
            surface: "outbound",
            policy: remoteActorPolicy,
            item: store.getOutboundItem(item.id),
          },
        });
        return store.getOutboundItem(item.id);
      }

      const domainBlock = targetDomain ? store.getDomainBlock?.(targetDomain) : null;
      if (domainBlock) {
        const error = new Error(`Delivery blocked for domain ${targetDomain}`);
        error.temporary = false;
        await store.moveOutboundToDeadLetter(item.id, error);
        await store.recordTrace({
          timestamp: clock().toISOString(),
          direction: "outbound",
          event: "delivery.blocked",
          itemId: item.id,
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          targetDomain,
          reason: domainBlock.reason,
        });
        await store.recordAuditEvent?.({
          timestamp: clock().toISOString(),
          event: "domain-block.outbound-enforced",
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          targetDomain,
          reason: domainBlock.reason,
          itemId: item.id,
        });
        await recordEvidence({
          category: "delivery-dead-letter",
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          remoteDomain: targetDomain,
          queueItemId: item.id,
          activityId: item.activity?.id ?? null,
          activityType: item.activity?.type ?? null,
          objectId: typeof item.activity?.object === "string" ? item.activity.object : item.activity?.object?.id ?? null,
          reason: domainBlock.reason,
          snapshot: {
            disposition: "domain-block",
            item: store.getOutboundItem(item.id),
            domainBlock,
          },
        });
        return store.getOutboundItem(item.id);
      }

      const actor = config.actors[item.actorHandle];
      if (!actor?.privateKeyPem?.trim()) {
        const error = new Error(`Missing private key for actor ${item.actorHandle}`);
        error.temporary = false;
        await store.moveOutboundToDeadLetter(item.id, error);
        await store.recordTrace({
          timestamp: clock().toISOString(),
          direction: "outbound",
          event: "delivery.dead-letter",
          itemId: item.id,
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          reason: error.message,
        });
        await recordEvidence({
          category: "delivery-dead-letter",
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          remoteDomain: targetDomain,
          queueItemId: item.id,
          activityId: item.activity?.id ?? null,
          activityType: item.activity?.type ?? null,
          objectId: typeof item.activity?.object === "string" ? item.activity.object : item.activity?.object?.id ?? null,
          reason: error.message,
          snapshot: {
            disposition: "missing-private-key",
            item: store.getOutboundItem(item.id),
          },
        });
        return store.getOutboundItem(item.id);
      }

      try {
        const result = await deliveryClient.deliver({ item, actor });
        await store.markOutboundDelivered(item.id, {
          lastStatusCode: result.status ?? 202,
        });
        await store.recordTrace({
          timestamp: clock().toISOString(),
          direction: "outbound",
          event: "delivery.delivered",
          itemId: item.id,
          actorHandle: item.actorHandle,
          remoteActorId: item.targetActorId,
          statusCode: result.status ?? 202,
        });
      } catch (error) {
        const errorKind = classifyDeliveryError(error);
        const currentAttempts = store.getOutboundItem(item.id)?.attempts ?? 0;
        const maxAttempts = config.delivery.maxAttempts ?? 2;

        if (errorKind === "temporary" && currentAttempts + 1 < maxAttempts) {
          await store.markOutboundRetryable(item.id, error);
          await store.recordTrace({
            timestamp: clock().toISOString(),
            direction: "outbound",
            event: "delivery.retry-scheduled",
            itemId: item.id,
            actorHandle: item.actorHandle,
            remoteActorId: item.targetActorId,
            reason: error.message,
          });
        } else {
          await store.moveOutboundToDeadLetter(item.id, error);
          await store.recordTrace({
            timestamp: clock().toISOString(),
            direction: "outbound",
            event: "delivery.dead-letter",
            itemId: item.id,
            actorHandle: item.actorHandle,
            remoteActorId: item.targetActorId,
            reason: error.message,
          });
          await recordEvidence({
            category: "delivery-dead-letter",
            actorHandle: item.actorHandle,
            remoteActorId: item.targetActorId,
            remoteDomain: targetDomain,
            queueItemId: item.id,
            activityId: item.activity?.id ?? null,
            activityType: item.activity?.type ?? null,
            objectId: typeof item.activity?.object === "string" ? item.activity.object : item.activity?.object?.id ?? null,
            reason: error.message,
            snapshot: {
              disposition: errorKind,
              item: store.getOutboundItem(item.id),
              error: {
                message: error.message,
                status: error.status ?? null,
              },
            },
          });
        }
      }

      return store.getOutboundItem(item.id);
    },
  };
}
