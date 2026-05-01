import { normalizeArticleObject } from "./article-normalization.mjs";

const ACTIVITY_STREAMS = "https://www.w3.org/ns/activitystreams";
const SECURITY_V1 = "https://w3id.org/security/v1";
const PUBLIC_AUDIENCE = `${ACTIVITY_STREAMS}#Public`;

export function buildWebFinger({ instance, actor }) {
  return {
    subject: `acct:${actor.handle}@${instance.domain}`,
    aliases: [actor.profileUrl, ...actor.aliases],
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: actor.actorUrl,
      },
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: actor.profileUrl,
      },
    ],
  };
}

export function buildActorDocument({ instance, actor }) {
  const document = {
    "@context": [ACTIVITY_STREAMS, SECURITY_V1],
    id: actor.actorUrl,
    type: "Person",
    preferredUsername: actor.handle,
    name: actor.displayName,
    summary: actor.summary,
    url: actor.profileUrl,
    inbox: actor.inboxUrl,
    outbox: actor.outboxUrl,
    followers: actor.followersUrl,
    following: actor.followingUrl,
    alsoKnownAs: actor.aliases,
    manuallyApprovesFollowers: actor.autoAcceptFollows === false,
    endpoints: {
      sharedInbox: `${instance.baseUrl}/inbox`,
    },
    publicKey: {
      id: actor.keyId,
      owner: actor.actorUrl,
      publicKeyPem: actor.publicKeyPem,
    },
  };

  if (actor.previousPublicKeyPem && actor.previousKeyId) {
    document.previousPublicKey = {
      id: actor.previousKeyId,
      owner: actor.actorUrl,
      publicKeyPem: actor.previousPublicKeyPem,
    };
  }

  return document;
}

export function buildOrderedCollection({ id, items }) {
  return {
    "@context": ACTIVITY_STREAMS,
    id,
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items,
  };
}

export function buildHostMeta({ instance }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" template="${instance.baseUrl}/.well-known/webfinger?resource={uri}" />
</XRD>`;
}

export function buildNodeInfoDirectory({ instance }) {
  return {
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href: `${instance.baseUrl}/nodeinfo/2.1`,
      },
    ],
  };
}

export function buildNodeInfo({ instance, actors }) {
  return {
    version: "2.1",
    software: {
      name: instance.softwareName,
      version: instance.softwareVersion,
    },
    protocols: ["activitypub"],
    services: {
      inbound: [],
      outbound: [],
    },
    openRegistrations: instance.openRegistrations,
    usage: {
      users: {
        total: Object.keys(actors).length,
      },
    },
    metadata: {
      instanceTitle: instance.title,
      instanceSummary: instance.summary,
      slice: "gateway-core-minimum-slice",
      unsupportedContent: ["paid", "private", "encrypted"],
    },
  };
}

export function buildAcceptActivity({ actor, follow, now, instance }) {
  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-accept-${actor.handle}`,
    type: "Accept",
    actor: actor.actorUrl,
    object: follow,
  };
}

export function buildRejectActivity({ actor, follow, now, instance }) {
  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-reject-${actor.handle}`,
    type: "Reject",
    actor: actor.actorUrl,
    object: follow,
  };
}

export function buildDeleteActivity({ actor, objectId, now, instance }) {
  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-delete-${actor.handle}`,
    type: "Delete",
    actor: actor.actorUrl,
    to: [PUBLIC_AUDIENCE],
    cc: [actor.followersUrl],
    object: objectId,
  };
}

export function buildUpdateActivity({ actor, object, now, instance }) {
  const normalizedObject = normalizeArticleObject({ object, actor });

  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-update-${actor.handle}`,
    type: "Update",
    actor: actor.actorUrl,
    to: [PUBLIC_AUDIENCE],
    cc: [actor.followersUrl],
    object: {
      ...normalizedObject,
      attributedTo: normalizedObject.attributedTo ?? actor.actorUrl,
    },
  };
}

export function buildCreateActivity({ actor, object, now, instance, mentionTags = [], to = null, cc = null }) {
  const normalizedObject = normalizeArticleObject({ object, actor });
  const existingTags = Array.isArray(normalizedObject.tag) ? normalizedObject.tag : normalizedObject.tag ? [normalizedObject.tag] : [];
  const mergedTags = [...existingTags];
  const seenMentionHrefs = new Set(
    existingTags
      .filter((entry) => entry?.type === "Mention" && typeof entry.href === "string")
      .map((entry) => entry.href),
  );

  for (const mentionTag of mentionTags) {
    if (mentionTag.href && !seenMentionHrefs.has(mentionTag.href)) {
      mergedTags.push(mentionTag);
      seenMentionHrefs.add(mentionTag.href);
    }
  }

  const mentionCc = [
    actor.followersUrl,
    ...mentionTags.map((entry) => entry.href).filter(Boolean),
  ];
  const resolvedTo = Array.isArray(to) && to.length ? [...new Set(to)] : null;
  const resolvedCc = Array.isArray(cc) && cc.length ? [...new Set([...cc, ...mentionCc])] : [...new Set(mentionCc)];

  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-create-${actor.handle}`,
    type: "Create",
    actor: actor.actorUrl,
    to: resolvedTo ?? [PUBLIC_AUDIENCE],
    cc: resolvedCc,
    object: {
      ...normalizedObject,
      attributedTo: normalizedObject.attributedTo ?? actor.actorUrl,
      to: Array.isArray(normalizedObject.to) && normalizedObject.to.length ? normalizedObject.to : resolvedTo ?? [PUBLIC_AUDIENCE],
      cc: Array.isArray(normalizedObject.cc) && normalizedObject.cc.length ? [...new Set([...normalizedObject.cc, ...resolvedCc])] : resolvedCc,
      tag: mergedTags,
    },
  };
}

export function buildLikeActivity({ actor, objectId, now, instance, targetActorIds = [], to = null, cc = null }) {
  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-like-${actor.handle}`,
    type: "Like",
    actor: actor.actorUrl,
    to: [...new Set((to ?? targetActorIds).filter(Boolean))],
    ...(Array.isArray(cc) && cc.length ? { cc: [...new Set(cc.filter(Boolean))] } : {}),
    object: objectId,
  };
}

export function buildAnnounceActivity({ actor, objectId, now, instance, targetActorIds = [], to = null, cc = null }) {
  const resolvedCc =
    Array.isArray(cc) && cc.length ? [...new Set(cc.filter(Boolean))] : [...new Set([actor.followersUrl, ...targetActorIds.filter(Boolean)])];

  return {
    "@context": ACTIVITY_STREAMS,
    id: `${instance.baseUrl}/activities/${now.getTime()}-announce-${actor.handle}`,
    type: "Announce",
    actor: actor.actorUrl,
    to: Array.isArray(to) && to.length ? [...new Set(to.filter(Boolean))] : [PUBLIC_AUDIENCE],
    cc: resolvedCc,
    object: objectId,
  };
}
