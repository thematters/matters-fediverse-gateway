# Matters Fediverse production launch

This runbook targets a three-day general-availability launch. Federation remains opt-in per author and public-only per article. All active authors can access the setting; existing accounts start disabled.

## Required production configuration

### Gateway origin

- `NODE_ENV=production`
- Edge bearer token used only by the Cloudflare Worker
- Operator bearer token shared only with matters-server and federation-export Lambda
- Dynamic actor registry enabled with `matters.town` in the profile host allowlist
- Threads `Note` companion enabled with `threads.net` as the receiver domain;
  use an explicit staff actor allowlist during controlled delivery and `*` only
  after the general-author compatibility gate passes
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

## Final release sequence

### Phase 1, merge and dark verification

1. Merge and deploy the gateway origin changes.
2. Confirm the server trigger remains `sqs`, the Lambda event source mapping is
   enabled, and the main queue and DLQ are empty before the release test.
3. Keep the production Threads companion actor allowlist restricted to the
   existing staff accounts during the first post-deploy health check.
4. Confirm `/healthz`, WebFinger, NodeInfo, dynamic actor profile images, and
   `/next/fediverse` without sending a new ActivityPub activity.
5. Confirm the deployed gateway commit matches the merged `main` commit.

Exit gate: gateway tests and Worker dry run pass; Lambda image command is
`federation-export.sqsHandler`; queue mapping is enabled; public, paywall,
circle, and archived article boundaries remain verified.

### Phase 2, monitoring and controlled lifecycle

1. Apply `gateway-core/deploy/aws-production-monitoring.sh` with the existing
   production Slack SNS topic.
2. Install and enable `matters-gateway-cloudwatch-metrics.timer`.
3. Confirm the first heartbeat and runtime metrics are present in CloudWatch.
4. Enable federation on one staff account and publish one new public article,
   revise it, then archive it.
5. Confirm Article and Threads companion Create, Update, and Delete use stable
   object IDs, arrive in order, and leave no pending or dead-letter item.
6. Verify `/next/fediverse` shows the same queue and audit state as the gateway.

Exit gate: all alarms are `OK`, no open dead letters exist, the oldest pending
item is under five minutes, and no private or paid article leaves Matters.

### Phase 3, general availability

1. Change the production Threads companion actor allowlist to `["*"]`, keeping
   the receiver allowlist restricted to `threads.net`.
2. Confirm an ordinary opted-in author can discover their actor and deliver a
   new public article.
3. Publish the user announcement and give support the opt-out and remote-copy response text.
   Use `production-launch-comms-zh-TW.md` for public copy and
   `production-on-call-zh-TW.md` for the internal handoff.
4. Monitor queue depth, oldest pending age, dead letters, Lambda errors,
   heartbeat, and EC2 status for four hours.
5. Resolve or replay every dead letter from `/next/fediverse` with an operator reason.

Exit gate: delivery success remains at least 99%, no pending item is older than five minutes, no boundary violation is observed, and support has a named on-call owner.

## Rollback

1. Set `MATTERS_FEDERATION_EXPORT_TRIGGER_MODE=off` to stop new events.
2. Disable the Lambda event source mapping to preserve queued messages without consuming them.
3. If discovery is affected, set `GENERAL_AUTHORS_ENABLED=false` and redeploy the Worker.
4. Keep the gateway and OSS dashboard online for investigation and dead-letter handling.
5. Do not purge the queue, DLQ, audit log, actor registry, or signing keys during rollback.

Rollback does not guarantee deletion from independent remote servers. The product notice and support response must state this explicitly.
