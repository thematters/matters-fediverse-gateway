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

async function readGatewaySurface({ probeBaseUrl, acctUri, handle }) {
  const webfinger = await fetchJson(
    buildUrl(probeBaseUrl, "/.well-known/webfinger", { resource: acctUri }),
    {},
    "application/jrd+json",
  );
  const actor = await fetchJson(
    buildUrl(probeBaseUrl, `/users/${handle}`),
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
    buildUrl(probeBaseUrl, `/users/${handle}/outbox`),
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

async function resolveRemoteAccount({ mastodonBaseUrl, token, acctUri }) {
  const result = await fetchJson(
    buildUrl(mastodonBaseUrl, "/api/v2/search", {
      q: acctUri.replace(/^acct:/, ""),
      type: "accounts",
      resolve: "true",
    }),
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    "application/json",
  );

  if (!Array.isArray(result.accounts) || result.accounts.length === 0) {
    throw new Error(`Mastodon search did not resolve ${acctUri}`);
  }

  return result.accounts[0];
}

async function followRemoteAccount({ mastodonBaseUrl, token, accountId }) {
  const body = new URLSearchParams();
  body.set("reblogs", "false");
  body.set("notify", "false");

  return fetchJson(
    buildUrl(mastodonBaseUrl, `/api/v1/accounts/${accountId}/follow`),
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

async function pollRelationship({ mastodonBaseUrl, token, accountId, attempts, intervalMs }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const relationships = await fetchJson(
      buildUrl(mastodonBaseUrl, "/api/v1/accounts/relationships", {
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
  const mastodonBaseUrl = getRequiredEnv("MASTODON_BASE_URL");
  const mastodonAccessToken = getRequiredEnv("MASTODON_ACCESS_TOKEN");
  const gatewayPublicBaseUrl = getRequiredEnv("GATEWAY_PUBLIC_BASE_URL");
  const gatewayProbeBaseUrl = process.env.GATEWAY_PROBE_BASE_URL?.trim() || gatewayPublicBaseUrl;
  const gatewayHandle = process.env.GATEWAY_HANDLE?.trim() || "alice";
  const pollAttempts = Number.parseInt(process.env.MASTODON_RELATIONSHIP_POLL_ATTEMPTS ?? "10", 10);
  const pollIntervalMs = Number.parseInt(process.env.MASTODON_RELATIONSHIP_POLL_INTERVAL_MS ?? "3000", 10);

  const publicHost = new URL(gatewayPublicBaseUrl).host;
  const acctUri = `acct:${gatewayHandle}@${publicHost}`;
  const gateway = await readGatewaySurface({
    probeBaseUrl: gatewayProbeBaseUrl,
    acctUri,
    handle: gatewayHandle,
  });
  const resolvedAccount = await resolveRemoteAccount({
    mastodonBaseUrl,
    token: mastodonAccessToken,
    acctUri,
  });
  const followResponse = await followRemoteAccount({
    mastodonBaseUrl,
    token: mastodonAccessToken,
    accountId: resolvedAccount.id,
  });
  const relationship = await pollRelationship({
    mastodonBaseUrl,
    token: mastodonAccessToken,
    accountId: resolvedAccount.id,
    attempts: pollAttempts,
    intervalMs: pollIntervalMs,
  });

  const failures = [];
  const canonicalActorUrl = `${gatewayPublicBaseUrl.replace(/\/$/, "")}/users/${gatewayHandle}`;
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
    failures.push("mastodon account resolution returned no account id");
  }
  if (!followResponse.following && !followResponse.requested) {
    failures.push("mastodon follow response was neither following nor requested");
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
    mastodon: {
      baseUrl: mastodonBaseUrl,
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
