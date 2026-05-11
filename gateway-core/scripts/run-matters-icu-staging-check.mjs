import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const gatewayCoreDir = path.resolve(moduleDir, "..");

function parseArgs(argv) {
  const options = {
    articleIds: [],
    siteDomain: "matters.icu",
    webfDomain: "staging-gateway.matters.town",
    lambdaFunction: "federation-export-dev",
    lambdaUrl: null,
    lambdaResponseFile: null,
    outputDir: "./runtime/matters-icu-staging",
    gatewayUrl: null,
    gatewayPostUrl: null,
    enforceFederationGate: false,
    skipGatewayProbes: false,
    publicKeyFile: path.join(gatewayCoreDir, "config/staging.secrets/staging-public-key.pem"),
    privateKeyFile: path.join(gatewayCoreDir, "config/staging.secrets/staging-private-key.pem"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--article-id") {
      options.articleIds.push(argv[++index]);
    } else if (arg === "--site-domain") {
      options.siteDomain = argv[++index];
    } else if (arg === "--webf-domain") {
      options.webfDomain = argv[++index];
    } else if (arg === "--lambda-function") {
      options.lambdaFunction = argv[++index];
    } else if (arg === "--lambda-url") {
      options.lambdaUrl = argv[++index];
    } else if (arg === "--lambda-response-file") {
      options.lambdaResponseFile = argv[++index];
    } else if (arg === "--output-dir") {
      options.outputDir = argv[++index];
    } else if (arg === "--gateway-url") {
      options.gatewayUrl = argv[++index];
    } else if (arg === "--gateway-post-url") {
      options.gatewayPostUrl = argv[++index];
    } else if (arg === "--enforce-federation-gate") {
      options.enforceFederationGate = true;
    } else if (arg === "--skip-gateway-probes") {
      options.skipGatewayProbes = true;
    } else if (arg === "--public-key-file") {
      options.publicKeyFile = argv[++index];
    } else if (arg === "--private-key-file") {
      options.privateKeyFile = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.articleIds = options.articleIds.map((value) => value?.trim()).filter(Boolean);
  options.publicKeyFile = path.resolve(options.publicKeyFile);
  options.privateKeyFile = path.resolve(options.privateKeyFile);
  if (options.articleIds.length === 0 && !options.lambdaResponseFile) {
    throw new Error("At least one --article-id is required unless --lambda-response-file is provided");
  }

  return options;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/u, "");
}

function buildPayload(options) {
  return {
    forceRun: true,
    articleIds: options.articleIds,
    siteDomain: options.siteDomain,
    webfDomain: options.webfDomain,
    enforceFederationGate: options.enforceFederationGate,
    dryRun: true,
    includeFileContents: true,
  };
}

async function runCommand(command, args, { input = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function invokeLambdaFunction({ functionName, payload }) {
  const dir = await mkdtemp(path.join(tmpdir(), "matters-icu-staging-"));
  const payloadFile = path.join(dir, "payload.json");
  const outputFile = path.join(dir, "lambda-response.json");
  await writeFile(payloadFile, JSON.stringify(payload, null, 2));

  await runCommand("aws", [
    "lambda",
    "invoke",
    "--function-name",
    functionName,
    "--cli-binary-format",
    "raw-in-base64-out",
    "--payload",
    `file://${payloadFile}`,
    outputFile,
  ]);

  return JSON.parse(await readFile(outputFile, "utf8"));
}

async function invokeLambdaUrl({ lambdaUrl, payload }) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const token = process.env.FEDERATION_EXPORT_DEV_ACCESS_TOKEN?.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(lambdaUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${lambdaUrl} failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function parseLambdaResult(raw) {
  const result = raw?.statusCode
    ? {
        statusCode: raw.statusCode,
        body: typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body,
      }
    : {
        statusCode: 200,
        body: raw,
      };

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`Lambda returned status ${result.statusCode}: ${JSON.stringify(result.body)}`);
  }
  if (!Array.isArray(result.body?.files)) {
    throw new Error("Lambda response must include files[]");
  }
  const filesWithContent = result.body.files.filter((file) => typeof file.content === "string");
  if (filesWithContent.length === 0) {
    throw new Error("Lambda response did not include file contents; use dryRun or includeFileContents");
  }

  return {
    ...result.body,
    files: filesWithContent,
  };
}

async function writeBundleFiles({ files, bundleDir }) {
  const root = path.resolve(bundleDir);
  await mkdir(root, { recursive: true });

  for (const file of files) {
    const target = path.resolve(root, file.path);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing to write path outside bundle dir: ${file.path}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

function validateManifest(manifest, { siteDomain, webfDomain }) {
  const errors = [];
  if (manifest?.version !== 1) errors.push("manifest.version must be 1");
  if (manifest?.visibility?.federatedPublicOnly !== true) {
    errors.push("manifest.visibility.federatedPublicOnly must be true");
  }
  if (!manifest?.actor?.handle) errors.push("manifest.actor.handle is required");
  if (!manifest?.actor?.webfingerSubject?.endsWith(`@${webfDomain}`)) {
    errors.push(`manifest actor must use ${webfDomain}`);
  }
  if (!Array.isArray(manifest?.articles) || manifest.articles.length === 0) {
    errors.push("manifest.articles must not be empty");
  }
  for (const article of manifest?.articles ?? []) {
    if (article.visibility !== "public") {
      errors.push(`article ${article.id} must have visibility public`);
    }
    if (!article.sourceUri?.includes(siteDomain)) {
      errors.push(`article ${article.id} sourceUri should point at ${siteDomain}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

async function writeGatewayConfig({ manifest, outputRoot, bundleDir, options }) {
  const handle = manifest.actor.handle;
  const config = {
    instance: {
      domain: options.webfDomain,
      title: "Matters Gateway Staging",
      summary: "Staging instance for matters.icu federation export verification",
      softwareName: "matters-gateway-core",
      softwareVersion: "0.1.0",
      openRegistrations: false,
    },
    actors: {
      [handle]: {
        displayName: manifest.actor.displayName,
        summary: `Staging federation actor for ${manifest.actor.displayName}`,
        autoAcceptFollows: true,
        staticBundleManifestFile: path.join(bundleDir, "activitypub-manifest.json"),
        aliases: [manifest.actor.sourceProfileUrl].filter(Boolean),
        publicKeyPemFile: options.publicKeyFile,
        privateKeyPemFile: options.privateKeyFile,
      },
    },
    remoteActors: {},
    remoteDiscovery: {
      cacheTtlMs: 3600000,
    },
    delivery: {
      maxAttempts: 3,
      userAgent: "MattersGatewayCore/0.1.0",
      processingLeaseTimeoutMs: 900000,
    },
    moderation: {
      domainBlocks: [],
      actorSuspensions: [],
      remoteActorPolicies: [],
      evidenceRetentionDays: 365,
      rateLimits: {
        instanceInbound: { limit: 120, windowMs: 60000 },
        actorInbound: { limit: 60, windowMs: 60000 },
        actorOutbound: { limit: 30, windowMs: 60000 },
      },
    },
    runtime: {
      storeDriver: "sqlite",
      stateFile: path.join(outputRoot, "state.json"),
      sqliteFile: path.join(outputRoot, "state.sqlite"),
    },
  };

  const configFile = path.join(outputRoot, "gateway.instance.json");
  await writeFile(configFile, JSON.stringify(config, null, 2));
  return configFile;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed with ${response.status}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function runGatewayProbes({ gatewayUrl, handle, webfDomain }) {
  const baseUrl = normalizeBaseUrl(gatewayUrl);
  const webfingerUrl = new URL("/.well-known/webfinger", baseUrl);
  webfingerUrl.searchParams.set("resource", `acct:${handle}@${webfDomain}`);

  const webfinger = await fetchJson(webfingerUrl);
  const actor = await fetchJson(new URL(`/users/${handle}`, baseUrl));
  const outbox = await fetchJson(new URL(`/users/${handle}/outbox`, baseUrl));

  if (webfinger.subject !== `acct:${handle}@${webfDomain}`) {
    throw new Error(`Unexpected WebFinger subject: ${webfinger.subject}`);
  }
  if (!["Person", "Service", "Application"].includes(actor.type)) {
    throw new Error(`Unexpected actor type: ${actor.type}`);
  }
  if (!Array.isArray(outbox.orderedItems ?? outbox.items)) {
    throw new Error("Outbox did not return an ActivityStreams collection");
  }

  return {
    webfingerSubject: webfinger.subject,
    actorId: actor.id,
    actorType: actor.type,
    outboxItemCount: (outbox.orderedItems ?? outbox.items).length,
  };
}

const options = parseArgs(process.argv.slice(2));
const outputRoot = path.resolve(options.outputDir);
const bundleDir = path.join(outputRoot, "bundle");
const payload = buildPayload(options);

let rawLambdaResult;
if (options.lambdaResponseFile) {
  rawLambdaResult = JSON.parse(await readFile(options.lambdaResponseFile, "utf8"));
} else if (options.lambdaUrl) {
  rawLambdaResult = await invokeLambdaUrl({ lambdaUrl: options.lambdaUrl, payload });
} else {
  rawLambdaResult = await invokeLambdaFunction({
    functionName: options.lambdaFunction,
    payload,
  });
}

const exportResult = parseLambdaResult(rawLambdaResult);
validateManifest(exportResult.manifest, options);
await writeBundleFiles({ files: exportResult.files, bundleDir });
const configFile = await writeGatewayConfig({
  manifest: exportResult.manifest,
  outputRoot,
  bundleDir,
  options,
});

const gatewayProbe = options.gatewayUrl && !options.skipGatewayProbes
  ? await runGatewayProbes({
      gatewayUrl: options.gatewayUrl,
      handle: exportResult.manifest.actor.handle,
      webfDomain: options.webfDomain,
    })
  : null;

const report = {
  status: "ok",
  checkedAt: new Date().toISOString(),
  lambda: {
    functionName: options.lambdaResponseFile ? null : options.lambdaFunction,
    lambdaUrl: options.lambdaUrl,
    responseFile: options.lambdaResponseFile,
  },
  input: payload,
  output: {
    outputRoot,
    bundleDir,
    configFile,
  },
  manifest: {
    actor: exportResult.manifest.actor,
    articleCount: exportResult.manifest.articles.length,
    articles: exportResult.manifest.articles,
  },
  decisionReport: exportResult.decisionReport,
  gatewayProbe,
};

await writeFile(path.join(outputRoot, "staging-check-report.json"), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
