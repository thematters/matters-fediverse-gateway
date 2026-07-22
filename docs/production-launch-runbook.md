# Matters Fediverse production launch

This runbook targets a three-day general-availability launch. Federation remains opt-in per author and public-only per article. All active authors can access the setting; existing accounts start disabled.

## Required production configuration

### Gateway origin

- `NODE_ENV=production`
- Edge bearer token used only by the Cloudflare Worker
- Operator bearer token shared only with matters-server and federation-export Lambda
- Dynamic actor registry enabled with `matters.town` in the profile host allowlist
- Current ActivityPub signing private/public key pair, with the previous public key retained during rotation
- SQLite storage on persistent disk with scheduled backup, reconciliation, delivery, metrics, logs, and alert jobs

### Cloudflare Worker

- `GENERAL_AUTHORS_ENABLED=true`
- `GATEWAY_ORIGIN_URL` points to the private gateway origin
- `GATEWAY_ORIGIN_BEARER_TOKEN` matches the gateway edge token
- Worker routes cover WebFinger, NodeInfo, actor, inbox, outbox, followers, following, and activity/object reads

### Lambda and SQS

- Dedicated `federation-export-prod` execution role
- FIFO source queue and FIFO dead-letter queue
- Gateway URL and operator token in the GitHub production environment
- Production database Parameter Store path and VPC access
- Partial batch response enabled, five-receive redrive, 180-second visibility timeout, and reserved concurrency 5

### matters-server

- `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=sqs`
- `MATTERS_AWS_FEDERATION_EXPORT_QUEUE_URL` is the FIFO queue URL
- `MATTERS_FEDERATION_WEBF_DOMAIN=matters.town`
- Gateway URL and operator token are configured for the OSS admin proxy

## Three-day sequence

### Day 1, infrastructure and dark verification

1. Merge and deploy the gateway origin changes.
2. Set both bearer tokens and signing keys, then confirm `/healthz` without credentials exposes no secrets.
3. Deploy the Worker and verify unknown handles still return the origin's 404.
4. Provision the production FIFO queue, DLQ, and Lambda with the manual production workflow.
5. Keep the server trigger mode `record_only` and confirm events are recorded without external delivery.

Exit gate: gateway tests and Worker dry run pass; Lambda image command is `federation-export.sqsHandler`; queue mapping is enabled; public, paywall, circle, and archived article boundaries are verified.

### Day 2, controlled delivery

1. Deploy matters-server with the migration and keep the author setting disabled by default.
2. Change trigger mode to `sqs` for production.
3. Enable federation on two staff accounts and publish one new public article, revise it, then archive it.
4. Confirm Create, Update, and Delete arrive in order, duplicate delivery is idempotent, and remote readback works from at least Mastodon and Misskey.
5. Verify the `/next/fediverse` page shows the same queue and audit state as the gateway.

Exit gate: no open dead letters, oldest pending item under five minutes, and no private or paid article leaves Matters.

### Day 3, general availability

1. Deploy matters-web so every active author sees the Fediverse setting and the retention disclosure.
2. Publish the user announcement and give support the opt-out and remote-copy response text.
3. Monitor queue depth, oldest pending age, dead letters, gateway 5xx rate, and signing failures for four hours.
4. Resolve or replay every dead letter from `/next/fediverse` with an operator reason.

Exit gate: delivery success remains at least 99%, no pending item is older than five minutes, no boundary violation is observed, and support has a named on-call owner.

## Rollback

1. Set `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=off` to stop new events.
2. Disable the Lambda event source mapping to preserve queued messages without consuming them.
3. If discovery is affected, set `GENERAL_AUTHORS_ENABLED=false` and redeploy the Worker.
4. Keep the gateway and OSS dashboard online for investigation and dead-letter handling.
5. Do not purge the queue, DLQ, audit log, actor registry, or signing keys during rollback.

Rollback does not guarantee deletion from independent remote servers. The product notice and support response must state this explicitly.
