import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { loadGatewayConfig } from "../src/config.mjs";

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
    } else if (value === "--label") {
      options.label = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function buildTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-").replace("Z", "Z");
}

function getMeta(db, key, fallback = null) {
  const row = db.prepare("SELECT value_json FROM runtime_meta WHERE key = ?").get(key);
  return row ? JSON.parse(row.value_json) : fallback;
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);

if (config.runtime.storeDriver !== "sqlite") {
  throw new Error("backup-sqlite requires runtime.storeDriver=sqlite");
}

const sourceFile = config.runtime.sqliteFile;
const outputDir = args.outputDir
  ? path.resolve(args.outputDir)
  : path.resolve(path.dirname(sourceFile), "backups");
await mkdir(outputDir, { recursive: true });

const labelSuffix = args.label?.trim() ? `-${args.label.trim().replace(/[^a-zA-Z0-9_-]+/g, "-")}` : "";
const backupBaseName = `${path.basename(sourceFile, ".sqlite")}-${buildTimestamp()}${labelSuffix}.sqlite`;
const backupFile = path.join(outputDir, backupBaseName);

const db = new Database(sourceFile, { readonly: true, fileMustExist: true });
await db.backup(backupFile);
const manifest = {
  createdAt: new Date().toISOString(),
  sourceFile,
  backupFile,
  schemaVersion: getMeta(db, "schema_version"),
  initializedAt: getMeta(db, "initialized_at"),
  lastMigratedAt: getMeta(db, "last_migrated_at"),
  journalMode: getMeta(db, "journal_mode", "wal"),
};
db.close();

const manifestFile = `${backupFile}.json`;
await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
process.stdout.write(`${JSON.stringify({ backupFile, manifestFile, manifest }, null, 2)}\n`);
