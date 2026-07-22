import { createHash, timingSafeEqual } from "node:crypto";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function readBearerToken(request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1]?.trim() || null;
}

export function verifyBearerToken(request, expectedToken) {
  if (!expectedToken?.trim()) {
    return false;
  }

  const providedToken = readBearerToken(request);
  if (!providedToken) {
    return false;
  }

  return timingSafeEqual(digest(providedToken), digest(expectedToken.trim()));
}
