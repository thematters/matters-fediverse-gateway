# AWS Gateway-Core Origin Runbook

## Goal

把 `gateway-core` 從本機 Mac staging 移到一台獨立 AWS origin，讓 canonical `acct:mashbeanmatters@matters.town` 可以進入真實 follow / reply 測試，但不把 federation runtime 放進 `matters-server` Elastic Beanstalk，也不佔用主站後端資源。

## Recommended Shape

- AWS EC2 small VM runs only `gateway-core`.
- SQLite stays on the VM EBS volume under `/var/lib/matters-gateway/runtime/`.
- `systemd` keeps `gateway-core` alive.
- Cloudflare remains the public edge for `matters.town/.well-known/*` and `matters.town/ap/*`.
- Cloudflare Worker forwards canonical pilot actor reads and inbox writes to the AWS origin when `GATEWAY_CORE_ORIGIN` is configured.
- The origin should sit in the existing Matters `dev-vpc` private subnet and should not receive a public IPv4 address. Use Cloudflare Tunnel for ingress.
- The origin should not expose public inbound ports directly.

Do not host this inside `matters-server-develop` or `matters-server-prod-new`; federation delivery, inbox persistence, retry, moderation, and SQLite recovery should fail independently from the main Matters backend.

## Current AWS Cost Fit

The Matters AWS account already has a `dev-vpc` with private subnets and an existing NAT Gateway. The cheapest no-rewrite placement is therefore:

- VPC: existing `dev-vpc`
- Subnet: private subnet such as `dev-private-sub-2`
- Public IPv4: disabled
- Load balancer: none
- NAT Gateway: reuse the existing dev NAT Gateway
- Storage: 20 GB gp3 EBS on the instance
- Backups: write to an existing private S3 bucket or prefix; do not create a new bucket unless access policy separation requires it

This avoids new fixed charges for public IPv4, NAT Gateway, and ALB. The expected incremental fixed cost for a `t3a.micro` origin is roughly the EC2 instance plus 20 GB gp3 EBS. Do not place this process inside an Elastic Beanstalk environment just to save the VM cost: EB deploys and instance replacement are allowed to delete local process state, and `gateway-core` owns SQLite, key material, inbox state, delivery queue, moderation, and recovery independently from `matters-server`.

## Instance Baseline

Recommended first VM:

- Region: `ap-southeast-1`
- VPC: existing `dev-vpc`, or pass `VPC_ID=...`
- Subnet: existing private subnet, or pass `SUBNET_ID=...`
- Runtime: Amazon Linux 2023, x86_64, Node.js 20
- Size: `t3a.micro` or `t3a.small`
- Disk: 20 GB gp3
- Public IPv4: disabled
- Inbound security group: no public inbound rules for the Tunnel path
- Access: AWS Systems Manager Session Manager, not public SSH
- IAM role: `AmazonSSMManagedInstanceCore`

Use `t3a.small` if repeated native `better-sqlite3` rebuilds or interop tests feel tight on memory. Keep it isolated either way.

## Current Staging Origin

As of 2026-05-16, the staging AWS origin is serving gateway-core through the
Cloudflare Worker canonical pilot route:

- EC2 instance: `i-0a5bca704b0a14b53`
- Name: `matters-gateway-core-origin-dev`
- Region: `ap-southeast-1`
- Instance type: `t3a.micro`
- VPC: `dev-vpc`
- Subnet: `dev-private-sub-2`
- Private IP: `10.0.2.160`
- Public IPv4: disabled
- Runtime: Node.js `v20.20.2`
- `cloudflared`: installed and running
- Cloudflare Tunnel: `matters-gateway-core-origin-dev`
- Tunnel ID: `3ae25e40-ba43-4d2b-b565-e66744b47284`
- Origin hostname: `gateway-core-origin.matters.town`
- `matters-gateway-core.service`: enabled / active
- Worker origin: `GATEWAY_CORE_ORIGIN=https://gateway-core-origin.matters.town`
- Worker pilot allowlist: `CANONICAL_PILOT_HANDLES=mashbeanmatters`

`https://gateway-core-origin.matters.town/healthz` returns
`component: "gateway-core"`. `https://matters.town/ap/healthz` reports
`mode: "gateway-core-proxy"`, `inboxMode: "persistent"`, and
`followReadiness: "ready"`.

The canonical actor key pair was generated on the EC2 instance and the private
key was not copied back to local workstations or committed to git.

## Gateway Config

For canonical `matters.town` through the Worker `/ap` route, the origin config must set an ActivityPub path prefix:

```json
{
  "instance": {
    "domain": "matters.town",
    "activityPathPrefix": "/ap",
    "title": "Matters Fediverse Gateway",
    "summary": "ActivityPub gateway for public Matters articles",
    "softwareName": "matters-gateway-core",
    "softwareVersion": "0.1.0",
    "openRegistrations": false
  },
  "actors": {
    "mashbeanmatters": {
      "displayName": "mashbean",
      "summary": "Canonical Matters Fediverse pilot actor",
      "autoAcceptFollows": true,
      "aliases": ["https://matters.town/@mashbean"],
      "publicKeyPemFile": "./secrets/mashbeanmatters-public-key.pem",
      "privateKeyPemFile": "./secrets/mashbeanmatters-private-key.pem"
    }
  },
  "runtime": {
    "storeDriver": "sqlite",
    "sqliteFile": "/var/lib/matters-gateway/runtime/matters-gateway.sqlite"
  }
}
```

`activityPathPrefix` is required so the origin can receive stripped internal paths like `/users/mashbeanmatters/inbox` while still producing canonical public IDs like `https://matters.town/ap/users/mashbeanmatters`.

## Key Rule

The actor document and the private signing key must come from the same runtime. Once `GATEWAY_CORE_ORIGIN` is enabled, the Worker proxies canonical pilot actor GET requests to `gateway-core`; this avoids a split-brain key state where Worker serves one public key but the origin signs with another private key.

Do not run a public follow test until:

- `https://matters.town/ap/users/mashbeanmatters` returns the origin actor document.
- The actor public key matches the private key on the AWS origin.
- `https://matters.town/ap/healthz` reports `followReadiness: "ready"`.

## AWS Bootstrap

Use `gateway-core/deploy/aws-gateway-core-origin-cloudshell.sh` from AWS CloudShell after the account, region, VPC, and subnet are confirmed.

The script creates:

- one IAM role and instance profile for SSM
- one security group with no inbound rules
- one EC2 instance
- Node.js 20, npm, git, build tools, SQLite
- `/opt/matters-gateway/repo`
- `/etc/matters-gateway/`
- `/var/lib/matters-gateway/runtime/`
- `/var/log/matters-gateway/`
- a disabled-by-default operator checklist for real key and config provisioning

The script intentionally does not create production actor key material. The key owner must provision the final private key on the VM before follow tests.

## Cloudflare Cutover

After the AWS origin is healthy:

1. Create a Cloudflare Tunnel or locked-down origin hostname to the VM service.
2. Verify the origin directly: `GET /healthz` returns `component: "gateway-core"`.
3. Set Worker var `GATEWAY_CORE_ORIGIN=https://<origin-host>`.
4. Redeploy Worker with `CANONICAL_PILOT_HANDLES=mashbeanmatters`.
5. Run `cloudflare-worker/scripts/check-follow-readiness.mjs`.
6. Run `node cloudflare-worker/scripts/check-follow-readiness.mjs --probe-inbox`.
7. Only after readiness passes, run Mastodon and Misskey canonical follow tests.

The 2026-05-16 readiness result passed. The invalid inbox probe returned 401
from gateway-core, confirming that the inbox POST path is no longer accepted by
the edge demo.

The 2026-05-16 canonical Mastodon follow proof passed for
`acct:mashbeanmatters@matters.town`:

- g0v.social sent a signed `Follow` to
  `https://matters.town/ap/users/mashbeanmatters/inbox`.
- gateway-core verified the HTTP Signature after the Worker proxied the request
  with original host and URL metadata.
- SQLite recorded one accepted follower:
  `https://g0v.social/users/mashbean`.
- gateway-core delivered the signed `Accept` to g0v.social with HTTP 202.

Misskey canonical follow is still open at the relationship-convergence layer.
gyutte.site resolves the canonical profile and now sends signed `Follow`
activities to gateway-core. gateway-core verifies the request, records accepted
SQLite follower state, and delivers a signed `Accept` with HTTP 202. Interop
hardening PRs #50, #51, and #52 made the response more explicit by adding a
direct `to` audience, sending Follow responses to the actor inbox, and
referencing the inbound Follow id. After redeploying those changes, gyutte.site
still reports `hasPendingFollowRequestFromYou=true` instead of
`isFollowing=true`. The remaining diagnosis needs gyutte.site/Misskey inbox job
logs or admin-side error visibility.

The 2026-05-16 backup/restore drill also passed without overwriting the live
database:

- Backup source:
  `/var/lib/matters-gateway/runtime/matters-gateway.sqlite`
- Backup file:
  `/var/lib/matters-gateway/runtime/backups/matters-gateway-2026-05-16-151854429Z-canonical-follow-proof-20260516T151854Z.sqlite`
- Offline restore target:
  `/var/lib/matters-gateway/runtime/restore-drills/restored-20260516T151927Z.sqlite`
- `PRAGMA integrity_check` returned `ok`.
- Restored counts: 1 follower row, 32 trace rows, and 6 runtime metadata rows.

Production outbound `Create`, `Update`, and `Delete` delivery is a separate rollout gate. Enabling the origin only proves persistent inbound follow/reply runtime readiness.

## Rollback

Fast rollback:

1. Remove `GATEWAY_CORE_ORIGIN` from the Worker deployment.
2. Redeploy Worker.
3. Confirm `https://matters.town/ap/healthz` returns `followReadiness: "blocked"` and `mode: "edge-demo"`.
4. Stop the AWS systemd service if needed.

This keeps `matters.town` main backend untouched because the narrow Worker routes are independent from the main site backend.
