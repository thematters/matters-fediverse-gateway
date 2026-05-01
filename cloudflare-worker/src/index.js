const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const ACTIVITY_CONTEXT = [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
];

const DEFAULT_ACTOR_HANDLE = "matters";
const DIAGNOSTIC_ACTOR_HANDLE = "mattersprobe02";
const SUPPORTED_ACTOR_HANDLES = new Set([DEFAULT_ACTOR_HANDLE, DIAGNOSTIC_ACTOR_HANDLE]);
const ARTICLE_SLUG = "matters-main-site-open-social-demo";
const ARTICLE_SOURCE_URL = "https://matters.town";
const PROJECT_REPOSITORY_URL = "https://github.com/thematters/matters-fediverse-gateway";
const MATTERS_CANONICAL_HOST = "matters.town";

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function publicBase(request, env) {
  return trimTrailingSlash(env.PUBLIC_BASE_URL || new URL(request.url).origin);
}

function activityPrefix(request, env) {
  const host = new URL(publicBase(request, env)).host;
  return host === MATTERS_CANONICAL_HOST ? "/ap" : "";
}

function actorUrl(base, prefix = "", handle = DEFAULT_ACTOR_HANDLE) {
  return `${base}${prefix}/users/${handle}`;
}

function articleUrl(base, prefix = "") {
  return `${base}${prefix}/articles/${ARTICLE_SLUG}`;
}

function inboxUrl(base, prefix = "") {
  return `${base}${prefix}/inbox`;
}

function subjectFor(request, env, handle = DEFAULT_ACTOR_HANDLE) {
  const host = new URL(publicBase(request, env)).host;
  return `acct:${handle}@${host}`;
}

function handleFromResource(resource) {
  const match = /^acct:([^@]+)@([^@]+)$/.exec(resource || "");
  return match && SUPPORTED_ACTOR_HANDLES.has(match[1]) ? match[1] : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actorRouteMatch(path, prefix = "") {
  return path.match(new RegExp(`^${escapeRegExp(prefix)}/users/([^/]+)(?:\\.json)?(?:/(outbox|followers|following|inbox))?$`));
}

function withCommonHeaders(headers = {}, cache = "no-store") {
  return {
    "access-control-allow-origin": "*",
    "cache-control": cache,
    ...headers,
  };
}

function jsonResponse(payload, status = 200, contentType = "application/json; charset=utf-8", cache) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: withCommonHeaders({ "content-type": contentType }, cache),
  });
}

function activityResponse(payload, status = 200) {
  return jsonResponse(payload, status, "application/activity+json; charset=utf-8");
}

function textResponse(payload, status = 200, contentType = "text/plain; charset=utf-8", cache) {
  return new Response(payload, {
    status,
    headers: withCommonHeaders({ "content-type": contentType }, cache),
  });
}

function notFound() {
  return jsonResponse({ error: "not_found" }, 404, "application/json; charset=utf-8", "no-store");
}

function withoutBody(response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function mattersArticle(base, prefix = "", handle = DEFAULT_ACTOR_HANDLE) {
  const actor = actorUrl(base, prefix, handle);
  const url = articleUrl(base, prefix);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: url,
    type: "Article",
    name: "Matters main-site publishing as an ActivityPub Article",
    summary:
      "A public long-form article from Matters can be preserved by the IPFS/IPNS-oriented publishing path, emitted as an ActivityPub seed bundle, and served through a gateway that handles live social interaction.",
    content:
      "<p>Matters Fediverse Gateway demonstrates how public long-form writing can move from Matters' main publishing surface into open social discovery without turning essays into short notes.</p><p>The static publishing layer produces a public ActivityPub seed bundle. The gateway runtime owns identity discovery, inbox handling, followers state, delivery, moderation, and recovery.</p>",
    url: ARTICLE_SOURCE_URL,
    attributedTo: actor,
    published: "2026-04-30T00:00:00.000Z",
    updated: "2026-04-30T00:00:00.000Z",
    to: [PUBLIC_AUDIENCE],
    cc: [`${actor}/followers`],
    sensitive: false,
    tag: [
      { type: "Hashtag", name: "#OpenSocial", href: `${ARTICLE_SOURCE_URL}/tags/open-social` },
      { type: "Hashtag", name: "#ActivityPub", href: `${ARTICLE_SOURCE_URL}/tags/activitypub` },
      { type: "Hashtag", name: "#IPFS", href: `${ARTICLE_SOURCE_URL}/tags/ipfs` },
    ],
    attachment: [
      {
        type: "Link",
        mediaType: "text/html",
        name: "Matters main site",
        href: ARTICLE_SOURCE_URL,
      },
    ],
  };
}

function createActivity(base, prefix = "", handle = DEFAULT_ACTOR_HANDLE) {
  const actor = actorUrl(base, prefix, handle);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${base}${prefix}/activities/${ARTICLE_SLUG}-create`,
    type: "Create",
    actor,
    published: "2026-04-30T00:00:00.000Z",
    to: [PUBLIC_AUDIENCE],
    cc: [`${actor}/followers`],
    object: mattersArticle(base, prefix, handle),
  };
}

function actorDocument(base, prefix, request, env, handle = DEFAULT_ACTOR_HANDLE) {
  const actor = actorUrl(base, prefix, handle);
  const isDiagnostic = handle === DIAGNOSTIC_ACTOR_HANDLE;

  return {
    "@context": ACTIVITY_CONTEXT,
    id: actor,
    type: "Person",
    preferredUsername: handle,
    name: isDiagnostic ? "Matters Interop" : "Matters",
    summary:
      "Matters is a long-form publishing community. This demo actor shows how public Matters articles can be exposed to the Fediverse through an ActivityPub gateway.",
    url: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    inbox: `${actor}/inbox`,
    outbox: `${actor}/outbox`,
    followers: `${actor}/followers`,
    following: `${actor}/following`,
    manuallyApprovesFollowers: false,
    discoverable: true,
    indexable: true,
    publicKey: {
      id: `${actor}#main-key`,
      owner: actor,
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjxk5vrkfCOSMDqY5uyLj\nn362WeowOlzbHOBkZ6xvUd3XiK5rZvpdh44vCO4wrP+sJB4lM5XmWvF6ovuXLQFY\nlSBFIYNOO/d0Tb36vSQI6iP3p4evJ2rBFq1XB7L+iwTNYgTOQKNPTm4GtSRiKO4j\nG9OAOVGWj5l+IaBwvle+j/tc/cFjB6mkLkcPpWFAMaowZZB4w1vBnEuPwAslXKr8\nif2dnlz2evdgwYcydF2duIt2WqPC+FoGEzXneXkJooJflF5exsTbWcAyFaGdatRG\n6MhotmpLoAdmsHlcwYCJcgjLX9uNc4k8rVmUKnlMfuqUgEw2MyH/KyPPHqLnmbPY\nRwIDAQAB\n-----END PUBLIC KEY-----",
    },
    endpoints: {
      sharedInbox: inboxUrl(base, prefix),
    },
    published: "2026-04-30T00:00:00.000Z",
  };
}

function webfinger(request, env) {
  const base = publicBase(request, env);
  const prefix = activityPrefix(request, env);
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || subjectFor(request, env);
  const host = new URL(base).host;
  const handle = handleFromResource(resource);
  const acceptedSubjects = new Set([
    `acct:${DEFAULT_ACTOR_HANDLE}@${host}`,
    `acct:${DEFAULT_ACTOR_HANDLE}@matters.town`,
    `acct:${DIAGNOSTIC_ACTOR_HANDLE}@${host}`,
    `acct:${DIAGNOSTIC_ACTOR_HANDLE}@matters.town`,
  ]);

  if (!handle || !acceptedSubjects.has(resource)) {
    return jsonResponse(
      {
        error: "unknown_resource",
        accepted: Array.from(acceptedSubjects),
      },
      404,
      "application/jrd+json; charset=utf-8",
      "no-store",
    );
  }

  return jsonResponse(
    {
      subject: resource,
      aliases: [env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL, actorUrl(base, prefix, handle)],
      links: [
        {
          rel: "http://webfinger.net/rel/profile-page",
          type: "text/html",
          href: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
        },
        {
          rel: "self",
          type: "application/activity+json",
          href: actorUrl(base, prefix, handle),
        },
        {
          rel: "self",
          type: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          href: actorUrl(base, prefix, handle),
        },
      ],
    },
    200,
    "application/jrd+json; charset=utf-8",
  );
}

function hostMeta(base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" type="application/jrd+json" template="${base}/.well-known/webfinger?resource={uri}"/>
</XRD>
`;
}

function nodeInfoDirectory(base, prefix = "") {
  const href = prefix ? `${base}${prefix}/instance-info/2.1` : `${base}/nodeinfo/2.1`;
  return {
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href,
      },
    ],
  };
}

function nodeInfo() {
  return {
    version: "2.1",
    software: {
      name: "matters-fediverse-gateway",
      version: "0.1.0-worker-demo",
      repository: PROJECT_REPOSITORY_URL,
    },
    protocols: ["activitypub"],
    services: {
      inbound: [],
      outbound: [],
    },
    openRegistrations: false,
    usage: {
      users: {
        total: 1,
        activeHalfyear: 1,
        activeMonth: 1,
      },
      localPosts: 1,
      localComments: 0,
    },
    metadata: {
      nodeName: "Matters Fediverse Gateway Worker Demo",
      nodeDescription:
        "A public edge demo showing how Matters main-site publishing can be represented as ActivityPub seed data and canonical gateway objects.",
    },
  };
}

function outbox(base, prefix = "", handle = DEFAULT_ACTOR_HANDLE) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${actorUrl(base, prefix, handle)}/outbox`,
    type: "OrderedCollection",
    totalItems: 1,
    first: {
      id: `${actorUrl(base, prefix, handle)}/outbox?page=true`,
      type: "OrderedCollectionPage",
      partOf: `${actorUrl(base, prefix, handle)}/outbox`,
      orderedItems: [createActivity(base, prefix, handle)],
    },
    orderedItems: [createActivity(base, prefix, handle)],
  };
}

function collection(id, items = []) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id,
    type: "OrderedCollection",
    totalItems: items.length,
    first: {
      id: `${id}?page=true`,
      type: "OrderedCollectionPage",
      partOf: id,
      orderedItems: items,
    },
    orderedItems: items,
  };
}

function seedManifest(base, prefix, request, env) {
  return {
    version: 1,
    generator: "ipns-site-generator",
    generatedAt: "2026-04-30T00:00:00.000Z",
    caseStudy: "Matters main-site public publishing",
    actor: {
      handle: DEFAULT_ACTOR_HANDLE,
      sourceActorId: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${DEFAULT_ACTOR_HANDLE}`,
      canonicalActorId: actorUrl(base, prefix),
      webfingerSubject: subjectFor(request, env),
      profileUrl: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    },
    files: {
      actor: `${base}${prefix}/seed/about.jsonld`,
      outbox: `${base}${prefix}/seed/outbox.jsonld`,
      canonicalActor: actorUrl(base, prefix),
      canonicalOutbox: `${actorUrl(base, prefix)}/outbox`,
    },
    visibility: {
      federatedPublicOnly: true,
      excluded: ["paid", "encrypted", "private", "message"],
    },
    gateway: {
      runtime: "gateway-core",
      edge: "cloudflare-worker",
      repository: PROJECT_REPOSITORY_URL,
    },
  };
}

function seedActor(base, prefix, request, env) {
  return {
    "@context": ACTIVITY_CONTEXT,
    id: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${DEFAULT_ACTOR_HANDLE}`,
    type: "Person",
    preferredUsername: DEFAULT_ACTOR_HANDLE,
    name: "Matters",
    summary: "Static ActivityPub seed actor emitted by the publishing layer before gateway canonicalization.",
    url: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    inbox: `${actorUrl(base, prefix)}/inbox`,
    outbox: `${base}${prefix}/seed/outbox.jsonld`,
    alsoKnownAs: [actorUrl(base, prefix)],
    discoverable: true,
    publicKey: {
      id: `${actorUrl(base, prefix)}#main-key`,
      owner: actorUrl(base, prefix),
    },
    webfingerSubject: subjectFor(request, env),
  };
}

function seedOutbox(base, prefix, env) {
  const sourceActor = `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${DEFAULT_ACTOR_HANDLE}`;
  const article = {
    ...mattersArticle(base, prefix),
    id: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/articles/${ARTICLE_SLUG}`,
    attributedTo: sourceActor,
  };

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${base}${prefix}/seed/outbox.jsonld`,
    type: "OrderedCollection",
    totalItems: 1,
    orderedItems: [
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: `${base}${prefix}/seed/activities/${ARTICLE_SLUG}-create`,
        type: "Create",
        actor: sourceActor,
        published: "2026-04-30T00:00:00.000Z",
        to: [PUBLIC_AUDIENCE],
        cc: [],
        object: article,
      },
    ],
  };
}

async function proxyToGatewayCore(request, env) {
  const origin = env.GATEWAY_CORE_ORIGIN && trimTrailingSlash(env.GATEWAY_CORE_ORIGIN);
  if (!origin) {
    return null;
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${origin}${sourceUrl.pathname}${sourceUrl.search}`);
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));
  headers.set("x-original-url", request.url);

  return fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
}

async function handleInbox(request, env) {
  const proxied = await proxyToGatewayCore(request, env);
  if (proxied) {
    return proxied;
  }

  const bodyText = await request.text();
  return jsonResponse(
    {
      status: "accepted",
      mode: "edge-demo",
      note:
        "This Worker accepted the request for demo visibility only. Production federation should set GATEWAY_CORE_ORIGIN and let gateway-core verify signatures, persist state, and deliver responses.",
      receivedBytes: new TextEncoder().encode(bodyText).byteLength,
    },
    202,
    "application/json; charset=utf-8",
    "no-store",
  );
}

function landing(request, env) {
  const base = publicBase(request, env);
  const prefix = activityPrefix(request, env);
  const host = new URL(base).host;

  return jsonResponse(
    {
      name: "Matters Fediverse Gateway Worker Demo",
      docs: env.PROJECT_DOCS_URL || "https://thematters.github.io/matters-fediverse-gateway/",
      actor: `acct:${DEFAULT_ACTOR_HANDLE}@${host}`,
      diagnosticActor: `acct:${DIAGNOSTIC_ACTOR_HANDLE}@${host}`,
      endpoints: {
        webfinger: `${base}/.well-known/webfinger?resource=acct:${DEFAULT_ACTOR_HANDLE}@${host}`,
        actor: actorUrl(base, prefix),
        outbox: `${actorUrl(base, prefix)}/outbox`,
        diagnosticWebfinger: `${base}/.well-known/webfinger?resource=acct:${DIAGNOSTIC_ACTOR_HANDLE}@${host}`,
        diagnosticActor: actorUrl(base, prefix, DIAGNOSTIC_ACTOR_HANDLE),
        diagnosticOutbox: `${actorUrl(base, prefix, DIAGNOSTIC_ACTOR_HANDLE)}/outbox`,
        article: articleUrl(base, prefix),
        nodeinfo: prefix ? `${base}${prefix}/instance-info/2.1` : `${base}/nodeinfo/2.1`,
        seedManifest: `${base}${prefix}/seed/activitypub-manifest.json`,
        seedOutbox: `${base}${prefix}/seed/outbox.jsonld`,
      },
    },
    200,
    "application/json; charset=utf-8",
  );
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Matters">
  <rect width="64" height="64" rx="12" fill="#6b46ff"/>
  <path d="M18 44V20h6l8 12 8-12h6v24h-7V32l-7 10h-1l-7-10v12h-6z" fill="white"/>
</svg>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = publicBase(request, env);
    const prefix = activityPrefix(request, env);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const actorMatch = actorRouteMatch(path, prefix);
    const actorHandle = actorMatch && SUPPORTED_ACTOR_HANDLES.has(actorMatch[1]) ? actorMatch[1] : null;
    const actorSubpath = actorHandle ? actorMatch[2] || null : null;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCommonHeaders({
          "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
          "access-control-allow-headers": "content-type, date, digest, signature, authorization",
          "access-control-max-age": "86400",
        }, "no-store"),
      });
    }

    if (
      request.method === "POST" &&
      (path === inboxUrl("", prefix) || path === "/inbox" || (actorHandle && actorSubpath === "inbox"))
    ) {
      return handleInbox(request, env);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "method_not_allowed" }, 405, "application/json; charset=utf-8", "no-store");
    }

    const respond = (response) => (request.method === "HEAD" ? withoutBody(response) : response);

    if (path === "/" || path === prefix) {
      return respond(landing(request, env));
    }
    if (path === "/healthz" || path === `${prefix}/healthz`) {
      return respond(jsonResponse({ ok: true }, 200, "application/json; charset=utf-8", "no-store"));
    }
    if (path === "/icon.svg" || path === `${prefix}/icon.svg`) {
      return respond(textResponse(iconSvg(), 200, "image/svg+xml; charset=utf-8"));
    }
    if (path === "/.well-known/webfinger") {
      return respond(webfinger(request, env));
    }
    if (path === "/.well-known/host-meta") {
      return respond(textResponse(hostMeta(base), 200, "application/xrd+xml; charset=utf-8"));
    }
    if (path === "/.well-known/nodeinfo") {
      return respond(jsonResponse(nodeInfoDirectory(base, prefix)));
    }
    if (path === "/nodeinfo/2.1" || path === `${prefix}/nodeinfo/2.1` || path === `${prefix}/instance-info/2.1`) {
      return respond(jsonResponse(nodeInfo()));
    }
    if (path === inboxUrl("", prefix) || path === "/inbox") {
      return respond(activityResponse(collection(inboxUrl(base, prefix))));
    }
    if (actorHandle && actorSubpath === null) {
      return respond(activityResponse(actorDocument(base, prefix, request, env, actorHandle)));
    }
    if (actorHandle && actorSubpath === "outbox") {
      return respond(activityResponse(outbox(base, prefix, actorHandle)));
    }
    if (actorHandle && actorSubpath === "followers") {
      return respond(activityResponse(collection(`${actorUrl(base, prefix, actorHandle)}/followers`)));
    }
    if (actorHandle && actorSubpath === "following") {
      return respond(activityResponse(collection(`${actorUrl(base, prefix, actorHandle)}/following`)));
    }
    if (actorHandle && actorSubpath === "inbox") {
      return respond(activityResponse(collection(`${actorUrl(base, prefix, actorHandle)}/inbox`)));
    }
    if (path === `${prefix}/articles/${ARTICLE_SLUG}`) {
      return respond(activityResponse(mattersArticle(base, prefix)));
    }
    if (path === `${prefix}/seed/activitypub-manifest.json`) {
      return respond(jsonResponse(seedManifest(base, prefix, request, env)));
    }
    if (path === `${prefix}/seed/about.jsonld`) {
      return respond(activityResponse(seedActor(base, prefix, request, env)));
    }
    if (path === `${prefix}/seed/outbox.jsonld`) {
      return respond(activityResponse(seedOutbox(base, prefix, env)));
    }

    return respond(notFound());
  },
};
