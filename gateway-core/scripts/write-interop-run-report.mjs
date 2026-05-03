import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SECRET_KEY_PATTERN = /(token|secret|authorization|password|privatekey|private_key|apikey|api_key)/i;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input-json") {
      options.inputJson = argv[index + 1];
      index += 1;
    } else if (value === "--output") {
      options.output = argv[index + 1];
      index += 1;
    } else if (value === "--implementation") {
      options.implementation = argv[index + 1];
      index += 1;
    } else if (value === "--instance") {
      options.instance = argv[index + 1];
      index += 1;
    } else if (value === "--operator-profile") {
      options.operatorProfile = argv[index + 1];
      index += 1;
    } else if (value === "--gateway-url") {
      options.gatewayUrl = argv[index + 1];
      index += 1;
    } else if (value === "--gateway-actor") {
      options.gatewayActor = argv[index + 1];
      index += 1;
    } else if (value === "--started-at") {
      options.startedAt = argv[index + 1];
      index += 1;
    } else if (value === "--completed-at") {
      options.completedAt = argv[index + 1];
      index += 1;
    } else if (value === "--gateway-commit") {
      options.gatewayCommit = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function requireOption(options, name) {
  if (!options[name]?.trim()) {
    throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  return options[name].trim();
}

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/([?&](?:i|token|access_token|api_key)=)[^&\s"]+/gi, "$1<redacted>");
}

function sanitize(value, key = "") {
  if (SECRET_KEY_PATTERN.test(key)) {
    return value ? "<redacted>" : value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]));
  }
  return value;
}

function jsonLine(value) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return `\`${JSON.stringify(value)}\``;
}

function createReport({ payload, inputJson, rawText, options }) {
  const sanitized = sanitize(payload);
  const report = sanitized.report ?? {};
  const discovery = report.discovery ?? {};
  const implementationKey = options.implementation.toLowerCase();
  const implementationReport = report[implementationKey] ?? {};
  const status = sanitized.ok ? "passed" : "failed";
  const rawHash = createHash("sha256").update(rawText).digest("hex");
  const failures = Array.isArray(sanitized.failures) ? sanitized.failures : [];

  const lines = [
    `# ${options.implementation} Interop Run ${options.completedAt.slice(0, 10).replaceAll("-", "")}`,
    "",
    "## Summary",
    "",
    `- Status: \`${status}\``,
    `- Implementation: \`${options.implementation}\``,
    `- Instance: ${options.instance}`,
    `- Operator account URL: ${options.operatorProfile}`,
    `- Gateway public URL: ${options.gatewayUrl}`,
    `- Gateway actor: ${options.gatewayActor}`,
    `- Gateway commit: \`${options.gatewayCommit}\``,
    `- Started at: ${options.startedAt}`,
    `- Completed at: ${options.completedAt}`,
    "",
    "## Safety Record",
    "",
    "- Token values are not included in this report.",
    "- Raw probe output is stored outside tracked files unless an operator explicitly archives a sanitized copy.",
    "- This run covers resolve / follow / relationship checks only; it does not post, reply, like, boost, or send private messages.",
    "",
    "## Result",
    "",
    `- Probe result: \`${status}\``,
    `- WebFinger subject: ${jsonLine(discovery.subject)}`,
    `- Actor ID: ${jsonLine(discovery.actorId)}`,
    `- Outbox ID: ${jsonLine(discovery.outboxId)}`,
    `- Outbox total items: ${jsonLine(discovery.outboxTotalItems)}`,
    `- Remote resolved account ID: ${jsonLine(implementationReport.resolvedUserId ?? implementationReport.resolvedAccountId)}`,
    `- Remote resolved account URL: ${jsonLine(implementationReport.resolvedUrl)}`,
    `- Follow response: ${jsonLine(implementationReport.followResponse)}`,
    `- Relationship state: ${jsonLine(implementationReport.relation ?? implementationReport.relationship)}`,
    "",
    "## Failures",
    "",
  ];

  if (failures.length) {
    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
  } else {
    lines.push("- none");
  }

  lines.push(
    "",
    "## Evidence",
    "",
    `- Raw probe output file: \`${inputJson}\``,
    `- Raw probe output SHA-256: \`${rawHash}\``,
    "",
    "## Sanitized Payload",
    "",
    "```json",
    JSON.stringify(sanitized, null, 2),
    "```",
    "",
    "## Next Steps",
    "",
    "- Complete display checks manually only if public screenshots are approved.",
    "- Use a separate GoToSocial account/token before running GoToSocial public interop.",
  );

  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const inputJson = path.resolve(requireOption(args, "inputJson"));
const output = path.resolve(requireOption(args, "output"));
const options = {
  implementation: requireOption(args, "implementation"),
  instance: requireOption(args, "instance"),
  operatorProfile: args.operatorProfile?.trim() || "not recorded",
  gatewayUrl: requireOption(args, "gatewayUrl"),
  gatewayActor: args.gatewayActor?.trim() || "not recorded",
  startedAt: args.startedAt?.trim() || new Date().toISOString(),
  completedAt: args.completedAt?.trim() || new Date().toISOString(),
  gatewayCommit: args.gatewayCommit?.trim() || "unknown",
};

const rawText = await readFile(inputJson, "utf8");
const payload = JSON.parse(rawText);
const report = createReport({ payload, inputJson, rawText, options });

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, report, "utf8");

process.stdout.write(
  `${JSON.stringify(
    {
      status: "written",
      output,
      inputSha256: createHash("sha256").update(rawText).digest("hex"),
    },
    null,
    2,
  )}\n`,
);
