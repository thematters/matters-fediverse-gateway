# Gateway Core Key Rotation Runbook

Last updated: 2026-05-01

Scope: `gateway-core` local actor HTTP Signature keys. This runbook covers local, operator-controlled rotation only. It does not require DID, ZK, Billboard, deployment, external publishing, or third-party account access.

## When to Rotate

- Scheduled maintenance rotation for a long-running gateway actor.
- Suspected private key exposure.
- Migration from a development key to a production-held secret file.
- Recovery after an operator confirms that a private key file was copied to the wrong host.

## Pre-Flight Checklist

- Confirm the target actor handle and config path.
- Confirm the current `publicKeyPemFile` and `privateKeyPemFile` exist.
- Confirm backup exists for the config file and current private key.
- Confirm the overlap window. Default is 14 days.
- Confirm a human operator owns the external publishing step before changing production traffic.

Local checks:

```sh
cd gateway-core
npm run check:secret-layout
npm test
```

## Rotation Procedure

Dry-run first:

```sh
cd gateway-core
npm run rotate:key -- --actor alice --output-dir ../runtime/key-rotation-alice-dry-run
```

Write local artifacts:

```sh
cd gateway-core
npm run rotate:key -- --actor alice --output-dir ../runtime/key-rotation-alice --overlap-days 14 --write
```

The script writes:

- a new public key PEM file
- a new private key PEM file
- updated actor config with `keyId`, `previousKeyId`, `publicKeyPemFile`, `privateKeyPemFile`, and `previousPublicKeyPemFile`
- a local `Update` Actor activity artifact
- a rotation event artifact with overlap timestamps

## Overlap Window

During overlap, the actor document exposes:

- `publicKey`: current signing key
- `previousPublicKey`: previous signing key retained for remote cache convergence

Inbound signature verification also accepts remote actor records with `previousKeyId` and `previousPublicKeyPem`, so remote peers can rotate without causing avoidable rejects during their own overlap windows.

## Post-Rotation Checks

```sh
cd gateway-core
npm test
npm run check:secret-layout
```

Inspect the actor document locally and confirm both keys are visible during overlap:

```sh
node src/server.mjs --config ./config/dev.instance.json
```

Then request `/users/<handle>` from the local gateway.

## Retire Previous Key After Overlap

After the overlap window ends and a human operator confirms production cutover timing, remove the previous public key from the actor document:

```sh
cd gateway-core
npm run rotate:key -- --actor alice --output-dir ../runtime/key-rotation-alice-retire --retire-previous-key --write
```

The script keeps the current `keyId`, removes `previousKeyId` and `previousPublicKeyPem/File`, writes a new local Actor Update artifact without `previousPublicKey`, and writes a retirement event artifact.

## Rollback

- Restore the backed-up config file.
- Restore the prior private key file if it was moved.
- Re-run `npm run check:secret-layout`.
- Re-run `npm test`.
- If an external Actor Update was already published, human operators must decide whether to publish a corrective Actor Update and whether to extend the overlap window.

## Human-Owned Decisions

- Production cutover timing.
- Whether and where to publish the generated Actor Update.
- Whether a suspected key exposure requires legal, privacy, or user-facing communication.
- Whether remote peers need manual notification.
