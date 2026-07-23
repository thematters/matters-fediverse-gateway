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

function normalizePublicKeyEntry(value) {
  if (Array.isArray(value)) {
    return value.find((entry) => entry?.publicKeyPem?.trim()) ?? null;
  }

  return value?.publicKeyPem?.trim() ? value : null;
}

function normalizeRemoteActor({ actorId, actorDocument, source, discoveredAt }) {
  const publicKey = normalizePublicKeyEntry(actorDocument.publicKey);
  const previousPublicKey = normalizePublicKeyEntry(actorDocument.previousPublicKey);

  const normalized = {
    actorId: actorDocument.id ?? actorId,
    preferredUsername: actorDocument.preferredUsername ?? null,
    name: actorDocument.name ?? actorDocument.preferredUsername ?? null,
    summary: actorDocument.summary ?? "",
    url:
      typeof actorDocument.url === "string"
        ? actorDocument.url
        : actorDocument.url?.href ?? actorDocument.id ?? actorId,
    avatarUrl:
      typeof actorDocument.icon === "string"
        ? actorDocument.icon
        : actorDocument.icon?.url ?? null,
    headerUrl:
      typeof actorDocument.image === "string"
        ? actorDocument.image
        : actorDocument.image?.url ?? null,
    keyId: publicKey?.id ?? `${actorDocument.id ?? actorId}#main-key`,
    inbox: actorDocument.inbox ?? "",
    sharedInbox: actorDocument.endpoints?.sharedInbox ?? null,
    publicKeyPem: publicKey?.publicKeyPem ?? "",
    previousKeyId: previousPublicKey?.id ?? null,
    previousPublicKeyPem: previousPublicKey?.publicKeyPem ?? null,
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

function normalizeRemoteActorFromSignatureKey({ actorId, keyId, keyDocument, source, discoveredAt }) {
  const documentKey =
    keyDocument.id === keyId && keyDocument.publicKeyPem?.trim()
      ? keyDocument
      : normalizePublicKeyEntry(keyDocument.publicKey);
  const owner = documentKey?.owner ?? documentKey?.controller ?? keyDocument.owner ?? keyDocument.controller ?? null;
  const documentActorId = keyDocument.type === "Person" || keyDocument.type === "Service" || keyDocument.inbox
    ? keyDocument.id
    : owner;

  if (documentActorId !== actorId) {
    throw createRemoteActorResolutionError(`Signature key document actor mismatch for ${actorId}`, {
      code: "signature_key_actor_mismatch",
      stage: "signature_key_document",
      temporary: false,
    });
  }

  if (owner && owner !== actorId) {
    throw createRemoteActorResolutionError(`Signature key owner mismatch for ${actorId}`, {
      code: "signature_key_owner_mismatch",
      stage: "signature_key_document",
      temporary: false,
    });
  }

  if (documentKey?.id !== keyId) {
    throw createRemoteActorResolutionError(`Signature key id mismatch for ${actorId}`, {
      code: "signature_key_id_mismatch",
      stage: "signature_key_document",
      temporary: false,
    });
  }

  const normalized = {
    actorId,
    keyId,
    inbox: keyDocument.inbox ?? "",
    sharedInbox: keyDocument.endpoints?.sharedInbox ?? null,
    publicKeyPem: documentKey.publicKeyPem ?? "",
    previousKeyId: null,
    previousPublicKeyPem: null,
    source,
    discoveredAt,
  };

  if (!isUsableRecord(normalized)) {
    throw createRemoteActorResolutionError(`Signature key document for ${actorId} is incomplete`, {
      code: "signature_key_document_invalid",
      stage: "signature_key_document",
      temporary: false,
    });
  }

  return normalized;
}

export async function loadRemoteActorDocument(actorId, fetchImpl = fetch, { signedFetchHeaders = null } = {}) {
  let response;
  const headers = {
    accept: [
      "application/activity+json",
      'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    ].join(", "),
    ...(signedFetchHeaders ? signedFetchHeaders(actorId) : {}),
  };

  try {
    response = await fetchImpl(actorId, {
      headers,
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
      preferredUsername: seed.preferredUsername ?? null,
      name: seed.name ?? seed.preferredUsername ?? null,
      summary: seed.summary ?? "",
      url: seed.url ?? actorId,
      avatarUrl: seed.avatarUrl ?? null,
      headerUrl: seed.headerUrl ?? null,
      keyId: seed.keyId ?? `${actorId}#main-key`,
      inbox: seed.inbox ?? "",
      sharedInbox: seed.sharedInbox ?? null,
      publicKeyPem: seed.publicKeyPem ?? "",
      previousKeyId: seed.previousKeyId ?? null,
      previousPublicKeyPem: seed.previousPublicKeyPem ?? null,
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

  async function discoverBySignatureKey(actorId, keyId) {
    const keyDocument = await actorDocumentLoader(keyId);
    const record = normalizeRemoteActorFromSignatureKey({
      actorId,
      keyId,
      keyDocument,
      source: "signature-key",
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

    async resolveBySignatureKey(actorId, keyId) {
      if (!actorId?.trim()) {
        throw new Error("Remote actor ID is required");
      }
      if (!keyId?.trim()) {
        throw new Error("Signature key ID is required");
      }

      const cached = getCachedRecord(actorId);
      if (cached?.keyId === keyId || cached?.previousKeyId === keyId) {
        return cached;
      }

      const seeded = getSeedRecord(actorId);
      if (seeded?.keyId === keyId || seeded?.previousKeyId === keyId) {
        return seeded;
      }

      return discoverBySignatureKey(actorId, keyId);
    },
  };
}
