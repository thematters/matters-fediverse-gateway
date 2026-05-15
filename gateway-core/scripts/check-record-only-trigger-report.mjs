import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const options = {
    eventsFile: null,
    articleId: null,
    triggers: ["publish_article", "revise_article"],
    requireEligible: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--events-file") {
      options.eventsFile = argv[++index];
    } else if (arg === "--article-id") {
      options.articleId = argv[++index];
    } else if (arg === "--trigger") {
      options.triggers.push(argv[++index]);
    } else if (arg === "--only-trigger") {
      options.triggers = [argv[++index]];
    } else if (arg === "--allow-ineligible") {
      options.requireEligible = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.eventsFile) {
    throw new Error("--events-file is required");
  }
  if (!options.articleId) {
    throw new Error("--article-id is required");
  }

  options.triggers = [...new Set(options.triggers.filter(Boolean))];
  return options;
}

function unwrapRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.data)) return value.data;
  throw new Error("Events file must be a JSON array or an object with rows/events/data");
}

function field(row, camelName, snakeName = camelName.replace(/[A-Z]/gu, (match) => `_${match.toLowerCase()}`)) {
  return row?.[camelName] ?? row?.[snakeName];
}

function normalizeDecisionReport(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
}

async function readEventsSource(eventsFile) {
  if (eventsFile === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(eventsFile, "utf8");
}

function normalizeRow(row) {
  return {
    id: String(field(row, "id") ?? ""),
    articleId: String(field(row, "articleId") ?? ""),
    actorId: field(row, "actorId") == null ? null : String(field(row, "actorId")),
    trigger: field(row, "trigger"),
    mode: field(row, "mode"),
    status: field(row, "status"),
    eligible: field(row, "eligible"),
    reason: field(row, "reason"),
    authorSetting: field(row, "authorSetting"),
    articleSetting: field(row, "articleSetting"),
    effectiveArticleSetting: field(row, "effectiveArticleSetting"),
    decisionReport: normalizeDecisionReport(field(row, "decisionReport")),
    createdAt: field(row, "createdAt"),
  };
}

function assertEvent(row, { trigger, requireEligible }) {
  const errors = [];
  if (row.trigger !== trigger) errors.push(`trigger must be ${trigger}`);
  if (row.mode !== "record_only") errors.push("mode must be record_only");
  if (row.status !== "recorded") errors.push("status must be recorded");
  if (requireEligible && row.eligible !== true) errors.push("eligible must be true");
  if (requireEligible && row.reason !== "eligible") errors.push("reason must be eligible");
  const allowedEffectiveSettings = new Set(["enabled", "inherit"]);
  if (!allowedEffectiveSettings.has(row.effectiveArticleSetting)) {
    errors.push("effectiveArticleSetting must be enabled or inherit");
  }
  if (!row.decisionReport || !Array.isArray(row.decisionReport.decisions)) {
    errors.push("decisionReport.decisions[] is required");
  }

  const decision = row.decisionReport?.decisions?.[0];
  if (decision) {
    if (requireEligible && decision.eligible !== true) {
      errors.push("decisionReport.decisions[0].eligible must be true");
    }
    if (requireEligible && decision.reason !== "eligible") {
      errors.push("decisionReport.decisions[0].reason must be eligible");
    }
  }

  return errors;
}

const options = parseArgs(process.argv.slice(2));
const raw = JSON.parse(await readEventsSource(options.eventsFile));
const rows = unwrapRows(raw).map(normalizeRow);
const articleRows = rows.filter((row) => row.articleId === String(options.articleId));
const failures = [];
const checked = [];

for (const trigger of options.triggers) {
  const matching = articleRows.filter((row) => row.trigger === trigger);
  if (matching.length === 0) {
    failures.push(`Missing ${trigger} event for article ${options.articleId}`);
    continue;
  }

  const row = matching[0];
  const errors = assertEvent(row, {
    trigger,
    requireEligible: options.requireEligible,
  });
  checked.push({
    id: row.id,
    articleId: row.articleId,
    trigger: row.trigger,
    mode: row.mode,
    status: row.status,
    eligible: row.eligible,
    reason: row.reason,
    effectiveArticleSetting: row.effectiveArticleSetting,
    createdAt: row.createdAt,
  });
  failures.push(...errors.map((error) => `${trigger}: ${error}`));
}

const report = {
  status: failures.length === 0 ? "ok" : "failed",
  checkedAt: new Date().toISOString(),
  articleId: String(options.articleId),
  expectedTriggers: options.triggers,
  checked,
  failures,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  process.exitCode = 1;
}
