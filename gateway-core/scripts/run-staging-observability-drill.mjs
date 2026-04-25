import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { loadGatewayConfig } from "../src/config.mjs";
import {
  buildRuntimeAlertBundle,
  buildRuntimeLogsBundle,
  buildRuntimeMetricsBundle,
  dispatchRuntimeAlertSlackWebhook,
  dispatchRuntimeAlertWebhook,
  dispatchRuntimeWebhook,
  resolveRuntimeAlertDispatch,
  resolveRuntimeDispatch,
  writeRuntimeAlertBundle,
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
    } else if (value === "--output-dir") {
      options.outputDir = argv[index + 1];
      index += 1;
    } else if (value === "--minimum-severity") {
      options.minimumSeverity = argv[index + 1];
      index += 1;
    } else if (value === "--require-sinks") {
      options.requireSinks = true;
    }
  }

  return options;
}

function createTimestampToken(date) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function toErrorPayload(error) {
  return {
    type: error?.type ?? null,
    code: error?.code ?? null,
    status: error?.status ?? null,
    host: error?.host ?? null,
    message: error?.message ?? String(error),
  };
}

async function runChannel({
  outputFile,
  bundle,
  writeBundle,
  dispatchers,
  requireSinks = false,
}) {
  const sinkResults = [];
  const errors = [];
  const configuredDispatchers = dispatchers.filter((entry) => entry.enabled);

  await writeBundle(outputFile, bundle);

  for (const dispatcher of configuredDispatchers) {
    try {
      const result = await dispatcher.dispatch();
      if (result) {
        sinkResults.push(result);
      }
    } catch (error) {
      errors.push({
        sinkType: dispatcher.type,
        ...toErrorPayload(error),
      });
    }
  }

  const missingSinks = configuredDispatchers.length === 0;
  const status = errors.length > 0 ? "failed" : missingSinks ? "file-only" : "dispatched";

  return {
    status,
    outputFile,
    requireSinks,
    missingSinks,
    sinkTypes: sinkResults.map((entry) => entry.type),
    sinkResults,
    errors,
  };
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);
const store = createStateStore(config.runtime);
await store.init();

const now = new Date();
const generatedAt = now.toISOString();
const outputDir = path.resolve(args.outputDir || `./runtime/drills/observability-${createTimestampToken(now)}`);
await mkdir(outputDir, { recursive: true });

const minimumSeverity = args.minimumSeverity?.trim() || "warn";
const requireSinks = args.requireSinks === true;

const alertBundle = buildRuntimeAlertBundle({
  store,
  config,
  now: generatedAt,
  minimumSeverity,
});
const metricBundle = buildRuntimeMetricsBundle({
  store,
  config,
  now: generatedAt,
});
const logDispatch = config.runtime?.logs?.dispatch ?? {};
const logsBundle = buildRuntimeLogsBundle({
  store,
  config,
  now: generatedAt,
  auditLimit: logDispatch.auditLimit,
  traceLimit: logDispatch.traceLimit,
  traceEventPrefix: logDispatch.traceEventPrefix,
});

const alertDispatch = resolveRuntimeAlertDispatch({ config });
const metricsDispatch = resolveRuntimeDispatch({
  configuredDispatch: config.runtime?.metrics?.dispatch ?? {},
});
const logsDispatch = resolveRuntimeDispatch({
  configuredDispatch: config.runtime?.logs?.dispatch ?? {},
});

const report = {
  status: "ok",
  generatedAt,
  outputDir,
  minimumSeverity,
  requireSinks,
  channels: {},
};

try {
  report.channels.alerts = await runChannel({
    outputFile: path.join(outputDir, "alerts.json"),
    bundle: alertBundle,
    writeBundle: writeRuntimeAlertBundle,
    requireSinks,
    dispatchers: [
      {
        type: "webhook",
        enabled: Boolean(alertDispatch.webhookUrl),
        dispatch: () =>
          dispatchRuntimeAlertWebhook({
            ...alertDispatch,
            bundle: alertBundle,
          }),
      },
      {
        type: "slack",
        enabled: Boolean(alertDispatch.slackWebhookUrl),
        dispatch: () =>
          dispatchRuntimeAlertSlackWebhook({
            ...alertDispatch,
            bundle: alertBundle,
            config,
          }),
      },
    ],
  });

  report.channels.metrics = await runChannel({
    outputFile: path.join(outputDir, "metrics.json"),
    bundle: metricBundle,
    writeBundle: writeRuntimeDispatchBundle,
    requireSinks,
    dispatchers: [
      {
        type: "webhook",
        enabled: Boolean(metricsDispatch.webhookUrl),
        dispatch: () =>
          dispatchRuntimeWebhook({
            ...metricsDispatch,
            bundle: metricBundle,
          }),
      },
    ],
  });

  report.channels.logs = await runChannel({
    outputFile: path.join(outputDir, "logs.json"),
    bundle: logsBundle,
    writeBundle: writeRuntimeDispatchBundle,
    requireSinks,
    dispatchers: [
      {
        type: "webhook",
        enabled: Boolean(logsDispatch.webhookUrl),
        dispatch: () =>
          dispatchRuntimeWebhook({
            ...logsDispatch,
            bundle: logsBundle,
          }),
      },
    ],
  });

  const hasErrors = Object.values(report.channels).some((entry) => entry.errors.length > 0);
  const hasMissingSinks = requireSinks && Object.values(report.channels).some((entry) => entry.missingSinks);
  report.status = hasErrors || hasMissingSinks ? "failed" : "ok";
  report.reportFile = path.join(outputDir, "report.json");

  await writeFile(report.reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (typeof store.close === "function") {
    store.close();
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "ok" ? 0 : 1;
} catch (error) {
  if (typeof store.close === "function") {
    store.close();
  }
  throw error;
}
