function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function buildUrl(baseUrl, pathname, params = null) {
  const url = new URL(pathname, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          url.searchParams.append(key, entry);
        }
      } else if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function fetchJson(url, options = {}, expectedContentType = null) {
  const response = await fetch(url, options);
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed with ${response.status} ${bodyText}`);
  }

  if (expectedContentType && !response.headers.get("content-type")?.includes(expectedContentType)) {
    throw new Error(
      `${options.method ?? "GET"} ${url} returned unexpected content type ${response.headers.get("content-type")}`,
    );
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

async function postMisskey({ misskeyBaseUrl, endpoint, token, body = {}, tokenMode = "authorization" }) {
  const headers = {
    "content-type": "application/json",
  };
  const payload = { ...body };

  if (tokenMode === "authorization" || tokenMode === "both") {
    headers.authorization = `Bearer ${token}`;
  }
  if (tokenMode === "body" || tokenMode === "both") {
    payload.i = token;
  }

  return fetchJson(
    buildUrl(misskeyBaseUrl, `/api/${endpoint.replace(/^\/+/, "")}`),
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    "application/json",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAcct(value) {
  return value?.replace(/^@/, "").toLowerCase();
}

function normalizePath(pathname) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/$/, "");
}

async function readGatewaySurface({ probeBaseUrl, acctUri, actorPath }) {
  const webfinger = await fetchJson(
    buildUrl(probeBaseUrl, "/.well-known/webfinger", { resource: acctUri }),
    {},
    "application/jrd+json",
  );
  const actor = await fetchJson(
    buildUrl(probeBaseUrl, actorPath),
    {
      headers: {
        accept: [
          "application/activity+json",
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        ].join(", "),
      },
    },
    "application/activity+json",
  );
  const outbox = await fetchJson(
    buildUrl(probeBaseUrl, `${actorPath}/outbox`),
    {
      headers: {
        accept: [
          "application/activity+json",
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        ].join(", "),
      },
    },
    "application/activity+json",
  );

  return { webfinger, actor, outbox };
}

function extractMisskeyUser(payload) {
  const candidates = [
    payload?.object,
    payload?.user,
    payload?.value,
    payload,
  ].filter(Boolean);

  return candidates.find((candidate) => candidate.id && candidate.username) ?? null;
}

async function resolveRemoteAccount({ misskeyBaseUrl, token, tokenMode, acctUri, username, host }) {
  const apShow = await postMisskey({
    misskeyBaseUrl,
    endpoint: "ap/show",
    token,
    tokenMode,
    body: { uri: acctUri },
  });
  const apUser = extractMisskeyUser(apShow);
  if (apUser?.id) {
    return {
      method: "ap/show",
      rawType: apShow?.type ?? null,
      user: apUser,
    };
  }

  const shownUser = await postMisskey({
    misskeyBaseUrl,
    endpoint: "users/show",
    token,
    tokenMode,
    body: { username, host },
  });
  const user = extractMisskeyUser(shownUser);
  if (!user?.id) {
    throw new Error(`Misskey could not resolve ${acctUri}`);
  }

  return {
    method: "users/show",
    rawType: null,
    user,
  };
}

async function followRemoteAccount({ misskeyBaseUrl, token, tokenMode, userId }) {
  return postMisskey({
    misskeyBaseUrl,
    endpoint: "following/create",
    token,
    tokenMode,
    body: { userId },
  });
}

function relationIsConverged(relation) {
  return Boolean(
    relation?.isFollowing ||
      relation?.hasPendingFollowRequestFromYou ||
      relation?.isFollowed ||
      relation?.following ||
      relation?.requested,
  );
}

async function pollRelation({ misskeyBaseUrl, token, tokenMode, userId, attempts, intervalMs }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await postMisskey({
      misskeyBaseUrl,
      endpoint: "users/relation",
      token,
      tokenMode,
      body: { userId },
    });
    const relation = Array.isArray(result) ? result[0] : result;
    if (!relation) {
      throw new Error(`No Misskey relation returned for user ${userId}`);
    }
    if (relationIsConverged(relation)) {
      return relation;
    }
    await sleep(intervalMs);
  }

  return null;
}

async function main() {
  const misskeyBaseUrl = getRequiredEnv("MISSKEY_BASE_URL");
  const misskeyAccessToken = getRequiredEnv("MISSKEY_ACCESS_TOKEN");
  const misskeyOperatorProfileUrl = process.env.MISSKEY_OPERATOR_PROFILE_URL?.trim() || null;
  const misskeyTokenMode = process.env.MISSKEY_TOKEN_MODE?.trim() || "authorization";
  const gatewayPublicBaseUrl = getRequiredEnv("GATEWAY_PUBLIC_BASE_URL");
  const gatewayProbeBaseUrl = process.env.GATEWAY_PROBE_BASE_URL?.trim() || gatewayPublicBaseUrl;
  const gatewayHandle = process.env.GATEWAY_HANDLE?.trim() || "alice";
  const gatewayActorPath = normalizePath(process.env.GATEWAY_ACTOR_PATH?.trim() || `/users/${gatewayHandle}`);
  const pollAttempts = Number.parseInt(process.env.MISSKEY_RELATION_POLL_ATTEMPTS ?? "10", 10);
  const pollIntervalMs = Number.parseInt(process.env.MISSKEY_RELATION_POLL_INTERVAL_MS ?? "3000", 10);

  if (!["authorization", "body", "both"].includes(misskeyTokenMode)) {
    throw new Error("MISSKEY_TOKEN_MODE must be authorization, body, or both");
  }

  const publicHost = new URL(gatewayPublicBaseUrl).host;
  const acctUri = `acct:${gatewayHandle}@${publicHost}`;
  const gateway = await readGatewaySurface({
    probeBaseUrl: gatewayProbeBaseUrl,
    acctUri,
    actorPath: gatewayActorPath,
  });
  const resolvedAccount = await resolveRemoteAccount({
    misskeyBaseUrl,
    token: misskeyAccessToken,
    tokenMode: misskeyTokenMode,
    acctUri,
    username: gatewayHandle,
    host: publicHost,
  });
  const followResponse = await followRemoteAccount({
    misskeyBaseUrl,
    token: misskeyAccessToken,
    tokenMode: misskeyTokenMode,
    userId: resolvedAccount.user.id,
  });
  const relation = await pollRelation({
    misskeyBaseUrl,
    token: misskeyAccessToken,
    tokenMode: misskeyTokenMode,
    userId: resolvedAccount.user.id,
    attempts: pollAttempts,
    intervalMs: pollIntervalMs,
  });

  const failures = [];
  const canonicalActorUrl = `${gatewayPublicBaseUrl.replace(/\/$/, "")}${gatewayActorPath}`;
  if (gateway.webfinger.subject !== acctUri) {
    failures.push("webfinger subject mismatch");
  }
  if (gateway.actor.id !== canonicalActorUrl) {
    failures.push("actor id mismatch");
  }
  if (gateway.outbox.id !== `${canonicalActorUrl}/outbox`) {
    failures.push("outbox id mismatch");
  }
  if (gateway.outbox.orderedItems?.[0]?.actor !== canonicalActorUrl) {
    failures.push("outbox actor was not rewritten to canonical actor");
  }
  if (!resolvedAccount.user.id) {
    failures.push("misskey account resolution returned no user id");
  }
  if (normalizeAcct(`${resolvedAccount.user.username}@${resolvedAccount.user.host}`) !== normalizeAcct(`${gatewayHandle}@${publicHost}`)) {
    failures.push(`misskey resolved ${resolvedAccount.user.username}@${resolvedAccount.user.host} instead of ${gatewayHandle}@${publicHost}`);
  }
  if (!relation) {
    failures.push("misskey relationship polling did not converge");
  }

  const report = {
    discovery: {
      subject: gateway.webfinger.subject,
      actorHref: gateway.webfinger.links.find((link) => link.rel === "self")?.href ?? null,
      actorId: gateway.actor.id,
      followers: gateway.actor.followers,
      outboxId: gateway.outbox.id,
      outboxTotalItems: gateway.outbox.totalItems,
      outboxFirstActor: gateway.outbox.orderedItems?.[0]?.actor ?? null,
    },
    misskey: {
      baseUrl: misskeyBaseUrl,
      operatorProfileUrl: misskeyOperatorProfileUrl,
      resolveMethod: resolvedAccount.method,
      resolvedUserId: resolvedAccount.user.id,
      resolvedUsername: resolvedAccount.user.username,
      resolvedHost: resolvedAccount.user.host,
      resolvedUrl: resolvedAccount.user.url ?? resolvedAccount.user.uri ?? null,
      followResponse: {
        id: followResponse?.id ?? null,
        username: followResponse?.username ?? null,
        host: followResponse?.host ?? null,
      },
      relation,
    },
  };

  process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2)}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
