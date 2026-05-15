import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    mastodonBaseUrl: process.env.MASTODON_BASE_URL ?? "https://g0v.social",
    accessToken: process.env.MASTODON_ACCESS_TOKEN ?? null,
    tokenFile: process.env.MASTODON_ACCESS_TOKEN_FILE ?? "./runtime/secrets/g0v-mastodon-readback-token",
    acct: "mashbeanmatters@staging-gateway.matters.town",
    expectedUrl: null,
    outputFile: null,
    limit: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mastodon-base-url") {
      options.mastodonBaseUrl = argv[++index];
    } else if (arg === "--access-token") {
      options.accessToken = argv[++index];
    } else if (arg === "--token-file") {
      options.tokenFile = argv[++index];
    } else if (arg === "--acct") {
      options.acct = argv[++index];
    } else if (arg === "--expected-url") {
      options.expectedUrl = argv[++index];
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(argv[++index], 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.mastodonBaseUrl = options.mastodonBaseUrl.replace(/\/+$/u, "");
  options.acct = options.acct.replace(/^@/u, "").trim();
  options.expectedUrl = options.expectedUrl?.trim() || null;

  if (!options.mastodonBaseUrl || !options.acct) {
    throw new Error("--mastodon-base-url and --acct are required");
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 80) {
    throw new Error("--limit must be an integer between 1 and 80");
  }

  return options;
}

async function loadToken(options) {
  if (options.accessToken) {
    return options.accessToken.trim();
  }
  if (!options.tokenFile) {
    throw new Error("Mastodon access token is required via --access-token, --token-file, or MASTODON_ACCESS_TOKEN");
  }
  return (await readFile(path.resolve(options.tokenFile), "utf8")).trim();
}

async function fetchJson(url, { token }) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const error = new Error(`Mastodon API ${response.status} for ${url.pathname}`);
    error.response = { status: response.status, body };
    throw error;
  }
  return body;
}

function buildUrl(baseUrl, pathname, params = {}) {
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function normalizeStatus(status) {
  return {
    id: status.id,
    createdAt: status.created_at,
    uri: status.uri,
    url: status.url,
    inReplyToId: status.in_reply_to_id,
    repliesCount: status.replies_count,
    reblogsCount: status.reblogs_count,
    favouritesCount: status.favourites_count,
    contentPreview: typeof status.content === "string" ? status.content.replace(/\s+/gu, " ").slice(0, 260) : null,
  };
}

function statusContains(status, expectedUrl) {
  const haystack = [
    status.uri,
    status.url,
    status.content,
    status.card?.url,
    ...(status.media_attachments ?? []).map((attachment) => attachment.url),
  ]
    .filter(Boolean)
    .join("\n");
  return haystack.includes(expectedUrl);
}

function evaluate({ account, statuses, expectedUrl }) {
  const failures = [];
  if (!account?.id) {
    failures.push("remote account was not resolved");
  }
  if (!Array.isArray(statuses)) {
    failures.push("statuses response was not an array");
  }
  if (expectedUrl && !statuses.some((status) => statusContains(status, expectedUrl))) {
    failures.push(`expected URL was not found in recent Mastodon statuses: ${expectedUrl}`);
  }
  return {
    ok: failures.length === 0,
    failures,
  };
}

export async function run(options) {
  const token = await loadToken(options);
  const verifyCredentials = await fetchJson(buildUrl(options.mastodonBaseUrl, "/api/v1/accounts/verify_credentials"), {
    token,
  });
  const search = await fetchJson(
    buildUrl(options.mastodonBaseUrl, "/api/v2/search", {
      q: `@${options.acct}`,
      type: "accounts",
      resolve: "true",
      limit: "10",
    }),
    { token },
  );
  const account = (search.accounts ?? []).find((candidate) => candidate.acct === options.acct) ?? null;
  const statuses = account
    ? await fetchJson(
        buildUrl(options.mastodonBaseUrl, `/api/v1/accounts/${account.id}/statuses`, {
          exclude_reblogs: "false",
          limit: String(options.limit),
        }),
        { token },
      )
    : [];
  const evaluation = evaluate({ account, statuses, expectedUrl: options.expectedUrl });

  return {
    ok: evaluation.ok,
    generatedAt: new Date().toISOString(),
    scope: {
      mastodonBaseUrl: options.mastodonBaseUrl,
      acct: options.acct,
      expectedUrl: options.expectedUrl,
      limit: options.limit,
      note: "Read-only Mastodon API check. The token is never written to the report.",
    },
    evaluation,
    authenticatedAccount: {
      id: verifyCredentials.id,
      acct: verifyCredentials.acct,
      username: verifyCredentials.username,
      url: verifyCredentials.url,
    },
    remoteAccount: account
      ? {
          id: account.id,
          acct: account.acct,
          username: account.username,
          url: account.url,
          uri: account.uri,
          followersCount: account.followers_count,
          statusesCount: account.statuses_count,
        }
      : null,
    statuses: statuses.map(normalizeStatus),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);

  if (options.outputFile) {
    const outputPath = path.resolve(options.outputFile);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
