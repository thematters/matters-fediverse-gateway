import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    gatewayUrl: process.env.GATEWAY_URL ?? "http://127.0.0.1:8787",
    actorHandle: null,
    activityUrls: [],
    sourceFile: null,
    maxItems: null,
    dryRun: false,
    schedulerToken: process.env.INBOUND_RECONCILIATION_SCHEDULER_TOKEN ?? null,
    schedulerTokenFile: process.env.INBOUND_RECONCILIATION_SCHEDULER_TOKEN_FILE ?? null,
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--gateway-url") {
      options.gatewayUrl = argv[++index];
    } else if (arg === "--actor-handle") {
      options.actorHandle = argv[++index];
    } else if (arg === "--activity-url") {
      options.activityUrls.push(argv[++index]);
    } else if (arg === "--source-file") {
      options.sourceFile = argv[++index];
    } else if (arg === "--max-items") {
      options.maxItems = Number.parseInt(argv[++index], 10);
    } else if (arg === "--scheduler-token") {
      options.schedulerToken = argv[++index];
    } else if (arg === "--scheduler-token-file") {
      options.schedulerTokenFile = argv[++index];
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.gatewayUrl = options.gatewayUrl.replace(/\/+$/u, "");
  options.actorHandle = options.actorHandle?.trim() || null;
  options.sourceFile = options.sourceFile?.trim() || null;
  options.schedulerToken = options.schedulerToken?.trim() || null;
  options.schedulerTokenFile = options.schedulerTokenFile?.trim() || null;
  options.outputFile = options.outputFile?.trim() || null;

  if (options.maxItems != null && (!Number.isInteger(options.maxItems) || options.maxItems < 1)) {
    throw new Error("--max-items must be a positive integer");
  }

  return options;
}

async function loadSourceFile(sourceFile) {
  if (!sourceFile) {
    return {};
  }
  return JSON.parse(await readFile(path.resolve(sourceFile), "utf8"));
}

function isPrivateIpv4(hostname) {
  if (net.isIP(hostname) !== 4) {
    return false;
  }
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

function assertPublicActivityUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Activity URL: ${value}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`Activity URL must use https: ${value}`);
  }
  if (["localhost", "0.0.0.0"].includes(url.hostname) || url.hostname.endsWith(".local") || isPrivateIpv4(url.hostname)) {
    throw new Error(`Activity URL must be public, not local/private: ${value}`);
  }

  return String(url);
}

export function buildJobPayload({ source = {}, options }) {
  const defaultActorHandle = options.actorHandle ?? source.actorHandle?.trim() ?? null;
  const items = [];

  for (const activityUrl of options.activityUrls ?? []) {
    items.push({
      actorHandle: defaultActorHandle,
      activityUrl,
    });
  }

  for (const activityUrl of source.activityUrls ?? []) {
    items.push({
      actorHandle: defaultActorHandle,
      activityUrl,
    });
  }

  for (const item of source.items ?? []) {
    items.push({
      actorHandle: item.actorHandle?.trim() || defaultActorHandle,
      activityUrl: item.activityUrl,
    });
  }

  const seen = new Set();
  const normalizedItems = items
    .map((item) => ({
      actorHandle: item.actorHandle?.trim() ?? "",
      activityUrl: typeof item.activityUrl === "string" ? assertPublicActivityUrl(item.activityUrl.trim()) : "",
    }))
    .filter((item) => {
      if (!item.actorHandle || !item.activityUrl) {
        return false;
      }
      const key = `${item.actorHandle}\n${item.activityUrl}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  if (normalizedItems.length === 0) {
    throw new Error("At least one actorHandle + public https Activity URL is required");
  }

  const payload = {
    items: normalizedItems,
  };
  if (options.maxItems) {
    payload.maxItems = options.maxItems;
  }
  if (options.dryRun) {
    payload.dryRun = true;
  }

  return payload;
}

async function loadSchedulerToken(options) {
  if (options.schedulerToken) {
    return options.schedulerToken;
  }
  if (options.schedulerTokenFile) {
    return (await readFile(path.resolve(options.schedulerTokenFile), "utf8")).trim();
  }
  return "";
}

export async function run(options) {
  const source = await loadSourceFile(options.sourceFile);
  const payload = buildJobPayload({ source, options });
  const targetUrl = `${options.gatewayUrl}/jobs/inbound-reconciliation`;

  if (options.dryRun) {
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      dryRun: true,
      targetUrl,
      itemCount: payload.items.length,
      payload,
      note: "Dry run only validates the bounded source and does not call the gateway.",
    };
  }

  const schedulerToken = await loadSchedulerToken(options);
  if (!schedulerToken) {
    throw new Error(
      "Scheduler token is required via --scheduler-token, --scheduler-token-file, or INBOUND_RECONCILIATION_SCHEDULER_TOKEN",
    );
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${schedulerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    ok: response.ok,
    generatedAt: new Date().toISOString(),
    dryRun: false,
    targetUrl,
    statusCode: response.status,
    itemCount: payload.items.length,
    payload: {
      ...payload,
      items: payload.items,
    },
    response: body,
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
