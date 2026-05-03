#!/usr/bin/env node
import http from "node:http";
import { pathToFileURL } from "node:url";

const DEFAULT_GATEWAY_TARGET = "http://127.0.0.1:8787";

function parseArgs(argv) {
  const args = {
    listenHost: "127.0.0.1",
    port: 8080,
    gatewayTarget: DEFAULT_GATEWAY_TARGET,
    adminMode: "local-only",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--listen-host") {
      args.listenHost = next;
      index += 1;
    } else if (value === "--port") {
      args.port = Number.parseInt(next, 10);
      index += 1;
    } else if (value === "--gateway-target") {
      args.gatewayTarget = next;
      index += 1;
    } else if (value === "--admin-mode") {
      args.adminMode = next;
      index += 1;
    } else if (value === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error("--port must be an integer from 0 to 65535");
  }
  if (!["local-only", "proxy"].includes(args.adminMode)) {
    throw new Error("--admin-mode must be local-only or proxy");
  }

  return args;
}

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function createStagingLocalProxy({ gatewayTarget = DEFAULT_GATEWAY_TARGET, adminMode = "local-only" } = {}) {
  const target = new URL(gatewayTarget);

  return http.createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

    if (host === "staging-gateway.matters.town" && /^\/(admin|jobs)(\/|$)/.test(pathname)) {
      jsonResponse(res, 404, { error: "not_found" });
      return;
    }

    if (host === "staging-admin.matters.town" && adminMode === "local-only") {
      jsonResponse(res, 404, { error: "admin_local_only" });
      return;
    }

    if (!["staging-gateway.matters.town", "staging-admin.matters.town"].includes(host)) {
      jsonResponse(res, 421, { error: "misdirected_request", host });
      return;
    }

    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );

    upstream.on("error", (error) => {
      jsonResponse(res, 502, { error: "bad_gateway", detail: error.message });
    });

    req.pipe(upstream);
  });
}

function printHelp() {
  console.log(`Usage: node scripts/run-staging-local-proxy.mjs [options]

Options:
  --listen-host HOST       Listen address. Default: 127.0.0.1
  --port PORT              Listen port. Default: 8080
  --gateway-target URL     Local gateway origin. Default: ${DEFAULT_GATEWAY_TARGET}
  --admin-mode MODE        local-only or proxy. Default: local-only

Default behavior keeps staging-admin.matters.town local-only by returning 404.
Use --admin-mode proxy only after Cloudflare Access or equivalent auth is active.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const server = createStagingLocalProxy({
    gatewayTarget: args.gatewayTarget,
    adminMode: args.adminMode,
  });

  server.listen(args.port, args.listenHost, () => {
    const address = server.address();
    console.log(
      JSON.stringify({
        status: "listening",
        host: typeof address === "object" && address ? address.address : args.listenHost,
        port: typeof address === "object" && address ? address.port : args.port,
        gatewayTarget: args.gatewayTarget,
        adminMode: args.adminMode,
      }),
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
