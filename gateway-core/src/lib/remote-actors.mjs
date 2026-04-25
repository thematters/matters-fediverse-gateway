function isUsableRecord(record) {
  return Boolean(
    record?.actorId?.trim() &&
      record?.inbox?.trim() &&
      record?.publicKeyPem?.trim(),
  );
}

function createRemoteActorResolutionError(message, { code, stage, status = null, temporary = null, cause = null } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code ?? "remote_actor_resolution_error";
  error.stage = stage ?? "remote_actor_resolution";
  if (typeof status === "number") {
    error.status = status;
  }
  if (typeof temporary === "boolean") {
    error.temporary = temporary;
  }
  return error;
}

function isTemporaryStatus(status) {
  return status >= 500 || status === 429;
}

export function classifyRemoteActorResolutionError(error) {
  if (error?.temporary === false) {
    return {
      status: "permanent_error",
      code: error.code ?? "remote_actor_resolution_error",
      stage: error.stage ?? "remote_actor_resolution",
      statusCode: typeof error.status === "number" ? error.status : null,
      message: error.message ?? null,
      retryable: false,
    };
  }

  if (typeof error?.status === "number") {
    return {
      status: isTemporaryStatus(error.status) ? "retryable_error" : "permanent_error",
      code: error.code ?? "remote_actor_resolution_error",
      stage: error.stage ?? "remote_actor_resolution",
      statusCode: error.status,
      message: error.message ?? null,
      retryable: isTemporaryStatus(error.status),
    };
  }

  return {
    status: "retryable_error",
    code: error?.code ?? "remote_actor_resolution_error",
    stage: error?.stage ?? "remote_actor_resolution",
    statusCode: null,
    message: error?.message ?? null,
    retryable: true,
  };
}

function parseAccount(value) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.startsWith("acct:") ? value.slice(5) : value;
  const withoutAt = normalized.startsWith("@") ? normalized.slice(1) : normalized;
  const [handle, domain] = withoutAt.split("@");
  if (!handle || !domain) {
    return null;
  }

  return {
    handle,
    domain,
    resource: `acct:${handle}@${domain}`,
    acct: `@${handle}@${domain}`,
  };
}

function normalizeRemoteActor({ actorId, actorDocument, source, discoveredAt }) {
  const publicKey = Array.isArray(actorDocument.publicKey)
    ? actorDocument.publicKey[0]
    : actorDocument.publicKey;

  const normalized = {
    actorId: actorDocument.id ?? actorId,
    keyId: publicKey?.id ?? `${actorDocument.id ?? actorId}#main-key`,
    inbox: actorDocument.inbox ?? "",
    sharedInbox: actorDocument.endpoints?.sharedInbox ?? null,
    publicKeyPem: publicKey?.publicKeyPem ?? "",
    source,
    discoveredAt,
  };

  if (!isUsableRecord(normalized)) {
    throw createRemoteActorResolutionError(`Remote actor document for ${actorId} is incomplete`, {
      code: "actor_document_invalid",
      stage: "actor_document",
      temporary: false,
    });
  }

  if (normalized.actorId !== actorId) {
    throw createRemoteActorResolutionError(`Remote actor ID mismatch for ${actorId}`, {
      code: "actor_id_mismatch",
      stage: "actor_document",
      temporary: false,
    });
  }

  return normalized;
}

export async function loadRemoteActorDocument(actorId, fetchImpl = fetch) {
  let response;

  try {
    response = await fetchImpl(actorId, {
      headers: {
        accept: [
          "application/activity+json",
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        ].join(", "),
      },
    });
  } catch (error) {
    throw createRemoteActorResolutionError(`Failed to load remote actor ${actorId}`, {
      code: "actor_document_network_error",
      stage: "actor_document",
      temporary: true,
      cause: error,
    });
  }

  if (!response.ok) {
    throw createRemoteActorResolutionError(`Failed to load remote actor ${actorId} with status ${response.status}`, {
      code: "actor_document_http_error",
      stage: "actor_document",
      status: response.status,
      temporary: isTemporaryStatus(response.status),
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw createRemoteActorResolutionError(`Remote actor ${actorId} returned invalid JSON`, {
      code: "actor_document_invalid_json",
      stage: "actor_document",
      temporary: false,
      cause: error,
    });
  }
}

export async function loadRemoteActorIdFromAccount(account, fetchImpl = fetch) {
  const parsed = parseAccount(account);
  if (!parsed) {
    throw createRemoteActorResolutionError(`Invalid remote account ${account}`, {
      code: "invalid_account",
      stage: "webfinger",
      temporary: false,
    });
  }

  const webFingerUrl = new URL(`https://${parsed.domain}/.well-known/webfinger`);
  webFingerUrl.searchParams.set("resource", parsed.resource);

  let response;

  try {
    response = await fetchImpl(webFingerUrl, {
      headers: {
        accept: "application/jrd+json, application/json",
      },
    });
  } catch (error) {
    throw createRemoteActorResolutionError(`Failed to resolve remote account ${parsed.acct}`, {
      code: "webfinger_network_error",
      stage: "webfinger",
      temporary: true,
      cause: error,
    });
  }

  if (!response.ok) {
    throw createRemoteActorResolutionError(
      `Failed to resolve remote account ${parsed.acct} with status ${response.status}`,
      {
        code: "webfinger_http_error",
        stage: "webfinger",
        status: response.status,
        temporary: isTemporaryStatus(response.status),
      },
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw createRemoteActorResolutionError(`Remote account ${parsed.acct} returned invalid WebFinger JSON`, {
      code: "webfinger_invalid_json",
      stage: "webfinger",
      temporary: false,
      cause: error,
    });
  }

  const actorLink = (payload.links ?? []).find((entry) => entry.rel === "self" && typeof entry.href === "string" && entry.href.trim());
  if (!actorLink?.href) {
    throw createRemoteActorResolutionError(
      `Remote account ${parsed.acct} did not expose an ActivityPub actor link`,
      {
        code: "webfinger_missing_actor_link",
        stage: "webfinger",
        temporary: false,
      },
    );
  }

  return actorLink.href;
}

export function createRemoteActorDirectory({
  seedActors = {},
  store,
  actorDocumentLoader = loadRemoteActorDocument,
  accountResolver = loadRemoteActorIdFromAccount,
  cacheTtlMs = 60 * 60 * 1000,
  clock = () => new Date(),
}) {
  async function saveRecord(record) {
    if (store?.upsertRemoteActor) {
      await store.upsertRemoteActor(record.actorId, record);
    }

    return record;
  }

  function getSeedRecord(actorId) {
    const seed = seedActors[actorId];
    if (!seed) {
      return null;
    }

    const normalizedSeed = {
      actorId,
      keyId: seed.keyId ?? `${actorId}#main-key`,
      inbox: seed.inbox ?? "",
      sharedInbox: seed.sharedInbox ?? null,
      publicKeyPem: seed.publicKeyPem ?? "",
      source: "seed",
      discoveredAt: seed.discoveredAt ?? null,
    };

    return isUsableRecord(normalizedSeed) ? normalizedSeed : null;
  }

  function getCachedRecord(actorId) {
    const cached = store?.getRemoteActor?.(actorId) ?? null;
    if (!isUsableRecord(cached)) {
      return null;
    }

    if (!cached.discoveredAt) {
      return cached;
    }

    const ageMs = clock().getTime() - new Date(cached.discoveredAt).getTime();
    return ageMs <= cacheTtlMs ? cached : null;
  }

  async function discover(actorId, source) {
    const actorDocument = await actorDocumentLoader(actorId);
    const record = normalizeRemoteActor({
      actorId,
      actorDocument,
      source,
      discoveredAt: clock().toISOString(),
    });
    return saveRecord(record);
  }

  return {
    async resolve(actorId) {
      if (!actorId?.trim()) {
        throw new Error("Remote actor ID is required");
      }

      const cached = getCachedRecord(actorId);
      if (cached) {
        return cached;
      }

      const seeded = getSeedRecord(actorId);
      if (seeded) {
        return seeded;
      }

      return discover(actorId, "discovered");
    },

    async refresh(actorId) {
      if (!actorId?.trim()) {
        throw new Error("Remote actor ID is required");
      }

      return discover(actorId, "refreshed");
    },

    async resolveAccount(account) {
      const actorId = await accountResolver(account);
      return this.resolve(actorId);
    },
  };
}
