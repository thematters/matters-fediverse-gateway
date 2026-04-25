import { access, mkdir, rm } from "node:fs/promises";
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
    } else if (value === "--input-file") {
      options.inputFile = argv[index + 1];
      index += 1;
    } else if (value === "--target-file") {
      options.targetFile = argv[index + 1];
      index += 1;
    } else if (value === "--skip-pre-restore-backup") {
      options.skipPreRestoreBackup = true;
    }
  }

  return options;
}

function buildTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-").replace("Z", "Z");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function writeMeta(db, key, value) {
  db.prepare("INSERT OR REPLACE INTO runtime_meta (key, value_json) VALUES (?, ?)").run(key, JSON.stringify(value));
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);

if (config.runtime.storeDriver !== "sqlite") {
  throw new Error("restore-sqlite requires runtime.storeDriver=sqlite");
}

if (!args.inputFile?.trim()) {
  throw new Error("restore-sqlite requires --input-file");
}

const sourceFile = path.resolve(args.inputFile);
const targetFile = args.targetFile?.trim() ? path.resolve(args.targetFile) : config.runtime.sqliteFile;
if (sourceFile === targetFile) {
  throw new Error("restore-sqlite requires source and target to be different files");
}

await mkdir(path.dirname(targetFile), { recursive: true });

let preRestoreBackupFile = null;
if (!args.skipPreRestoreBackup && (await exists(targetFile))) {
  const preRestoreBaseName = `${path.basename(targetFile, ".sqlite")}.pre-restore-${buildTimestamp()}.sqlite`;
  preRestoreBackupFile = path.join(path.dirname(targetFile), preRestoreBaseName);
  const currentDb = new Database(targetFile, { readonly: true, fileMustExist: true });
  await currentDb.backup(preRestoreBackupFile);
  currentDb.close();
}

await rm(targetFile, { force: true });
const sourceDb = new Database(sourceFile, { readonly: true, fileMustExist: true });
await sourceDb.backup(targetFile);
sourceDb.close();

const restoredAt = new Date().toISOString();
const restoredDb = new Database(targetFile);
restoredDb.pragma("journal_mode = WAL");
writeMeta(restoredDb, "last_restored_at", restoredAt);
writeMeta(restoredDb, "restored_from_backup", sourceFile);
writeMeta(restoredDb, "journal_mode", "wal");
restoredDb.close();

process.stdout.write(
  `${JSON.stringify(
    {
      status: "restored",
      sourceFile,
      targetFile,
      restoredAt,
      preRestoreBackupFile,
    },
    null,
    2,
  )}\n`,
);
