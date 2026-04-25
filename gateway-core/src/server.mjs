import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGatewayConfig } from "./config.mjs";
import { createGatewayApp } from "./app.mjs";
import { createStateStore } from "./store/create-state-store.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--port") {
      options.port = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (value === "--host") {
      options.host = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function buildRequest(req, bodyText, baseUrl) {
  return new Request(new URL(req.url, baseUrl), {
    method: req.method,
    headers: req.headers,
    body: bodyText.length > 0 ? bodyText : undefined,
  });
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = path.resolve(moduleDir, "../config/dev.instance.json");
const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : defaultConfigPath;
const port = args.port ?? Number.parseInt(process.env.PORT ?? "8787", 10);
const host = args.host ?? process.env.HOST ?? "::";
const config = await loadGatewayConfig(configPath);
const store = createStateStore(config.runtime);
await store.init();
await store.seedDomainBlocks?.(
  config.moderation.domainBlocks.map((entry) => ({
    ...entry,
    domain: entry.domain.toLowerCase(),
    blockedAt: new Date().toISOString(),
  })),
);
for (const entry of config.moderation.actorSuspensions) {
  await store.upsertActorSuspension?.({
    ...entry,
    suspendedAt: new Date().toISOString(),
  });
}
await store.seedRemoteActorPolicies?.(
  config.moderation.remoteActorPolicies.map((entry) => ({
    ...entry,
    createdAt: new Date().toISOString(),
  })),
);
await store.seedRateLimitPolicies?.(
  config.moderation.rateLimits.map((entry) => ({
    ...entry,
    createdAt: new Date().toISOString(),
  })),
);
const app = createGatewayApp({ config, store });

const server = createServer(async (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", async () => {
    try {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const request = buildRequest(req, bodyText, config.instance.baseUrl);
      const response = await app.handle(request);

      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const responseBody = await response.text();
      res.end(responseBody);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }, null, 2));
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(
    `Matters gateway core slice listening on http://${host}:${port} with config ${configPath}\n`,
  );
});
