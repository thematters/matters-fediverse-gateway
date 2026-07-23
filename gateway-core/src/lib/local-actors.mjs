const HANDLE_PATTERN = /^[a-z0-9_][a-z0-9_.-]{0,63}$/u;

function normalizeUrl(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${field} must use https`);
  }

  return parsed.href;
}

export function normalizeLocalActorProfile(profile, config) {
  const handle = profile?.handle?.trim().toLowerCase() ?? "";
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error("handle must match the ActivityPub handle contract");
  }

  const displayName = profile?.displayName?.trim() ?? "";
  if (!displayName || displayName.length > 200) {
    throw new Error("displayName is required and must be at most 200 characters");
  }

  const summary = profile?.summary?.trim() ?? "";
  if (summary.length > 2_000) {
    throw new Error("summary must be at most 2000 characters");
  }

  const profileUrl = normalizeUrl(profile?.profileUrl?.trim() ?? "", "profileUrl");
  const allowedHosts = config.dynamicActors?.profileHostAllowlist ?? [];
  if (allowedHosts.length > 0 && !allowedHosts.includes(new URL(profileUrl).hostname.toLowerCase())) {
    throw new Error("profileUrl host is not allowed");
  }

  const aliases = [...new Set((profile?.aliases ?? []).map((alias) => normalizeUrl(alias, "alias")))];
  if (!aliases.includes(profileUrl)) {
    aliases.unshift(profileUrl);
  }

  const avatarUrl = profile?.avatarUrl?.trim()
    ? normalizeUrl(profile.avatarUrl.trim(), "avatarUrl")
    : null;
  const headerUrl = profile?.headerUrl?.trim()
    ? normalizeUrl(profile.headerUrl.trim(), "headerUrl")
    : null;

  return {
    handle,
    displayName,
    summary,
    profileUrl,
    aliases,
    avatarUrl,
    headerUrl,
    autoAcceptFollows: profile?.autoAcceptFollows !== false,
    updatedAt: profile?.updatedAt ?? new Date().toISOString(),
  };
}

export function buildLocalActor(profile, config) {
  const activityBaseUrl = config.instance.activityBaseUrl ?? config.instance.baseUrl;
  const actorUrl = `${activityBaseUrl}/users/${profile.handle}`;
  const signingKey = config.dynamicActors?.sharedSigningKey;
  if (!signingKey?.publicKeyPem?.trim() || !signingKey?.privateKeyPem?.trim()) {
    throw new Error("dynamic actor shared signing key is not configured");
  }

  return {
    ...profile,
    staticOutboxFile: null,
    staticBundleManifestFile: null,
    actorUrl,
    inboxUrl: `${actorUrl}/inbox`,
    outboxUrl: `${actorUrl}/outbox`,
    followersUrl: `${actorUrl}/followers`,
    followingUrl: `${actorUrl}/following`,
    publicKeyPem: signingKey.publicKeyPem,
    privateKeyPem: signingKey.privateKeyPem,
    keyId: `${actorUrl}#main-key`,
    previousPublicKeyPem: signingKey.previousPublicKeyPem ?? null,
    previousKeyId: signingKey.previousPublicKeyPem ? `${actorUrl}#previous-key` : null,
  };
}
