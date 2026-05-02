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

async function resolveRemoteAccount({ gotosocialBaseUrl, token, acctUri }) {
  const expectedAcct = acctUri.replace(/^acct:/, "");
  const result = await fetchJson(
    buildUrl(gotosocialBaseUrl, "/api/v2/search", {
      q: `@${expectedAcct}`,
      type: "accounts",
      resolve: "true",
      limit: "10",
    }),
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    "application/json",
  );

  if (!Array.isArray(result.accounts) || result.accounts.length === 0) {
    throw new Error(`GoToSocial search did not resolve ${acctUri}`);
  }

  const exactAccount = result.accounts.find((account) => normalizeAcct(account.acct) === normalizeAcct(expectedAcct));
  if (!exactAccount) {
    const returnedAccounts = result.accounts
      .map((account) => `${account.acct || "(unknown)"} ${account.url || ""}`.trim())
      .join(", ");
    throw new Error(`GoToSocial search did not resolve exact ${acctUri}; returned: ${returnedAccounts}`);
  }

  return exactAccount;
}

async function followRemoteAccount({ gotosocialBaseUrl, token, accountId }) {
  const body = new URLSearchParams();
  body.set("reblogs", "false");
  body.set("notify", "false");

  return fetchJson(
    buildUrl(gotosocialBaseUrl, `/api/v1/accounts/${accountId}/follow`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
    "application/json",
  );
}

async function pollRelationship({ gotosocialBaseUrl, token, accountId, attempts, intervalMs }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const relationships = await fetchJson(
      buildUrl(gotosocialBaseUrl, "/api/v1/accounts/relationships", {
        "id[]": [accountId],
      }),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
      "application/json",
    );
    const relationship = Array.isArray(relationships) ? relationships[0] : null;
    if (!relationship) {
      throw new Error(`No relationship returned for account ${accountId}`);
    }

    if (relationship.following || relationship.requested) {
      return relationship;
    }

    await sleep(intervalMs);
  }

  return null;
}

async function main() {
  const gotosocialBaseUrl = getRequiredEnv("GOTOSOCIAL_BASE_URL");
  const gotosocialAccessToken = getRequiredEnv("GOTOSOCIAL_ACCESS_TOKEN");
  const gotosocialOperatorProfileUrl = process.env.GOTOSOCIAL_OPERATOR_PROFILE_URL?.trim() || null;
  const gatewayPublicBaseUrl = getRequiredEnv("GATEWAY_PUBLIC_BASE_URL");
  const gatewayProbeBaseUrl = process.env.GATEWAY_PROBE_BASE_URL?.trim() || gatewayPublicBaseUrl;
  const gatewayHandle = process.env.GATEWAY_HANDLE?.trim() || "alice";
  const gatewayActorPath = normalizePath(process.env.GATEWAY_ACTOR_PATH?.trim() || `/users/${gatewayHandle}`);
  const pollAttempts = Number.parseInt(process.env.GOTOSOCIAL_RELATIONSHIP_POLL_ATTEMPTS ?? "10", 10);
  const pollIntervalMs = Number.parseInt(process.env.GOTOSOCIAL_RELATIONSHIP_POLL_INTERVAL_MS ?? "3000", 10);

  const publicHost = new URL(gatewayPublicBaseUrl).host;
  const acctUri = `acct:${gatewayHandle}@${publicHost}`;
  const gateway = await readGatewaySurface({
    probeBaseUrl: gatewayProbeBaseUrl,
    acctUri,
    actorPath: gatewayActorPath,
  });
  const resolvedAccount = await resolveRemoteAccount({
    gotosocialBaseUrl,
    token: gotosocialAccessToken,
    acctUri,
  });
  const followResponse = await followRemoteAccount({
    gotosocialBaseUrl,
    token: gotosocialAccessToken,
    accountId: resolvedAccount.id,
  });
  const relationship = await pollRelationship({
    gotosocialBaseUrl,
    token: gotosocialAccessToken,
    accountId: resolvedAccount.id,
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
  if (!resolvedAccount.id) {
    failures.push("gotosocial account resolution returned no account id");
  }
  if (normalizeAcct(resolvedAccount.acct) !== normalizeAcct(`${gatewayHandle}@${publicHost}`)) {
    failures.push(`gotosocial resolved ${resolvedAccount.acct} instead of ${gatewayHandle}@${publicHost}`);
  }
  if (!followResponse.following && !followResponse.requested) {
    failures.push("gotosocial follow response was neither following nor requested");
  }
  if (!relationship) {
    failures.push("relationship polling did not converge");
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
    gotosocial: {
      baseUrl: gotosocialBaseUrl,
      operatorProfileUrl: gotosocialOperatorProfileUrl,
      resolvedAccountId: resolvedAccount.id,
      resolvedAcct: resolvedAccount.acct,
      resolvedUrl: resolvedAccount.url,
      followResponse,
      relationship,
    },
  };

  process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, failures, report }, null, 2)}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
