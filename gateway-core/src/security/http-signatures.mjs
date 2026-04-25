import { createHash, createSign, createVerify } from "node:crypto";

function quote(value) {
  return `"${value}"`;
}

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader) {
    throw new Error("Missing Signature header");
  }

  const attributes = {};

  for (const part of signatureHeader.split(",")) {
    const [name, rawValue] = part.trim().split("=");
    if (!name || rawValue == null) {
      continue;
    }

    const value = rawValue.startsWith("\"") && rawValue.endsWith("\"")
      ? rawValue.slice(1, -1)
      : rawValue;
    attributes[name] = value;
  }

  if (!attributes.keyId || !attributes.headers || !attributes.signature) {
    throw new Error("Signature header is incomplete");
  }

  return attributes;
}

function createDigest(body) {
  const digest = createHash("sha256").update(body).digest("base64");
  return `SHA-256=${digest}`;
}

function lowerCaseHeaders(headers) {
  const lowered = new Map();

  for (const [key, value] of headers.entries()) {
    lowered.set(key.toLowerCase(), value);
  }

  return lowered;
}

function buildSigningString({ method, pathnameWithQuery, headers, headerNames }) {
  const lowered = lowerCaseHeaders(headers);

  return headerNames
    .map((headerName) => {
      const name = headerName.toLowerCase();

      if (name === "(request-target)") {
        return `(request-target): ${method.toLowerCase()} ${pathnameWithQuery}`;
      }

      const value = lowered.get(name);
      if (!value) {
        throw new Error(`Missing signed header ${name}`);
      }

      return `${name}: ${value}`;
    })
    .join("\n");
}

export function createDigestHeader(body) {
  return createDigest(body);
}

export function signHttpRequest({ method, url, body, keyId, privateKeyPem }) {
  const targetUrl = new URL(url);
  const date = new Date().toUTCString();
  const digest = createDigest(body);
  const headers = ["(request-target)", "host", "date", "digest"];
  const signingString = buildSigningString({
    method,
    pathnameWithQuery: `${targetUrl.pathname}${targetUrl.search}`,
    headers: new Headers({
      host: targetUrl.host,
      date,
      digest,
    }),
    headerNames: headers,
  });

  const signer = createSign("RSA-SHA256");
  signer.update(signingString);
  signer.end();

  const signature = signer.sign(privateKeyPem, "base64");

  return {
    Host: targetUrl.host,
    Date: date,
    Digest: digest,
    Signature: [
      `keyId=${quote(keyId)}`,
      `algorithm=${quote("rsa-sha256")}`,
      `headers=${quote(headers.join(" "))}`,
      `signature=${quote(signature)}`,
    ].join(","),
  };
}

export function verifyHttpSignature({ method, pathnameWithQuery, headers, body, publicKeyPem, expectedKeyId }) {
  const signatureAttributes = parseSignatureHeader(headers.get("signature"));
  const digestHeader = headers.get("digest");

  if (!digestHeader) {
    throw new Error("Missing Digest header");
  }

  const expectedDigest = createDigest(body);
  if (digestHeader !== expectedDigest) {
    throw new Error("Digest mismatch");
  }

  if (expectedKeyId && signatureAttributes.keyId !== expectedKeyId) {
    throw new Error("Signature keyId mismatch");
  }

  const headerNames = signatureAttributes.headers.split(/\s+/).filter(Boolean);
  const signingString = buildSigningString({
    method,
    pathnameWithQuery,
    headers,
    headerNames,
  });

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingString);
  verifier.end();

  const isValid = verifier.verify(publicKeyPem, signatureAttributes.signature, "base64");
  if (!isValid) {
    throw new Error("Signature verification failed");
  }

  return {
    keyId: signatureAttributes.keyId,
    headerNames,
  };
}
