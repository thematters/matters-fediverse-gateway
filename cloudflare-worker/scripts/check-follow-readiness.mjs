function parseArgs(argv) {
  const options = {
    baseUrl: "https://matters.town",
    handle: "mashbeanmatters",
    probeInbox: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      options.baseUrl = argv[++index];
    } else if (arg === "--handle") {
      options.handle = argv[++index];
    } else if (arg === "--probe-inbox") {
      options.probeInbox = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/u, "");
  options.handle = options.handle.replace(/^@/u, "").trim().toLowerCase();

  if (!options.baseUrl || !options.handle) {
    throw new Error("--base-url and --handle are required");
  }

  return options;
}

function activityPrefix(baseUrl) {
  return new URL(baseUrl).host === "matters.town" ? "/ap" : "";
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
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prefix = activityPrefix(options.baseUrl);
  const host = new URL(options.baseUrl).host;
  const acct = `acct:${options.handle}@${host}`;
  const actorUrl = `${options.baseUrl}${prefix}/users/${options.handle}`;

  const health = await fetchJson(`${options.baseUrl}${prefix}/healthz`);
  const webfinger = await fetchJson(
    `${options.baseUrl}/.well-known/webfinger?resource=${encodeURIComponent(acct)}`,
  );
  const actor = await fetchJson(actorUrl, {
    accept: "application/activity+json",
  });

  const failures = [];
  if (!health.ok) {
    failures.push(`healthz returned ${health.status}`);
  }
  if (health.body?.runtime?.followReadiness !== "ready") {
    failures.push(
      `follow readiness is ${health.body?.runtime?.followReadiness ?? "unknown"}; GATEWAY_CORE_ORIGIN is not active`,
    );
  }
  if (!webfinger.ok || webfinger.body?.subject !== acct) {
    failures.push("canonical WebFinger is not ready");
  }
  if (!actor.ok || actor.body?.id !== actorUrl || actor.body?.inbox !== `${actorUrl}/inbox`) {
    failures.push("canonical actor is not ready");
  }
  let inboxProbe = null;
  if (options.probeInbox) {
    const response = await fetch(`${actorUrl}/inbox`, {
      method: "POST",
      headers: {
        "content-type": "application/activity+json",
        "x-triad-readiness-probe": "invalid-follow-no-side-effect",
      },
      body: JSON.stringify({
        id: `urn:matters-fediverse-readiness:${Date.now()}`,
        type: "Follow",
        actor: "https://readiness-probe.invalid/actor",
        object: actorUrl,
      }),
    });
    const text = await response.text();
    inboxProbe = {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      bodyPreview: text.slice(0, 300),
    };

    if (response.status === 202 && inboxProbe.bodyPreview.includes("edge-demo")) {
      failures.push("inbox probe was accepted by edge-demo instead of gateway-core");
    } else if (![400, 401, 403, 422].includes(response.status)) {
      failures.push(`inbox probe returned unexpected status ${response.status}`);
    }
  }

  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    scope: {
      baseUrl: options.baseUrl,
      handle: options.handle,
      acct,
      actorUrl,
      note: options.probeInbox
        ? "Follow readiness check with an intentionally invalid inbox POST. It must be rejected by gateway-core and must not create follower state."
        : "Read-only follow readiness check. It does not send a Follow activity.",
      probeInbox: options.probeInbox,
    },
    failures,
    health: {
      status: health.status,
      runtime: health.body?.runtime ?? null,
    },
    webfinger: {
      status: webfinger.status,
      subject: webfinger.body?.subject ?? null,
    },
    actor: {
      status: actor.status,
      id: actor.body?.id ?? null,
      inbox: actor.body?.inbox ?? null,
    },
    inboxProbe,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
