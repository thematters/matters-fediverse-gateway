import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadGatewayConfig } from "../src/config.mjs";
import { FileStateStore } from "../src/store/file-state-store.mjs";
import { SqliteStateStore } from "../src/store/sqlite-state-store.mjs";

const COLLECTIONS = [
  {
    name: "followers",
    label: "followers",
    upsert(store, actorHandle, record) {
      return store.upsertFollower(actorHandle, record);
    },
  },
  {
    name: "inboundObjects",
    label: "inbound objects",
    upsert(store, actorHandle, record) {
      return store.upsertInboundObject(actorHandle, record);
    },
  },
  {
    name: "inboundEngagements",
    label: "engagements",
    upsert(store, actorHandle, record) {
      return store.upsertInboundEngagement(actorHandle, record);
    },
  },
];

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--file-state") {
      options.fileState = argv[index + 1];
      index += 1;
    } else if (value === "--sqlite-file") {
      options.sqliteFile = argv[index + 1];
      index += 1;
    } else if (value === "--output-dir") {
      options.outputDir = argv[index + 1];
      index += 1;
    } else if (value === "--label") {
      options.label = argv[index + 1];
      index += 1;
    } else if (value === "--now") {
      options.now = argv[index + 1];
      index += 1;
    } else if (value === "--repair") {
      options.repair = true;
    } else if (value === "--repair-target") {
      options.repairTarget = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function buildTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-").replace("Z", "Z");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function recordHash(record) {
  return createHash("sha256").update(stableStringify(record)).digest("hex");
}

function flattenSnapshot(snapshot) {
  const flattened = Object.fromEntries(COLLECTIONS.map((collection) => [collection.name, new Map()]));

  for (const [actorHandle, actorState] of Object.entries(snapshot.actors ?? {})) {
    for (const collection of COLLECTIONS) {
      for (const [recordId, record] of Object.entries(actorState[collection.name] ?? {})) {
        const key = `${actorHandle}\u0000${recordId}`;
        flattened[collection.name].set(key, {
          actorHandle,
          recordId,
          record,
          hash: recordHash(record),
        });
      }
    }
  }

  return flattened;
}

function compareStores(fileSnapshot, sqliteSnapshot) {
  const fileData = flattenSnapshot(fileSnapshot);
  const sqliteData = flattenSnapshot(sqliteSnapshot);
  const diffs = Object.fromEntries(COLLECTIONS.map((collection) => [collection.name, []]));

  for (const collection of COLLECTIONS) {
    const fileRecords = fileData[collection.name];
    const sqliteRecords = sqliteData[collection.name];
    const keys = [...new Set([...fileRecords.keys(), ...sqliteRecords.keys()])].sort();

    for (const key of keys) {
      const fileEntry = fileRecords.get(key) ?? null;
      const sqliteEntry = sqliteRecords.get(key) ?? null;
      const base = {
        collection: collection.name,
        actorHandle: fileEntry?.actorHandle ?? sqliteEntry?.actorHandle,
        recordId: fileEntry?.recordId ?? sqliteEntry?.recordId,
      };

      if (!fileEntry) {
        diffs[collection.name].push({
          ...base,
          type: "missing_in_file",
          sqliteHash: sqliteEntry.hash,
        });
      } else if (!sqliteEntry) {
        diffs[collection.name].push({
          ...base,
          type: "missing_in_sqlite",
          fileHash: fileEntry.hash,
        });
      } else if (fileEntry.hash !== sqliteEntry.hash) {
        diffs[collection.name].push({
          ...base,
          type: "value_mismatch",
          fileHash: fileEntry.hash,
          sqliteHash: sqliteEntry.hash,
        });
      }
    }
  }

  return { diffs, fileData, sqliteData };
}

function summarizeDiffs(diffs) {
  const byCollection = {};
  const byType = {
    missing_in_file: 0,
    missing_in_sqlite: 0,
    value_mismatch: 0,
  };

  for (const collection of COLLECTIONS) {
    const entries = diffs[collection.name] ?? [];
    byCollection[collection.name] = {
      total: entries.length,
      missingInFile: entries.filter((entry) => entry.type === "missing_in_file").length,
      missingInSqlite: entries.filter((entry) => entry.type === "missing_in_sqlite").length,
      valueMismatches: entries.filter((entry) => entry.type === "value_mismatch").length,
    };

    for (const entry of entries) {
      byType[entry.type] += 1;
    }
  }

  return {
    totalDiffs: Object.values(byCollection).reduce((total, entry) => total + entry.total, 0),
    byType,
    byCollection,
  };
}

async function applyRepairs({ diffs, fileData, sqliteData, fileStore, sqliteStore, repairTarget }) {
  const targetStore = repairTarget === "sqlite" ? sqliteStore : fileStore;
  const sourceData = repairTarget === "sqlite" ? fileData : sqliteData;
  const targetMissingType = repairTarget === "sqlite" ? "missing_in_sqlite" : "missing_in_file";
  const repair = {
    target: repairTarget,
    applied: [],
    skipped: [],
  };

  for (const collection of COLLECTIONS) {
    for (const diff of diffs[collection.name] ?? []) {
      if (diff.type !== targetMissingType && diff.type !== "value_mismatch") {
        repair.skipped.push({
          collection: diff.collection,
          actorHandle: diff.actorHandle,
          recordId: diff.recordId,
          reason: `source record missing in ${repairTarget === "sqlite" ? "file" : "sqlite"} store`,
        });
        continue;
      }

      const sourceEntry = sourceData[collection.name].get(`${diff.actorHandle}\u0000${diff.recordId}`);
      if (!sourceEntry) {
        repair.skipped.push({
          collection: diff.collection,
          actorHandle: diff.actorHandle,
          recordId: diff.recordId,
          reason: "source record unavailable",
        });
        continue;
      }

      await collection.upsert(targetStore, diff.actorHandle, sourceEntry.record);
      repair.applied.push({
        collection: diff.collection,
        actorHandle: diff.actorHandle,
        recordId: diff.recordId,
        action: diff.type === "value_mismatch" ? "updated_from_source" : "backfilled_from_source",
      });
    }
  }

  return repair;
}

function renderMarkdown(report) {
  const lines = [
    "# Gateway Consistency Scan",
    "",
    `Generated at: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry-run" : `repair to ${report.repair?.target}`}`,
    "",
    "## Sources",
    "",
    `- File store: \`${report.sources.fileState}\``,
    `- SQLite store: \`${report.sources.sqliteFile}\``,
    "",
    "## Summary",
    "",
    `- Total differences: ${report.summary.totalDiffs}`,
    `- Missing in file: ${report.summary.byType.missing_in_file}`,
    `- Missing in SQLite: ${report.summary.byType.missing_in_sqlite}`,
    `- Value mismatches: ${report.summary.byType.value_mismatch}`,
    "",
    "| Collection | Total | Missing in file | Missing in SQLite | Value mismatches |",
    "|---|---:|---:|---:|---:|",
  ];

  for (const collection of COLLECTIONS) {
    const summary = report.summary.byCollection[collection.name];
    lines.push(
      `| ${collection.label} | ${summary.total} | ${summary.missingInFile} | ${summary.missingInSqlite} | ${summary.valueMismatches} |`,
    );
  }

  lines.push("", "## Differences", "");
  for (const collection of COLLECTIONS) {
    const entries = report.differences[collection.name] ?? [];
    lines.push(`### ${collection.label}`, "");
    if (!entries.length) {
      lines.push("- No differences.", "");
      continue;
    }

    for (const entry of entries) {
      const fileHash = entry.fileHash ? ` file=${entry.fileHash.slice(0, 12)}` : "";
      const sqliteHash = entry.sqliteHash ? ` sqlite=${entry.sqliteHash.slice(0, 12)}` : "";
      lines.push(`- ${entry.type}: ${entry.actorHandle} / ${entry.recordId}${fileHash}${sqliteHash}`);
    }
    lines.push("");
  }

  if (report.repair) {
    lines.push("## Repair", "");
    lines.push(`- Applied: ${report.repair.applied.length}`);
    lines.push(`- Skipped: ${report.repair.skipped.length}`);
  }

  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
if (args.repair && !["file", "sqlite"].includes(args.repairTarget)) {
  throw new Error("scan-consistency --repair requires --repair-target file|sqlite");
}

const configPath = args.configPath ? path.resolve(args.configPath) : path.resolve("./config/dev.instance.json");
const config = await loadGatewayConfig(configPath);
const fileState = args.fileState ? path.resolve(args.fileState) : config.runtime.stateFile;
const sqliteFile = args.sqliteFile ? path.resolve(args.sqliteFile) : config.runtime.sqliteFile;
const generatedAt = args.now?.trim() || new Date().toISOString();

const fileStore = new FileStateStore({ stateFile: fileState });
const sqliteStore = new SqliteStateStore({ sqliteFile });
await fileStore.init();
await sqliteStore.init();

const comparison = compareStores(fileStore.getSnapshot(), sqliteStore.getSnapshot());
let repair = null;
if (args.repair) {
  repair = await applyRepairs({
    ...comparison,
    fileStore,
    sqliteStore,
    repairTarget: args.repairTarget,
  });
}

const postRepairComparison = args.repair ? compareStores(fileStore.getSnapshot(), sqliteStore.getSnapshot()) : comparison;
const report = {
  generatedAt,
  dryRun: !args.repair,
  sources: {
    fileState,
    sqliteFile,
  },
  summary: summarizeDiffs(postRepairComparison.diffs),
  differences: postRepairComparison.diffs,
  repair,
};

const outputDir = args.outputDir
  ? path.resolve(args.outputDir)
  : path.resolve(path.dirname(sqliteFile), "consistency-scans");
await mkdir(outputDir, { recursive: true });
const labelSuffix = args.label?.trim() ? `-${args.label.trim().replace(/[^a-zA-Z0-9_-]+/g, "-")}` : "";
const baseName = `consistency-scan-${buildTimestamp(new Date(generatedAt))}${labelSuffix}`;
const jsonReportFile = path.join(outputDir, `${baseName}.json`);
const markdownReportFile = path.join(outputDir, `${baseName}.md`);

await writeFile(jsonReportFile, JSON.stringify(report, null, 2));
await writeFile(markdownReportFile, renderMarkdown(report));
sqliteStore.close();

process.stdout.write(
  `${JSON.stringify(
    {
      jsonReportFile,
      markdownReportFile,
      summary: report.summary,
      dryRun: report.dryRun,
      repair: report.repair
        ? {
            target: report.repair.target,
            applied: report.repair.applied.length,
            skipped: report.repair.skipped.length,
          }
        : null,
    },
    null,
    2,
  )}\n`,
);
