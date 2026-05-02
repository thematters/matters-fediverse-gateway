import { createHash } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 8788,
    outputDir: "./runtime/webhooks",
    pathPrefix: "/runtime-",
    maxBodyBytes: 1_048_576,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--host") {
      options.host = argv[index + 1];
      index += 1;
    } else if (value === "--port") {
      options.port = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (value === "--output-dir") {
      options.outputDir = argv[index + 1];
      index += 1;
    } else if (value === "--path-prefix") {
      options.pathPrefix = argv[index + 1];
      index += 1;
    } else if (value === "--max-body-bytes") {
      options.maxBodyBytes = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (value === "--bearer-token") {
      options.bearerToken = argv[index + 1];
      index += 1;
    } else if (value === "--bearer-token-file") {
      options.bearerTokenFile = argv[index + 1];
      index += 1;
    }
  }

  if (!Number.isFinite(options.port) || options.port < 0) {
    throw new Error("--port must be a non-negative integer");
  }
  if (!Number.isFinite(options.maxBodyBytes) || options.maxBodyBytes <= 0) {
    throw new Error("--max-body-bytes must be a positive integer");
  }
  if (!options.pathPrefix.startsWith("/")) {
    options.pathPrefix = `/${options.pathPrefix}`;
  }

  return options;
}

async function readBearerToken(options) {
  if (options.bearerToken?.trim()) {
    return options.bearerToken.trim();
  }
  if (options.bearerTokenFile?.trim()) {
    return (await readFile(path.resolve(options.bearerTokenFile), "utf8")).trim();
  }
  return null;
}

function maskHeaderValue(name, value) {
  const lowered = name.toLowerCase();
  if (
    lowered === "authorization" ||
    lowered.includes("token") ||
    lowered.includes("secret") ||
    lowered.includes("key")
  ) {
    return value ? "[masked]" : value;
  }
  return value;
}

function maskHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, maskHeaderValue(name, value)]),
  );
}

function createTimestampToken(date) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function createSafePathToken(urlPath) {
  return urlPath
    .replace(/^\/+/, "")
    .replaceAll("/", "-")
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .slice(0, 80) || "webhook";
}

async function readRequestBody(request, maxBodyBytes) {
  const chunks = [];
  let bodyBytes = 0;

  for await (const chunk of request) {
    bodyBytes += chunk.byteLength;
    if (bodyBytes > maxBodyBytes) {
      const error = new Error(`request body exceeds ${maxBodyBytes} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseJsonBody(bodyBuffer, contentType) {
  if (!contentType?.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return JSON.parse(bodyBuffer.toString("utf8"));
  } catch {
    return null;
  }
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

const options = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(options.outputDir);
await mkdir(outputDir, { recursive: true });
const expectedBearerToken = await readBearerToken(options);
let sequence = 0;

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "GET" && requestUrl.pathname === "/healthz") {
    writeJson(response, 200, {
      status: "ok",
      outputDir,
      pathPrefix: options.pathPrefix,
    });
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 405, { status: "error", error: "method_not_allowed" });
    return;
  }

  if (!requestUrl.pathname.startsWith(options.pathPrefix)) {
    writeJson(response, 404, { status: "error", error: "path_not_found" });
    return;
  }

  if (expectedBearerToken) {
    const expected = `Bearer ${expectedBearerToken}`;
    if (request.headers.authorization !== expected) {
      writeJson(response, 401, { status: "error", error: "unauthorized" });
      return;
    }
  }

  try {
    const bodyBuffer = await readRequestBody(request, options.maxBodyBytes);
    const receivedAt = new Date();
    const bodyText = bodyBuffer.toString("utf8");
    const bodySha256 = createHash("sha256").update(bodyBuffer).digest("hex");
    const json = parseJsonBody(bodyBuffer, request.headers["content-type"]);
    const fileName = `${createTimestampToken(receivedAt)}-${String(sequence++).padStart(4, "0")}-${createSafePathToken(requestUrl.pathname)}.json`;
    const filePath = path.join(outputDir, fileName);
    const record = {
      receivedAt: receivedAt.toISOString(),
      method: request.method,
      path: requestUrl.pathname,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      headers: maskHeaders(request.headers),
      bodyBytes: bodyBuffer.byteLength,
      bodySha256,
      bodyText,
      json,
    };

    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    writeJson(response, 202, {
      status: "accepted",
      file: filePath,
      bodyBytes: bodyBuffer.byteLength,
      bodySha256,
    });
  } catch (error) {
    writeJson(response, error.statusCode ?? 500, {
      status: "error",
      error: error.message,
    });
  }
});

server.listen(options.port, options.host, () => {
  const address = server.address();
  process.stdout.write(
    `${JSON.stringify({
      status: "listening",
      host: options.host,
      port: address.port,
      outputDir,
      pathPrefix: options.pathPrefix,
      bearerTokenRequired: Boolean(expectedBearerToken),
    })}\n`,
  );
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
