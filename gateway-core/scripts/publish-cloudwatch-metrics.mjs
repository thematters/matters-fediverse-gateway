import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadGatewayConfig } from "../src/config.mjs";
import { buildCloudWatchMetricData } from "../src/lib/cloudwatch-observability.mjs";
import { buildRuntimeMetrics } from "../src/lib/runtime-observability.mjs";
import { createStateStore } from "../src/store/create-state-store.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--namespace") {
      options.namespace = argv[index + 1];
      index += 1;
    } else if (value === "--region") {
      options.region = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(args.configPath ?? "./config/dev.instance.json");
const namespace = args.namespace?.trim() || process.env.CLOUDWATCH_NAMESPACE?.trim() || "Matters/FediverseGateway";
const region = args.region?.trim() || process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
const config = await loadGatewayConfig(configPath);
const store = createStateStore(config.runtime);
await store.init();

const generatedAt = new Date().toISOString();
const metrics = buildRuntimeMetrics({
  store,
  config,
  now: generatedAt,
});
const metricData = buildCloudWatchMetricData({
  metrics,
  now: generatedAt,
});
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "matters-gateway-cloudwatch-"));
const metricFile = path.join(temporaryDirectory, "metrics.json");

try {
  await writeFile(metricFile, JSON.stringify(metricData));
  const commandArgs = [
    "cloudwatch",
    "put-metric-data",
    "--namespace",
    namespace,
    "--metric-data",
    `file://${metricFile}`,
  ];
  if (region) {
    commandArgs.push("--region", region);
  }
  await execFileAsync("aws", commandArgs, {
    timeout: 30_000,
  });
} finally {
  if (typeof store.close === "function") {
    store.close();
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write(
  `${JSON.stringify({
    status: "published",
    generatedAt,
    namespace,
    region: region ?? null,
    metricNames: metricData.map((entry) => entry.MetricName),
  })}\n`,
);
