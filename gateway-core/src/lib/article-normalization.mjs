const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";
const SUMMARY_LIMIT = 280;
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "a",
  "strong",
  "em",
  "s",
  "u",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "hr",
]);
const VOID_TAGS = new Set(["br", "hr"]);
const DROP_CONTENT_TAGS = ["script", "style", "iframe", "video", "audio", "object", "embed"];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string" && entry.trim())?.trim() ?? "";
  }

  return "";
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeTextEntities(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function extractAttribute(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? "";
}

function stripDroppedBlocks(html) {
  let result = html;
  for (const tag of DROP_CONTENT_TAGS) {
    result = result.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    result = result.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  return result;
}

function stripHtml(html) {
  return decodeTextEntities(stripDroppedBlocks(String(html)).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeIpfsUrl(value) {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  if (raw.startsWith("ipfs://")) {
    const ipfsPath = raw.slice("ipfs://".length).replace(/^\/+/, "");
    if (!ipfsPath) {
      return null;
    }
    const [hash] = ipfsPath.split("/");
    return {
      url: `https://ipfs.io/ipfs/${ipfsPath}`,
      hash,
    };
  }

  const ipfsGatewayMatch = raw.match(/^https?:\/\/ipfs\.io\/ipfs\/([^/?#]+)(.*)$/i);
  if (ipfsGatewayMatch) {
    return {
      url: raw.replace(/^http:\/\//i, "https://"),
      hash: ipfsGatewayMatch[1],
    };
  }

  return null;
}

function normalizeLinkHref(value) {
  const ipfs = normalizeIpfsUrl(value);
  if (ipfs) {
    return ipfs.url;
  }

  const raw = asString(value);
  return isSafeHttpUrl(raw) ? raw : "";
}

function sanitizeHtml(html) {
  const source = stripDroppedBlocks(String(html));
  let output = "";
  let cursor = 0;
  const openTags = [];

  for (const match of source.matchAll(/<[^>]*>/g)) {
    output += source.slice(cursor, match.index);
    cursor = match.index + match[0].length;

    const token = match[0];
    const close = token.match(/^<\s*\/\s*([a-z0-9-]+)/i);
    if (close) {
      const tagName = close[1].toLowerCase();
      const lastOpenIndex = openTags.lastIndexOf(tagName);
      if (ALLOWED_TAGS.has(tagName) && !VOID_TAGS.has(tagName) && lastOpenIndex !== -1) {
        openTags.splice(lastOpenIndex, 1);
        output += `</${tagName}>`;
      }
      continue;
    }

    const open = token.match(/^<\s*([a-z0-9-]+)/i);
    if (!open) {
      continue;
    }

    const tagName = open[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      continue;
    }

    if (tagName === "a") {
      const href = normalizeLinkHref(extractAttribute(token, "href"));
      if (href) {
        openTags.push(tagName);
        output += `<a href="${escapeAttribute(href)}" rel="noopener noreferrer ugc">`;
      }
      continue;
    }

    if (tagName === "code") {
      const languageClass = extractAttribute(token, "class")
        .split(/\s+/)
        .find((entry) => /^language-[a-z0-9_-]+$/i.test(entry));
      openTags.push(tagName);
      output += languageClass ? `<code class="${escapeAttribute(languageClass)}">` : "<code>";
      continue;
    }

    if (!VOID_TAGS.has(tagName)) {
      openTags.push(tagName);
    }
    output += VOID_TAGS.has(tagName) ? `<${tagName}>` : `<${tagName}>`;
  }

  output += source.slice(cursor);
  return output.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateSummary(value) {
  const text = stripHtml(value);
  if (text.length <= SUMMARY_LIMIT) {
    return text;
  }
  return `${text.slice(0, SUMMARY_LIMIT - 3).trimEnd()}...`;
}

function inferMediaType(url) {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

function normalizeAttachmentUrl(value) {
  const ipfs = normalizeIpfsUrl(value);
  if (ipfs) {
    return ipfs;
  }

  const raw = asString(value);
  return isSafeHttpUrl(raw) ? { url: raw, hash: null } : null;
}

function imageAttachmentsFromContent(content) {
  return [...String(content).matchAll(/<img\b[^>]*>/gi)]
    .map((match) => {
      const source = normalizeAttachmentUrl(extractAttribute(match[0], "src"));
      if (!source) {
        return null;
      }
      const name = asString(extractAttribute(match[0], "alt")) || "Article image";
      return {
        type: "Document",
        mediaType: inferMediaType(source.url),
        url: source.url,
        name,
        ...(source.hash ? { "ipfs:hash": source.hash } : {}),
      };
    })
    .filter(Boolean);
}

function normalizeExistingAttachment(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const source = normalizeAttachmentUrl(firstString(entry.url ?? entry.href));
  if (!source) {
    return null;
  }

  return {
    type: entry.type === "Image" ? "Document" : entry.type ?? "Document",
    mediaType: entry.mediaType ?? inferMediaType(source.url),
    url: source.url,
    name: asString(entry.name) || "Article attachment",
    ...(entry["ipfs:hash"] ? { "ipfs:hash": entry["ipfs:hash"] } : source.hash ? { "ipfs:hash": source.hash } : {}),
  };
}

function dedupeAttachments(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    if (!entry?.url || seen.has(entry.url)) {
      continue;
    }
    seen.add(entry.url);
    deduped.push(entry);
  }
  return deduped;
}

function normalizeAttachments(object, rawContent) {
  const existing = Array.isArray(object.attachment)
    ? object.attachment
    : object.attachment
      ? [object.attachment]
      : [];
  return dedupeAttachments([
    ...existing.map(normalizeExistingAttachment).filter(Boolean),
    ...imageAttachmentsFromContent(rawContent),
  ]);
}

function appendOriginalLink(content, url) {
  if (!url || content.includes(url)) {
    return content;
  }

  const safeUrl = normalizeLinkHref(url);
  if (!safeUrl) {
    return content;
  }

  const originalLink = `<p>Original Matters link: <a href="${escapeAttribute(safeUrl)}" rel="noopener noreferrer ugc">${escapeAttribute(safeUrl)}</a></p>`;
  return content ? `${content}\n${originalLink}` : originalLink;
}

function shouldNormalizeAsArticle(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return false;
  }

  if (object.type === "Article") {
    return true;
  }

  return object.type === "Note" && !object.inReplyTo && Boolean(object.url || object.name || object.summary);
}

export function normalizeArticleObject({ object, actor = null }) {
  if (!shouldNormalizeAsArticle(object)) {
    return object;
  }

  const canonicalUrl = firstString(object.url) || firstString(object.id);
  const rawContent = asString(object.content) || asString(object.summary) || asString(object.name);
  const sanitizedContent = appendOriginalLink(sanitizeHtml(rawContent), canonicalUrl);
  const summary = truncateSummary(object.summary || rawContent || object.name || canonicalUrl);
  const attachments = normalizeAttachments(object, rawContent);

  return {
    ...object,
    type: "Article",
    name: asString(object.name) || summary || canonicalUrl,
    summary,
    content: sanitizedContent,
    url: canonicalUrl || object.url,
    attributedTo: actor?.actorUrl ?? object.attributedTo,
    to: Array.isArray(object.to) && object.to.length ? object.to : [PUBLIC_AUDIENCE],
    cc: Array.isArray(object.cc) ? object.cc : [],
    ...(attachments.length ? { attachment: attachments } : {}),
  };
}
