import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const META_USER_AGENTS = [
  {
    name: "default",
    userAgent: "MattersGatewayCore/threads-discovery-diagnostics",
  },
  {
    name: "facebookexternalua",
    userAgent: "facebookexternalua",
  },
  {
    name: "facebookexternalhit",
    userAgent: "facebookexternalhit/1.1",
  },
  {
    name: "meta-externalagent",
    userAgent: "meta-externalagent/1.1",
  },
];

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    handle: "mashbeanmatters",
    canonicalDomain: "matters.town",
    canonicalBaseUrl: null,
    actorPathPrefix: null,
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      options.baseUrl = argv[++index];
    } else if (arg === "--handle") {
      options.handle = argv[++index];
    } else if (arg === "--canonical-domain") {
      options.canonicalDomain = argv[++index];
    } else if (arg === "--canonical-base-url") {
      options.canonicalBaseUrl = argv[++index];
    } else if (arg === "--actor-path-prefix") {
      options.actorPathPrefix = argv[++index];
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.baseUrl = options.baseUrl ?? process.env.THREADS_DISCOVERY_BASE_URL ?? "https://matters.town";
  options.baseUrl = options.baseUrl.replace(/\/+$/u, "");
  options.canonicalBaseUrl = options.canonicalBaseUrl?.replace(/\/+$/u, "") || null;
  options.actorPathPrefix =
    options.actorPathPrefix ??
    process.env.THREADS_DISCOVERY_ACTOR_PATH_PREFIX ??
    (new URL(options.baseUrl).host === "matters.town" ? "/ap" : "");
  options.actorPathPrefix = `/${options.actorPathPrefix.replace(/^\/+|\/+$/gu, "")}`.replace(/^\/$/u, "");
  options.handle = options.handle.trim();
  options.canonicalDomain = options.canonicalDomain?.trim() || null;

  if (!options.baseUrl || !options.handle) {
    throw new Error("--base-url and --handle are required");
  }

  return options;
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

function pickHeaders(headers) {
  const names = [
    "content-type",
    "cache-control",
    "cf-cache-status",
    "cf-ray",
    "cf-mitigated",
    "server",
    "location",
    "vary",
  ];
  return Object.fromEntries(
    names
      .map((name) => [name, headers.get(name)])
      .filter(([, value]) => value != null),
  );
}

function summarizeBody(text) {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return {
      kind: "json",
      keys: Object.keys(parsed).slice(0, 20),
      subject: parsed.subject ?? null,
      id: parsed.id ?? null,
      type: parsed.type ?? null,
      error: parsed.error ?? null,
      accepted: parsed.accepted ?? null,
    };
  } catch {
    return {
      kind: "text",
      preview: text.replace(/\s+/gu, " ").trim().slice(0, 240),
    };
  }
}

async function probeUrl({ url, userAgent, accept }) {
  const response = await fetch(url, {
    headers: {
      accept,
      "user-agent": userAgent,
    },
  });
  const text = await response.text();
  return {
    url: String(url),
    status: response.status,
    ok: response.ok,
    redirected: response.redirected,
    headers: pickHeaders(response.headers),
    body: summarizeBody(text),
  };
}

function hasCloudflareChallenge(probe) {
  const headers = probe.headers ?? {};
  const contentType = headers["content-type"] ?? "";
  const bodyPreview = probe.body?.preview ?? "";
  return Boolean(
    headers["cf-mitigated"] === "challenge" ||
      [403, 429, 503].includes(probe.status) ||
      (contentType.includes("text/html") && /challenge|captcha|cloudflare/i.test(bodyPreview)),
  );
}

function evaluate({ probes, stagingAcct, canonicalAcct, actorUrl, canonicalDomain }) {
  const failures = [];
  const warnings = [];

  const stagingWebfinger = probes.find(
    (probe) => probe.name === "webfinger-staging" && probe.userAgentName === "default",
  );
  const actor = probes.find((probe) => probe.name === "actor" && probe.userAgentName === "default");
  const nodeinfo = probes.find((probe) => probe.name === "nodeinfo-discovery" && probe.userAgentName === "default");
  const canonicalWebfinger = probes.find(
    (probe) => probe.name === "webfinger-canonical" && probe.userAgentName === "default",
  );

  if (stagingWebfinger?.status !== 200) {
    failures.push(`staging WebFinger for ${stagingAcct} returned ${stagingWebfinger?.status ?? "no response"}`);
  }
  if (stagingWebfinger?.body?.subject !== stagingAcct) {
    failures.push(`staging WebFinger subject did not match ${stagingAcct}`);
  }
  if (actor?.status !== 200) {
    failures.push(`actor URL ${actorUrl} returned ${actor?.status ?? "no response"}`);
  }
  if (actor?.body?.type !== "Person") {
    failures.push("actor document is not a Person");
  }
  if (nodeinfo?.status !== 200) {
    warnings.push(`NodeInfo discovery returned ${nodeinfo?.status ?? "no response"}`);
  }

  const challengeProbes = probes.filter(hasCloudflareChallenge);
  if (challengeProbes.length > 0) {
    failures.push(
      `Cloudflare or edge challenge suspected for: ${challengeProbes
        .map((probe) => `${probe.name}/${probe.userAgentName}:${probe.status}`)
        .join(", ")}`,
    );
  }

  const metaFailures = probes.filter((probe) => probe.userAgentName !== "default" && probe.name !== "webfinger-canonical" && !probe.ok);
  if (metaFailures.length > 0) {
    warnings.push(
      `Meta-like user-agent probes had non-2xx responses: ${metaFailures
        .map((probe) => `${probe.name}/${probe.userAgentName}:${probe.status}`)
        .join(", ")}`,
    );
  }

  if (canonicalDomain && canonicalWebfinger?.status !== 200) {
    warnings.push(
      `${canonicalAcct} is not currently discoverable from the configured canonical surface; Threads discovery remains unproven until this returns 200`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseHost = new URL(options.baseUrl).host;
  const stagingAcct = `acct:${options.handle}@${baseHost}`;
  const canonicalAcct = options.canonicalDomain ? `acct:${options.handle}@${options.canonicalDomain}` : null;
  const actorPath = `${options.actorPathPrefix}/users/${options.handle}`;
  const actorUrl = `${options.baseUrl}${actorPath}`;

  const endpoints = [
    {
      name: "webfinger-staging",
      url: buildUrl(options.baseUrl, "/.well-known/webfinger", { resource: stagingAcct }),
      accept: "application/jrd+json, application/json",
    },
    {
      name: "actor",
      url: buildUrl(options.baseUrl, actorPath),
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    },
    {
      name: "outbox",
      url: buildUrl(options.baseUrl, `${actorPath}/outbox`),
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    },
    {
      name: "nodeinfo-discovery",
      url: buildUrl(options.baseUrl, "/.well-known/nodeinfo"),
      accept: "application/json",
    },
  ];

  if (canonicalAcct) {
    endpoints.push({
      name: options.canonicalBaseUrl ? "webfinger-canonical-on-staging" : "webfinger-canonical",
      url: buildUrl(options.baseUrl, "/.well-known/webfinger", { resource: canonicalAcct }),
      accept: "application/jrd+json, application/json",
    });

    if (options.canonicalBaseUrl) {
      endpoints.push({
        name: "webfinger-canonical",
        url: buildUrl(options.canonicalBaseUrl, "/.well-known/webfinger", { resource: canonicalAcct }),
        accept: "application/jrd+json, application/json",
      });
    }
  }

  const probes = [];
  for (const endpoint of endpoints) {
    for (const agent of META_USER_AGENTS) {
      probes.push({
        name: endpoint.name,
        userAgentName: agent.name,
        ...(await probeUrl({
          url: endpoint.url,
          userAgent: agent.userAgent,
          accept: endpoint.accept,
        })),
      });
    }
  }

  const evaluation = evaluate({
    probes,
    stagingAcct,
    canonicalAcct,
    actorUrl,
    canonicalDomain: options.canonicalDomain,
  });

  const report = {
    ok: evaluation.ok,
    generatedAt: new Date().toISOString(),
    scope: {
      baseUrl: options.baseUrl,
      handle: options.handle,
      actorPathPrefix: options.actorPathPrefix,
      stagingAcct,
      canonicalAcct,
      canonicalBaseUrl: options.canonicalBaseUrl,
      actorUrl,
      note: "This diagnoses public discovery preconditions only; it does not query Threads private APIs or prove Threads indexing.",
    },
    evaluation,
    probes,
  };

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

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
