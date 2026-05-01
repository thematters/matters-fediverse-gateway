import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const options = {
    configPath: "./config/dev.instance.json",
    overlapDays: 14,
    retirePreviousKey: false,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--actor") {
      options.actorHandle = argv[index + 1];
      index += 1;
    } else if (value === "--output-dir") {
      options.outputDir = argv[index + 1];
      index += 1;
    } else if (value === "--overlap-days") {
      options.overlapDays = Number(argv[index + 1]);
      index += 1;
    } else if (value === "--retire-previous-key") {
      options.retirePreviousKey = true;
    } else if (value === "--write") {
      options.write = true;
    }
  }

  return options;
}

function exportPemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

function ensurePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function relativeFromConfig(configDir, targetPath) {
  const relative = path.relative(configDir, targetPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function buildActorDocument({ instanceBaseUrl, handle, actor, publicKeyPem }) {
  const actorUrl = `${instanceBaseUrl}/users/${handle}`;
  const document = {
    "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
    id: actorUrl,
    type: "Person",
    preferredUsername: handle,
    name: actor.displayName ?? handle,
    summary: actor.summary ?? "",
    url: `${instanceBaseUrl}/@${handle}`,
    inbox: `${actorUrl}/inbox`,
    outbox: `${actorUrl}/outbox`,
    followers: `${actorUrl}/followers`,
    following: `${actorUrl}/following`,
    alsoKnownAs: actor.aliases ?? [],
    manuallyApprovesFollowers: actor.autoAcceptFollows === false,
    endpoints: {
      sharedInbox: `${instanceBaseUrl}/inbox`,
    },
    publicKey: {
      id: actor.keyId,
      owner: actorUrl,
      publicKeyPem,
    },
  };

  if (actor.previousPublicKeyPem && actor.previousKeyId) {
    document.previousPublicKey = {
      id: actor.previousKeyId,
      owner: actorUrl,
      publicKeyPem: actor.previousPublicKeyPem,
    };
  }

  return document;
}

async function readConfiguredPem(configDir, inlinePem, pemFile, label) {
  if (inlinePem?.trim()) {
    return inlinePem;
  }

  if (pemFile?.trim()) {
    return readFile(path.resolve(configDir, pemFile), "utf8");
  }

  throw new Error(`${label} is required`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.actorHandle) {
  throw new Error("--actor is required");
}

const configPath = path.resolve(args.configPath);
const configDir = path.dirname(configPath);
const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
const actor = rawConfig.actors?.[args.actorHandle];

if (!actor) {
  throw new Error(`Unknown actor ${args.actorHandle}`);
}

const domain = rawConfig.instance?.domain?.trim();
if (!domain) {
  throw new Error("instance.domain is required");
}

const instanceBaseUrl = `https://${domain.replace(/\/$/, "")}`;
const actorUrl = `${instanceBaseUrl}/users/${args.actorHandle}`;
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const overlapDays = ensurePositiveInteger(args.overlapDays, 14);
const outputDir = path.resolve(args.outputDir ?? path.join(configDir, `key-rotation-${args.actorHandle}-${stamp}`));
const publicKeyFile = path.join(outputDir, `${args.actorHandle}-${stamp}.public.pem`);
const privateKeyFile = path.join(outputDir, `${args.actorHandle}-${stamp}.private.pem`);
const oldKeyId = actor.keyId?.trim() || `${actorUrl}#main-key`;
const newKeyId = args.retirePreviousKey ? oldKeyId : `${actorUrl}#key-${stamp.toLowerCase()}`;
const currentPublicKeyPem = await readConfiguredPem(configDir, actor.publicKeyPem, actor.publicKeyPemFile, "current public key");
const pemPair = args.retirePreviousKey
  ? {
      publicKeyPem: currentPublicKeyPem,
      privateKeyPem: null,
    }
  : exportPemPair();

const updatedConfig = structuredClone(rawConfig);
const updatedActor = updatedConfig.actors[args.actorHandle];
if (args.retirePreviousKey) {
  updatedActor.keyId = oldKeyId;
  delete updatedActor.previousKeyId;
  delete updatedActor.previousPublicKeyPem;
  delete updatedActor.previousPublicKeyPemFile;
} else {
  updatedActor.previousKeyId = oldKeyId;
  if (actor.publicKeyPemFile?.trim()) {
    updatedActor.previousPublicKeyPemFile = actor.publicKeyPemFile.trim();
  } else if (actor.publicKeyPem?.trim()) {
    updatedActor.previousPublicKeyPem = actor.publicKeyPem;
  }
  updatedActor.keyId = newKeyId;
  updatedActor.publicKeyPemFile = relativeFromConfig(configDir, publicKeyFile);
  updatedActor.privateKeyPemFile = relativeFromConfig(configDir, privateKeyFile);
  delete updatedActor.publicKeyPem;
  delete updatedActor.privateKeyPem;
}

const actorDocument = buildActorDocument({
  instanceBaseUrl,
  handle: args.actorHandle,
  actor: {
    ...updatedActor,
    previousPublicKeyPem: args.retirePreviousKey ? null : currentPublicKeyPem,
  },
  publicKeyPem: pemPair.publicKeyPem,
});

const updateActivity = {
  "@context": "https://www.w3.org/ns/activitystreams",
  id: `${instanceBaseUrl}/activities/${now.getTime()}-key-rotation-${args.actorHandle}`,
  type: "Update",
  actor: actorUrl,
  to: ["https://www.w3.org/ns/activitystreams#Public"],
  object: actorDocument,
};

const rotationEvent = {
  event: args.retirePreviousKey ? "actor-key-retire-previous" : "actor-key-rotation",
  actorHandle: args.actorHandle,
  actorUrl,
  oldKeyId,
  newKeyId,
  previousKeyId: args.retirePreviousKey ? actor.previousKeyId ?? null : updatedActor.previousKeyId,
  overlapStartedAt: now.toISOString(),
  overlapEndsAt: new Date(now.getTime() + overlapDays * 24 * 60 * 60 * 1000).toISOString(),
  configPath,
  write: args.write,
};

if (args.write) {
  await mkdir(outputDir, { recursive: true });
  if (!args.retirePreviousKey) {
    await writeFile(publicKeyFile, pemPair.publicKeyPem, { mode: 0o644 });
    await writeFile(privateKeyFile, pemPair.privateKeyPem, { mode: 0o600 });
  }
  await writeFile(configPath, `${JSON.stringify(updatedConfig, null, 2)}\n`);
  await writeFile(path.join(outputDir, `actor-update-${args.actorHandle}.json`), `${JSON.stringify(updateActivity, null, 2)}\n`);
  await writeFile(path.join(outputDir, `rotation-event-${args.actorHandle}.json`), `${JSON.stringify(rotationEvent, null, 2)}\n`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: args.write ? "written" : "dry-run",
      outputDir,
      configPath,
      actorHandle: args.actorHandle,
      mode: args.retirePreviousKey ? "retire-previous-key" : "rotate",
      oldKeyId,
      newKeyId,
      overlapDays,
      files: {
        publicKeyFile: args.retirePreviousKey ? null : publicKeyFile,
        privateKeyFile: args.retirePreviousKey ? null : privateKeyFile,
        actorUpdateFile: path.join(outputDir, `actor-update-${args.actorHandle}.json`),
        rotationEventFile: path.join(outputDir, `rotation-event-${args.actorHandle}.json`),
      },
      updatedActorConfig: updatedActor,
      rotationEvent,
      updateActivity,
    },
    null,
    2,
  )}\n`,
);
