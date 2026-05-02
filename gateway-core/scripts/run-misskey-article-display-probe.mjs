import { readFile } from "node:fs/promises";

const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";

function parseArgs(argv) {
  const options = {
    send: false,
    confirmPublicCreate: false,
    slug: null,
    now: null,
    tokenFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--send") {
      options.send = true;
    } else if (arg === "--confirm-public-create") {
      options.confirmPublicCreate = true;
    } else if (arg === "--slug") {
      options.slug = argv[++index] ?? null;
    } else if (arg === "--now") {
      options.now = argv[++index] ?? null;
    } else if (arg === "--token-file") {
      options.tokenFile = argv[++index] ?? null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.send && !options.confirmPublicCreate) {
    throw new Error("--send requires --confirm-public-create because this publishes a public ActivityPub Create");
  }

  return options;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function buildUrl(baseUrl, pathname, params = null) {
  const url = new URL(pathname, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
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

async function readToken({ tokenFile, envValue }) {
  if (envValue?.trim()) {
    return envValue.trim();
  }
  if (!tokenFile) {
    throw new Error("MISSKEY_ACCESS_TOKEN or --token-file is required");
  }
  return (await readFile(tokenFile, "utf8")).trim();
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

async function postGatewayCreate({ gatewayPostBaseUrl, handle, payload }) {
  return fetchJson(
    buildUrl(gatewayPostBaseUrl, `/users/${handle}/outbox/create`),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "application/json",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let apShowError = null;
  try {
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
        user: apUser,
      };
    }
  } catch (error) {
    apShowError = error;
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
    method: apShowError ? "users/show-after-ap-show-error" : "users/show",
    apShowError: apShowError?.message ?? null,
    user,
  };
}

async function readGatewayFollowers({ gatewayProbeBaseUrl, handle }) {
  return fetchJson(
    buildUrl(gatewayProbeBaseUrl, `/users/${handle}/followers`),
    {
      headers: {
        accept: "application/activity+json",
      },
    },
    "application/activity+json",
  );
}

async function readMisskeyNotes({ misskeyBaseUrl, token, tokenMode, userId, limit }) {
  const result = await postMisskey({
    misskeyBaseUrl,
    endpoint: "users/notes",
    token,
    tokenMode,
    body: { userId, limit },
  });
  return Array.isArray(result) ? result : [];
}

function buildProbePayload({ gatewayPublicBaseUrl, handle, slug, now }) {
  const publicBaseUrl = normalizeBaseUrl(gatewayPublicBaseUrl);
  const objectId = `${publicBaseUrl}/articles/${slug}`;
  const title = `[STAGING] Matters Gateway W4a Misskey Article display probe ${slug}`;
  const content = [
    "<p>這是一則 staging-only 公開 ActivityPub Article，用來驗證 Misskey 是否會顯示 Matters Gateway 發出的長文 Article。</p>",
    "<p>測試範圍包含標題、摘要、HTML 段落、清單，以及原始連結保留；內容不含 token、私人資料或正式公告。</p>",
    "<h2>Display checklist</h2>",
    "<ul><li>Article object can be delivered after follow state exists.</li><li>Misskey users/notes can surface the delivered object.</li><li>Rendered text remains clearly marked as staging.</li></ul>",
    `<p>Canonical staging URL: <a href="${objectId}">${objectId}</a></p>`,
  ].join("");

  return {
    includeFollowers: true,
    object: {
      id: objectId,
      type: "Article",
      name: title,
      summary: "Staging-only public ActivityPub Article used to verify Misskey display behavior.",
      content,
      published: now.toISOString(),
      url: objectId,
      to: [PUBLIC_AUDIENCE],
      cc: [`${publicBaseUrl}/users/${handle}/followers`],
    },
  };
}

function noteMatchesProbe(note, probe) {
  const serialized = JSON.stringify(note);
  return serialized.includes(probe.object.id) || serialized.includes(probe.object.name);
}

async function pollMisskeyNotesForProbe({ misskeyBaseUrl, token, tokenMode, userId, probe, attempts, intervalMs }) {
  let latestNotes = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latestNotes = await readMisskeyNotes({
      misskeyBaseUrl,
      token,
      tokenMode,
      userId,
      limit: 20,
    });
    const match = latestNotes.find((note) => noteMatchesProbe(note, probe));
    if (match) {
      return { matched: true, note: match, notes: latestNotes };
    }
    await sleep(intervalMs);
  }

  return { matched: false, note: null, notes: latestNotes };
}

function summarizeNotes(notes) {
  return notes.map((note) => ({
    id: note.id ?? null,
    uri: note.uri ?? null,
    url: note.url ?? null,
    text: note.text ?? null,
    cw: note.cw ?? null,
    createdAt: note.createdAt ?? null,
  }));
}

export async function run(options) {
  const misskeyBaseUrl = getRequiredEnv("MISSKEY_BASE_URL");
  const misskeyAccessToken = await readToken({
    tokenFile: options.tokenFile,
    envValue: process.env.MISSKEY_ACCESS_TOKEN,
  });
  const misskeyTokenMode = process.env.MISSKEY_TOKEN_MODE?.trim() || "authorization";
  const gatewayPublicBaseUrl = normalizeBaseUrl(getRequiredEnv("GATEWAY_PUBLIC_BASE_URL"));
  const gatewayProbeBaseUrl = normalizeBaseUrl(process.env.GATEWAY_PROBE_BASE_URL?.trim() || gatewayPublicBaseUrl);
  const gatewayPostBaseUrl = normalizeBaseUrl(process.env.GATEWAY_POST_BASE_URL?.trim() || gatewayProbeBaseUrl);
  const gatewayHandle = process.env.GATEWAY_HANDLE?.trim() || "alice";
  const pollAttempts = Number.parseInt(process.env.MISSKEY_DISPLAY_POLL_ATTEMPTS ?? "10", 10);
  const pollIntervalMs = Number.parseInt(process.env.MISSKEY_DISPLAY_POLL_INTERVAL_MS ?? "3000", 10);

  if (!["authorization", "body", "both"].includes(misskeyTokenMode)) {
    throw new Error("MISSKEY_TOKEN_MODE must be authorization, body, or both");
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("--now must be a valid ISO timestamp");
  }
  const slug =
    options.slug ??
    `w4a-misskey-display-probe-${now.toISOString().replaceAll(/[-:.]/g, "").slice(0, 15).toLowerCase()}z`;
  const publicHost = new URL(gatewayPublicBaseUrl).host;
  const acctUri = `acct:${gatewayHandle}@${publicHost}`;
  const followers = await readGatewayFollowers({
    gatewayProbeBaseUrl,
    handle: gatewayHandle,
  });
  const resolvedAccount = await resolveRemoteAccount({
    misskeyBaseUrl,
    token: misskeyAccessToken,
    tokenMode: misskeyTokenMode,
    acctUri,
    username: gatewayHandle,
    host: publicHost,
  });
  const beforeNotes = await readMisskeyNotes({
    misskeyBaseUrl,
    token: misskeyAccessToken,
    tokenMode: misskeyTokenMode,
    userId: resolvedAccount.user.id,
    limit: 20,
  });
  const payload = buildProbePayload({
    gatewayPublicBaseUrl,
    handle: gatewayHandle,
    slug,
    now,
  });

  const failures = [];
  if ((followers.totalItems ?? 0) < 1 || !Array.isArray(followers.orderedItems) || followers.orderedItems.length < 1) {
    failures.push("gateway followers collection has no recipients");
  }

  let createResponse = null;
  let pollResult = null;
  if (options.send) {
    createResponse = await postGatewayCreate({
      gatewayPostBaseUrl,
      handle: gatewayHandle,
      payload,
    });
    pollResult = await pollMisskeyNotesForProbe({
      misskeyBaseUrl,
      token: misskeyAccessToken,
      tokenMode: misskeyTokenMode,
      userId: resolvedAccount.user.id,
      probe: payload,
      attempts: pollAttempts,
      intervalMs: pollIntervalMs,
    });
    if (!pollResult.matched) {
      failures.push("Misskey users/notes did not surface the probe Article within the poll window");
    }
  }

  return {
    ok: failures.length === 0,
    mode: options.send ? "send" : "dry-run",
    failures,
    publicActionRequired: !options.send,
    report: {
      gateway: {
        publicBaseUrl: gatewayPublicBaseUrl,
        probeBaseUrl: gatewayProbeBaseUrl,
        postBaseUrl: gatewayPostBaseUrl,
        handle: gatewayHandle,
        acctUri,
        followersTotalItems: followers.totalItems ?? null,
        followers: followers.orderedItems ?? [],
      },
      misskey: {
        baseUrl: misskeyBaseUrl,
        resolveMethod: resolvedAccount.method,
        apShowError: resolvedAccount.apShowError ?? null,
        resolvedUserId: resolvedAccount.user.id,
        resolvedUsername: resolvedAccount.user.username,
        resolvedHost: resolvedAccount.user.host,
        beforeNotes: summarizeNotes(beforeNotes),
        afterNotes: pollResult ? summarizeNotes(pollResult.notes) : null,
        matchedNote: pollResult?.note ? summarizeNotes([pollResult.note])[0] : null,
      },
      create: createResponse
        ? {
            status: createResponse.status,
            activityId: createResponse.activityId,
            recipients: createResponse.recipients ?? [],
            deliveries: createResponse.deliveries ?? [],
          }
        : null,
      plannedCreate: {
        endpoint: `${gatewayPostBaseUrl}/users/${gatewayHandle}/outbox/create`,
        objectId: payload.object.id,
        title: payload.object.name,
        summary: payload.object.summary,
        recipientMode: "include accepted followers",
        payload,
      },
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await run(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
