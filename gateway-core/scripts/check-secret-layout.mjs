import path from "node:path";
import { access, readFile } from "node:fs/promises";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function collectFileRefs(rawConfig) {
  const refs = [];

  for (const [handle, actor] of Object.entries(rawConfig.actors ?? {})) {
    if (actor?.publicKeyPemFile?.trim()) {
      refs.push({
        key: `actors.${handle}.publicKeyPemFile`,
        relativePath: actor.publicKeyPemFile.trim(),
      });
    }
    if (actor?.privateKeyPemFile?.trim()) {
      refs.push({
        key: `actors.${handle}.privateKeyPemFile`,
        relativePath: actor.privateKeyPemFile.trim(),
      });
    }
    if (actor?.previousPublicKeyPemFile?.trim()) {
      refs.push({
        key: `actors.${handle}.previousPublicKeyPemFile`,
        relativePath: actor.previousPublicKeyPemFile.trim(),
      });
    }
  }

  const dispatchRefs = [
    ["runtime.alerting.dispatch.webhookBearerTokenFile", rawConfig.runtime?.alerting?.dispatch?.webhookBearerTokenFile],
    ["runtime.metrics.dispatch.webhookBearerTokenFile", rawConfig.runtime?.metrics?.dispatch?.webhookBearerTokenFile],
    ["runtime.logs.dispatch.webhookBearerTokenFile", rawConfig.runtime?.logs?.dispatch?.webhookBearerTokenFile],
  ];

  for (const [key, value] of dispatchRefs) {
    if (value?.trim()) {
      refs.push({
        key,
        relativePath: value.trim(),
      });
    }
  }

  return refs;
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
const configDir = path.dirname(configPath);
const refs = collectFileRefs(rawConfig);

const files = await Promise.all(
  refs.map(async (entry) => {
    const absolutePath = path.resolve(configDir, entry.relativePath);
    try {
      await access(absolutePath);
      return {
        ...entry,
        absolutePath,
        exists: true,
      };
    } catch {
      return {
        ...entry,
        absolutePath,
        exists: false,
      };
    }
  }),
);

const missingFiles = files.filter((entry) => !entry.exists);
const result = {
  status: missingFiles.length === 0 ? "ok" : "missing",
  configPath,
  checkedFiles: files.length,
  missingFiles: missingFiles.length,
  files,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = missingFiles.length === 0 ? 0 : 1;
