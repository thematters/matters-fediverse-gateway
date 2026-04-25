import path from "node:path";
import { access, readFile } from "node:fs/promises";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--env-file") {
      options.envFile = argv[index + 1];
      index += 1;
    } else if (value === "--strict-paths") {
      options.strictPaths = true;
    }
  }

  return options;
}

function parseEnvFile(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
      }),
  );
}

const REQUIRED_KEYS = ["WORKDIR", "CONFIG_PATH", "HOST", "PORT", "LOG_DIR"];

async function checkPath(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const args = parseArgs(process.argv.slice(2));
const envFile = path.resolve(args.envFile || "./deploy/matters-gateway-core.env.example");
const envText = await readFile(envFile, "utf8");
const envValues = parseEnvFile(envText);
const missingKeys = REQUIRED_KEYS.filter((key) => !envValues[key]?.trim());

const pathChecks = [
  {
    key: "WORKDIR",
    absolutePath: envValues.WORKDIR ? path.resolve(envValues.WORKDIR) : null,
  },
  {
    key: "CONFIG_PATH",
    absolutePath: envValues.CONFIG_PATH ? path.resolve(envValues.CONFIG_PATH) : null,
  },
  {
    key: "LOG_DIR",
    absolutePath: envValues.LOG_DIR ? path.resolve(envValues.LOG_DIR) : null,
  },
];

const checkedPaths = await Promise.all(
  pathChecks
    .filter((entry) => entry.absolutePath)
    .map(async (entry) => ({
      ...entry,
      exists: await checkPath(entry.absolutePath),
    })),
);

const missingPaths = args.strictPaths ? checkedPaths.filter((entry) => !entry.exists) : [];
const status = missingKeys.length === 0 && missingPaths.length === 0 ? "ok" : "invalid";

const result = {
  status,
  envFile,
  strictPaths: args.strictPaths === true,
  requiredKeys: REQUIRED_KEYS,
  missingKeys,
  checkedPaths,
  missingPaths: missingPaths.map((entry) => ({
    key: entry.key,
    absolutePath: entry.absolutePath,
  })),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = status === "ok" ? 0 : 1;
