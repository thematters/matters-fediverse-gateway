import path from "node:path";
import { loadGatewayConfig } from "../src/config.mjs";
import {
  buildRuntimeMetricsBundle,
  dispatchRuntimeWebhook,
  resolveRuntimeDispatch,
  writeRuntimeDispatchBundle,
} from "../src/lib/runtime-observability.mjs";
import { createStateStore } from "../src/store/create-state-store.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--output-file") {
      options.outputFile = argv[index + 1];
      index += 1;
    } else if (value === "--webhook-url") {
      options.webhookUrl = argv[index + 1];
      index += 1;
    } else if (value === "--webhook-bearer-token") {
      options.webhookBearerToken = argv[index + 1];
      index += 1;
    } else if (value === "--webhook-header") {
      options.webhookHeaders ??= {};
      const headerValue = argv[index + 1] ?? "";
      const separatorIndex = headerValue.indexOf("=");
      if (separatorIndex > 0) {
        options.webhookHeaders[headerValue.slice(0, separatorIndex).trim()] = headerValue.slice(separatorIndex + 1).trim();
      }
      index += 1;
    } else if (value === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    }
  }

  return options;
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);
const store = createStateStore(config.runtime);
await store.init();

const generatedAt = new Date().toISOString();
const payload = buildRuntimeMetricsBundle({
  store,
  config,
  now: generatedAt,
});

if (args.outputFile?.trim()) {
  await writeRuntimeDispatchBundle(path.resolve(args.outputFile), payload);
}

const metricsDispatch = resolveRuntimeDispatch({
  configuredDispatch: config.runtime?.metrics?.dispatch ?? {},
  override: {
    webhookUrl: args.webhookUrl,
    webhookHeaders: args.webhookHeaders,
    webhookBearerToken: args.webhookBearerToken,
    timeoutMs: args.timeoutMs,
  },
});

if (metricsDispatch.webhookUrl) {
  try {
    await dispatchRuntimeWebhook({
      ...metricsDispatch,
      bundle: payload,
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (typeof store.close === "function") {
      store.close();
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
    process.exit();
  }
}

if (typeof store.close === "function") {
  store.close();
}

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
