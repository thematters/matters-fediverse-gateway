import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = {
    baseUrl: "https://matters.town",
    handle: "mashbeanmatters",
    pilotAuthor: "mashbean",
    triggerMode: "record_only",
    fullOutboundEnabled: false,
    outputFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      options.baseUrl = argv[++index];
    } else if (arg === "--handle") {
      options.handle = argv[++index];
    } else if (arg === "--pilot-author") {
      options.pilotAuthor = argv[++index];
    } else if (arg === "--trigger-mode") {
      options.triggerMode = argv[++index];
    } else if (arg === "--full-outbound-enabled") {
      options.fullOutboundEnabled = true;
    } else if (arg === "--output-file") {
      options.outputFile = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/u, "");
  options.handle = options.handle.replace(/^@/u, "").trim().toLowerCase();
  options.pilotAuthor = options.pilotAuthor.trim();
  options.triggerMode = options.triggerMode.trim();

  if (!options.baseUrl || !options.handle || !options.pilotAuthor || !options.triggerMode) {
    throw new Error("--base-url, --handle, --pilot-author, and --trigger-mode are required");
  }

  return options;
}

function activityPrefix(baseUrl) {
  return new URL(baseUrl).host === "matters.town" ? "/ap" : "";
}

function pickHeaders(headers) {
  const names = ["content-type", "cache-control", "cf-cache-status", "cf-ray", "server"];
  return Object.fromEntries(
    names
      .map((name) => [name, headers.get(name)])
      .filter(([, value]) => value != null),
  );
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  return {
    url: String(url),
    status: response.status,
    ok: response.ok,
    headers: pickHeaders(response.headers),
    body,
  };
}

function findSelfLink(webfinger) {
  return (webfinger.body?.links ?? []).find((link) => link.rel === "self" && link.href);
}

function evaluate({ options, acct, actorUrl, probes }) {
  const failures = [];
  const warnings = [];
  const { health, webfinger, actor, outbox, followers } = probes;
  const actorBody = actor.body ?? {};
  const runtime = health.body?.runtime ?? {};
  const publicKeyId = actorBody.publicKey?.id ?? null;

  if (options.triggerMode !== "record_only") {
    failures.push(`production trigger mode must stay record_only for this pilot, got ${options.triggerMode}`);
  }
  if (options.fullOutboundEnabled) {
    failures.push("full outbound delivery must remain disabled for production preparation");
  }
  if (options.pilotAuthor !== "mashbean") {
    failures.push(`pilot author must stay mashbean for this phase, got ${options.pilotAuthor}`);
  }

  if (!health.ok) {
    failures.push(`healthz returned ${health.status}`);
  }
  if (runtime.followReadiness !== "ready") {
    failures.push(`follow readiness is ${runtime.followReadiness ?? "unknown"}`);
  }
  if (runtime.inboxMode !== "persistent") {
    failures.push(`inbox mode is ${runtime.inboxMode ?? "unknown"}; expected persistent`);
  }
  if (runtime.component && runtime.component !== "gateway-core") {
    failures.push(`healthz component is ${runtime.component}; expected gateway-core`);
  }
  if (runtime.storeDriver && runtime.storeDriver !== "sqlite") {
    failures.push(`store driver is ${runtime.storeDriver}; expected sqlite`);
  }

  if (!webfinger.ok || webfinger.body?.subject !== acct) {
    failures.push("canonical WebFinger subject is not ready");
  }
  if (findSelfLink(webfinger)?.href !== actorUrl) {
    failures.push("canonical WebFinger self link does not point at the pilot actor");
  }

  if (!actor.ok || actorBody.id !== actorUrl || actorBody.type !== "Person") {
    failures.push("canonical actor document is not ready");
  }
  if (actorBody.inbox !== `${actorUrl}/inbox`) {
    failures.push("actor inbox does not match the canonical actor URL");
  }
  if (actorBody.outbox !== `${actorUrl}/outbox`) {
    failures.push("actor outbox does not match the canonical actor URL");
  }
  if (actorBody.followers !== `${actorUrl}/followers`) {
    failures.push("actor followers collection does not match the canonical actor URL");
  }
  if (actorBody.publicKey?.owner !== actorUrl) {
    failures.push("actor public key owner does not match the canonical actor URL");
  }
  if (!publicKeyId) {
    failures.push("actor public key id is missing");
  } else {
    if (publicKeyId.endsWith("#main-key")) {
      failures.push("actor public key id still uses #main-key");
    }
    if (!/#gateway-core-\d{8}/u.test(publicKeyId)) {
      failures.push(`actor public key id is not versioned for gateway-core: ${publicKeyId}`);
    }
  }

  if (!outbox.ok || outbox.body?.type !== "OrderedCollection") {
    failures.push("actor outbox is not readable as an OrderedCollection");
  }
  if (!followers.ok || followers.body?.type !== "OrderedCollection") {
    failures.push("actor followers collection is not readable as an OrderedCollection");
  }
  if ((followers.body?.totalItems ?? 0) < 1) {
    warnings.push("followers collection is readable but currently has no followers");
  }

  return { ok: failures.length === 0, failures, warnings };
}

export async function run(options) {
  const prefix = activityPrefix(options.baseUrl);
  const host = new URL(options.baseUrl).host;
  const acct = `acct:${options.handle}@${host}`;
  const actorUrl = `${options.baseUrl}${prefix}/users/${options.handle}`;

  const probes = {
    health: await fetchJson(`${options.baseUrl}${prefix}/healthz`),
    webfinger: await fetchJson(
      `${options.baseUrl}/.well-known/webfinger?resource=${encodeURIComponent(acct)}`,
      { accept: "application/jrd+json, application/json" },
    ),
    actor: await fetchJson(actorUrl, {
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    }),
    outbox: await fetchJson(`${actorUrl}/outbox`, {
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    }),
    followers: await fetchJson(`${actorUrl}/followers`, {
      accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    }),
  };
  const evaluation = evaluate({ options, acct, actorUrl, probes });

  return {
    ok: evaluation.ok,
    generatedAt: new Date().toISOString(),
    scope: {
      baseUrl: options.baseUrl,
      handle: options.handle,
      pilotAuthor: options.pilotAuthor,
      triggerMode: options.triggerMode,
      fullOutboundEnabled: options.fullOutboundEnabled,
      acct,
      actorUrl,
      note:
        "Read-only preflight for production record-only / observation. It does not enable production delivery or send ActivityPub activities.",
    },
    evaluation,
    probes: {
      health: {
        status: probes.health.status,
        runtime: probes.health.body?.runtime ?? null,
      },
      webfinger: {
        status: probes.webfinger.status,
        subject: probes.webfinger.body?.subject ?? null,
        selfHref: findSelfLink(probes.webfinger)?.href ?? null,
      },
      actor: {
        status: probes.actor.status,
        id: probes.actor.body?.id ?? null,
        inbox: probes.actor.body?.inbox ?? null,
        outbox: probes.actor.body?.outbox ?? null,
        followers: probes.actor.body?.followers ?? null,
        publicKeyId: probes.actor.body?.publicKey?.id ?? null,
        publicKeyOwner: probes.actor.body?.publicKey?.owner ?? null,
      },
      outbox: {
        status: probes.outbox.status,
        type: probes.outbox.body?.type ?? null,
        totalItems: probes.outbox.body?.totalItems ?? null,
      },
      followers: {
        status: probes.followers.status,
        type: probes.followers.body?.type ?? null,
        totalItems: probes.followers.body?.totalItems ?? null,
      },
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);

  if (options.outputFile) {
    const outputPath = path.resolve(options.outputFile);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
