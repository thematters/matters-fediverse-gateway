const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const ACTIVITY_CONTEXT = [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
  {
    toot: "http://joinmastodon.org/ns#",
    discoverable: "toot:discoverable",
    alsoKnownAs: {
      "@id": "as:alsoKnownAs",
      "@type": "@id",
    },
  },
];

const ACTOR_HANDLE = "matters";
const ARTICLE_SLUG = "matters-main-site-open-social-demo";
const ARTICLE_SOURCE_URL = "https://matters.town";
const PROJECT_REPOSITORY_URL = "https://github.com/thematters/matters-fediverse-gateway";

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function publicBase(request, env) {
  return trimTrailingSlash(env.PUBLIC_BASE_URL || new URL(request.url).origin);
}

function actorUrl(base) {
  return `${base}/users/${ACTOR_HANDLE}`;
}

function articleUrl(base) {
  return `${base}/articles/${ARTICLE_SLUG}`;
}

function subjectFor(request, env) {
  const host = new URL(publicBase(request, env)).host;
  return `acct:${ACTOR_HANDLE}@${host}`;
}

function withCommonHeaders(headers = {}, cache = "public, max-age=60, s-maxage=300") {
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

function mattersArticle(base) {
  const actor = actorUrl(base);
  const url = articleUrl(base);

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

function createActivity(base) {
  const actor = actorUrl(base);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${base}/activities/${ARTICLE_SLUG}-create`,
    type: "Create",
    actor,
    published: "2026-04-30T00:00:00.000Z",
    to: [PUBLIC_AUDIENCE],
    cc: [`${actor}/followers`],
    object: mattersArticle(base),
  };
}

function actorDocument(base, request, env) {
  const actor = actorUrl(base);

  return {
    "@context": ACTIVITY_CONTEXT,
    id: actor,
    type: "Person",
    preferredUsername: ACTOR_HANDLE,
    name: "Matters",
    summary:
      "Matters is a long-form publishing community. This demo actor shows how public Matters articles can be exposed to the Fediverse through an ActivityPub gateway.",
    url: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    inbox: `${actor}/inbox`,
    outbox: `${actor}/outbox`,
    followers: `${actor}/followers`,
    following: `${actor}/following`,
    discoverable: true,
    alsoKnownAs: [env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL],
    icon: {
      type: "Image",
      mediaType: "image/svg+xml",
      url: `${base}/icon.svg`,
    },
    publicKey: {
      id: `${actor}#main-key`,
      owner: actor,
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALeg6nXAgK1jIS3g9R4J/fQKdemoOnly\nActivityPubGatewayPublicKeyPlaceholderDoNotUseForProductionCAwEAAQ==\n-----END PUBLIC KEY-----",
    },
    endpoints: {
      sharedInbox: `${base}/inbox`,
    },
    published: "2026-04-30T00:00:00.000Z",
  };
}

function webfinger(request, env) {
  const base = publicBase(request, env);
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || subjectFor(request, env);
  const host = new URL(base).host;
  const acceptedSubjects = new Set([
    `acct:${ACTOR_HANDLE}@${host}`,
    `acct:${ACTOR_HANDLE}@matters.town`,
  ]);

  if (!acceptedSubjects.has(resource)) {
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
      aliases: [env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL, actorUrl(base)],
      links: [
        {
          rel: "http://webfinger.net/rel/profile-page",
          type: "text/html",
          href: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
        },
        {
          rel: "self",
          type: "application/activity+json",
          href: actorUrl(base),
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

function nodeInfoDirectory(base) {
  return {
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href: `${base}/nodeinfo/2.1`,
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

function outbox(base) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${actorUrl(base)}/outbox`,
    type: "OrderedCollection",
    totalItems: 1,
    first: {
      id: `${actorUrl(base)}/outbox?page=true`,
      type: "OrderedCollectionPage",
      partOf: `${actorUrl(base)}/outbox`,
      orderedItems: [createActivity(base)],
    },
    orderedItems: [createActivity(base)],
  };
}

function collection(id, items = []) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id,
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items,
  };
}

function seedManifest(base, request, env) {
  return {
    version: 1,
    generator: "ipns-site-generator",
    generatedAt: "2026-04-30T00:00:00.000Z",
    caseStudy: "Matters main-site public publishing",
    actor: {
      handle: ACTOR_HANDLE,
      sourceActorId: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${ACTOR_HANDLE}`,
      canonicalActorId: actorUrl(base),
      webfingerSubject: subjectFor(request, env),
      profileUrl: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    },
    files: {
      actor: `${base}/seed/about.jsonld`,
      outbox: `${base}/seed/outbox.jsonld`,
      canonicalActor: actorUrl(base),
      canonicalOutbox: `${actorUrl(base)}/outbox`,
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

function seedActor(base, request, env) {
  return {
    "@context": ACTIVITY_CONTEXT,
    id: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${ACTOR_HANDLE}`,
    type: "Person",
    preferredUsername: ACTOR_HANDLE,
    name: "Matters",
    summary: "Static ActivityPub seed actor emitted by the publishing layer before gateway canonicalization.",
    url: env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL,
    inbox: `${actorUrl(base)}/inbox`,
    outbox: `${base}/seed/outbox.jsonld`,
    alsoKnownAs: [actorUrl(base)],
    discoverable: true,
    publicKey: {
      id: `${actorUrl(base)}#main-key`,
      owner: actorUrl(base),
    },
    webfingerSubject: subjectFor(request, env),
  };
}

function seedOutbox(base, env) {
  const sourceActor = `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/@${ACTOR_HANDLE}`;
  const article = {
    ...mattersArticle(base),
    id: `${env.MATTERS_PROFILE_URL || ARTICLE_SOURCE_URL}/articles/${ARTICLE_SLUG}`,
    attributedTo: sourceActor,
  };

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${base}/seed/outbox.jsonld`,
    type: "OrderedCollection",
    totalItems: 1,
    orderedItems: [
      {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: `${base}/seed/activities/${ARTICLE_SLUG}-create`,
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
  const host = new URL(base).host;

  return jsonResponse(
    {
      name: "Matters Fediverse Gateway Worker Demo",
      docs: env.PROJECT_DOCS_URL || "https://thematters.github.io/matters-fediverse-gateway/",
      actor: `acct:${ACTOR_HANDLE}@${host}`,
      endpoints: {
        webfinger: `${base}/.well-known/webfinger?resource=acct:${ACTOR_HANDLE}@${host}`,
        actor: actorUrl(base),
        outbox: `${actorUrl(base)}/outbox`,
        article: articleUrl(base),
        nodeinfo: `${base}/nodeinfo/2.1`,
        seedManifest: `${base}/seed/activitypub-manifest.json`,
        seedOutbox: `${base}/seed/outbox.jsonld`,
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
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCommonHeaders({
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, date, digest, signature, authorization",
          "access-control-max-age": "86400",
        }, "no-store"),
      });
    }

    if (request.method === "POST" && (path === "/inbox" || path === `/users/${ACTOR_HANDLE}/inbox`)) {
      return handleInbox(request, env);
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, "application/json; charset=utf-8", "no-store");
    }

    if (path === "/") {
      return landing(request, env);
    }
    if (path === "/healthz") {
      return jsonResponse({ ok: true }, 200, "application/json; charset=utf-8", "no-store");
    }
    if (path === "/icon.svg") {
      return textResponse(iconSvg(), 200, "image/svg+xml; charset=utf-8");
    }
    if (path === "/.well-known/webfinger") {
      return webfinger(request, env);
    }
    if (path === "/.well-known/host-meta") {
      return textResponse(hostMeta(base), 200, "application/xrd+xml; charset=utf-8");
    }
    if (path === "/.well-known/nodeinfo") {
      return jsonResponse(nodeInfoDirectory(base));
    }
    if (path === "/nodeinfo/2.1") {
      return jsonResponse(nodeInfo());
    }
    if (path === `/users/${ACTOR_HANDLE}` || path === `/users/${ACTOR_HANDLE}.json`) {
      return activityResponse(actorDocument(base, request, env));
    }
    if (path === `/users/${ACTOR_HANDLE}/outbox`) {
      return activityResponse(outbox(base));
    }
    if (path === `/users/${ACTOR_HANDLE}/followers`) {
      return activityResponse(collection(`${actorUrl(base)}/followers`));
    }
    if (path === `/users/${ACTOR_HANDLE}/following`) {
      return activityResponse(collection(`${actorUrl(base)}/following`));
    }
    if (path === `/articles/${ARTICLE_SLUG}`) {
      return activityResponse(mattersArticle(base));
    }
    if (path === "/seed/activitypub-manifest.json") {
      return jsonResponse(seedManifest(base, request, env));
    }
    if (path === "/seed/about.jsonld") {
      return activityResponse(seedActor(base, request, env));
    }
    if (path === "/seed/outbox.jsonld") {
      return activityResponse(seedOutbox(base, env));
    }

    return notFound();
  },
};
