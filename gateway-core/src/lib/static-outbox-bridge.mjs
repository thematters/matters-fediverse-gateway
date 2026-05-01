import { readFile } from "node:fs/promises";
import { normalizeArticleObject } from "./article-normalization.mjs";

const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";

function emptyOutbox(actor) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: actor.outboxUrl,
    type: "OrderedCollection",
    totalItems: 0,
    orderedItems: [],
  };
}

function normalizeAudience(values, fallback = []) {
  if (Array.isArray(values)) {
    return values;
  }

  if (typeof values === "string" && values.trim()) {
    return [values];
  }

  return fallback;
}

function rewriteObject(object, actor) {
  const rewritten = {
    ...object,
    attributedTo: actor.actorUrl,
    to: normalizeAudience(object.to, [PUBLIC_AUDIENCE]),
    cc: normalizeAudience(object.cc, []),
  };
  return normalizeArticleObject({ object: rewritten, actor });
}

function rewriteCreateActivity(item, actor) {
  const object = item?.object && typeof item.object === "object"
    ? rewriteObject(item.object, actor)
    : item.object;

  return {
    ...item,
    actor: actor.actorUrl,
    to: normalizeAudience(item.to, [PUBLIC_AUDIENCE]),
    cc: [actor.followersUrl],
    object,
  };
}

function normalizeCollection(parsed, actor) {
  const orderedItems = Array.isArray(parsed.orderedItems)
    ? parsed.orderedItems.map((item) => rewriteCreateActivity(item, actor))
    : [];

  return {
    "@context": parsed["@context"] ?? "https://www.w3.org/ns/activitystreams",
    id: actor.outboxUrl,
    type: parsed.type ?? "OrderedCollection",
    totalItems: orderedItems.length,
    orderedItems,
  };
}

export function createStaticOutboxBridge() {
  return {
    async getOutbox(actor) {
      if (!actor.staticOutboxFile) {
        return emptyOutbox(actor);
      }

      const raw = await readFile(actor.staticOutboxFile, "utf8");
      const parsed = JSON.parse(raw);
      return normalizeCollection(parsed, actor);
    },
  };
}
