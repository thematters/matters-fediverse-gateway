import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedIpv4Addresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fec0::", 10],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

export class FederationUrlPolicyError extends Error {
  constructor(message, { code = "unsafe_federation_url", cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.code = code;
    this.stage = "url_policy";
    this.temporary = false;
  }
}

function normalizeHostname(hostname) {
  return hostname
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

export function isBlockedNetworkAddress(address) {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) {
    return blockedIpv4Addresses.check(normalized, "ipv4");
  }
  if (family === 6) {
    return blockedIpv6Addresses.check(normalized, "ipv6");
  }
  return true;
}

export function validateFederationUrl(value, { allowFragment = false } = {}) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch (error) {
    throw new FederationUrlPolicyError("Federation URL must be valid", {
      code: "invalid_federation_url",
      cause: error,
    });
  }

  if (url.protocol !== "https:") {
    throw new FederationUrlPolicyError("Federation URL must use HTTPS", {
      code: "federation_url_https_required",
    });
  }
  if (url.username || url.password) {
    throw new FederationUrlPolicyError("Federation URL must not contain credentials", {
      code: "federation_url_credentials_forbidden",
    });
  }
  if (!allowFragment && url.hash) {
    throw new FederationUrlPolicyError("Federation URL must not contain a fragment", {
      code: "federation_url_fragment_forbidden",
    });
  }

  const hostname = normalizeHostname(url.hostname);
  const addressFamily = isIP(hostname);
  if (
    !hostname ||
    hostname === "localhost" ||
    (!addressFamily && !hostname.includes(".")) ||
    [".localhost", ".local", ".internal", ".home", ".lan"].some((suffix) =>
      hostname.endsWith(suffix),
    )
  ) {
    throw new FederationUrlPolicyError("Federation URL hostname is not publicly routable", {
      code: "federation_url_hostname_forbidden",
    });
  }
  if (addressFamily && isBlockedNetworkAddress(hostname)) {
    throw new FederationUrlPolicyError("Federation URL resolves to a blocked network", {
      code: "federation_url_network_forbidden",
    });
  }

  return url;
}

export function createSafeLookup({ lookup = dnsLookup } = {}) {
  return (hostname, options, callback) => {
    const lookupOptions =
      typeof options === "number" ? { family: options } : { ...(options ?? {}) };

    lookup(
      normalizeHostname(hostname),
      {
        ...lookupOptions,
        all: true,
        verbatim: true,
      },
      (error, addresses) => {
        if (error) {
          callback(error);
          return;
        }

        const records = (Array.isArray(addresses) ? addresses : [addresses])
          .filter((entry) => entry?.address && (entry.family === 4 || entry.family === 6))
          .map((entry) => ({
            address: entry.address,
            family: entry.family,
          }));
        if (!records.length) {
          callback(
            new FederationUrlPolicyError(`No usable DNS records for ${hostname}`, {
              code: "federation_dns_empty",
            }),
          );
          return;
        }

        const blocked = records.find((entry) =>
          isBlockedNetworkAddress(entry.address),
        );
        if (blocked) {
          callback(
            new FederationUrlPolicyError(
              `Federation hostname ${hostname} resolved to a blocked network`,
              {
                code: "federation_dns_network_forbidden",
              },
            ),
          );
          return;
        }

        if (lookupOptions.all) {
          callback(null, records);
          return;
        }

        callback(null, records[0].address, records[0].family);
      },
    );
  };
}

const safeFederationDispatcher = new Agent({
  connect: {
    lookup: createSafeLookup(),
  },
});

function combineSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export async function safeFederationFetch(
  input,
  init = {},
  {
    allowFragment = false,
    buildHeaders = null,
    dispatcher = safeFederationDispatcher,
    fetchImpl = undiciFetch,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  let currentUrl = validateFederationUrl(input, { allowFragment });
  let redirects = 0;

  while (true) {
    const headers = new Headers(init.headers ?? {});
    if (buildHeaders) {
      const dynamicHeaders = new Headers(buildHeaders(currentUrl.href) ?? {});
      for (const [name, value] of dynamicHeaders.entries()) {
        headers.set(name, value);
      }
    }

    const response = await fetchImpl(currentUrl.href, {
      ...init,
      dispatcher,
      headers,
      redirect: "manual",
      signal: combineSignal(init.signal, timeoutMs),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      throw new FederationUrlPolicyError("Federation redirect is missing Location", {
        code: "federation_redirect_invalid",
      });
    }
    if (redirects >= maxRedirects) {
      throw new FederationUrlPolicyError("Federation redirect limit exceeded", {
        code: "federation_redirect_limit",
      });
    }

    currentUrl = validateFederationUrl(new URL(location, currentUrl), {
      allowFragment,
    });
    redirects += 1;
  }
}

export async function readLimitedJson(
  response,
  { maxBytes = DEFAULT_MAX_RESPONSE_BYTES } = {},
) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new FederationUrlPolicyError("Federation response is too large", {
      code: "federation_response_too_large",
    });
  }

  if (!response.body?.getReader) {
    return response.json();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FederationUrlPolicyError("Federation response is too large", {
          code: "federation_response_too_large",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body));
}
