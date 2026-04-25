import path from "node:path";
import { loadGatewayConfig } from "../src/config.mjs";
import {
  buildRuntimeAlertBundle,
  dispatchRuntimeAlertSlackWebhook,
  dispatchRuntimeAlertWebhook,
  resolveRuntimeAlertDispatch,
  writeRuntimeAlertBundle,
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
    } else if (value === "--fail-on-severity") {
      options.failOnSeverity = argv[index + 1];
      index += 1;
    } else if (value === "--webhook-url") {
      options.webhookUrl = argv[index + 1];
      index += 1;
    } else if (value === "--webhook-bearer-token") {
      options.webhookBearerToken = argv[index + 1];
      index += 1;
    } else if (value === "--slack-webhook-url") {
      options.slackWebhookUrl = argv[index + 1];
      index += 1;
    } else if (value === "--slack-channel") {
      options.slackChannel = argv[index + 1];
      index += 1;
    } else if (value === "--slack-username") {
      options.slackUsername = argv[index + 1];
      index += 1;
    } else if (value === "--slack-icon-emoji") {
      options.slackIconEmoji = argv[index + 1];
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

function severityRank(value) {
  if (value === "error") {
    return 2;
  }
  if (value === "warn") {
    return 1;
  }
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);
const store = createStateStore(config.runtime);
await store.init();

const generatedAt = new Date().toISOString();
const minimumSeverity = args.failOnSeverity?.trim() || "info";
const payload = buildRuntimeAlertBundle({
  store,
  config,
  now: generatedAt,
  minimumSeverity,
});

if (args.outputFile?.trim()) {
  await writeRuntimeAlertBundle(path.resolve(args.outputFile), payload);
}

const alertDispatch = resolveRuntimeAlertDispatch({
  config,
  override: {
    webhookUrl: args.webhookUrl,
    webhookHeaders: args.webhookHeaders,
    webhookBearerToken: args.webhookBearerToken,
    slackWebhookUrl: args.slackWebhookUrl,
    slackChannel: args.slackChannel,
    slackUsername: args.slackUsername,
    slackIconEmoji: args.slackIconEmoji,
    timeoutMs: args.timeoutMs,
  },
});

if (alertDispatch.webhookUrl || alertDispatch.slackWebhookUrl) {
  try {
    if (alertDispatch.webhookUrl) {
      await dispatchRuntimeAlertWebhook({
        ...alertDispatch,
        bundle: payload,
      });
    }
    if (alertDispatch.slackWebhookUrl) {
      await dispatchRuntimeAlertSlackWebhook({
        ...alertDispatch,
        bundle: payload,
        config,
      });
    }
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

if (
  args.failOnSeverity?.trim() &&
  payload.alerts.items.some((entry) => severityRank(entry.severity) >= severityRank(minimumSeverity))
) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
