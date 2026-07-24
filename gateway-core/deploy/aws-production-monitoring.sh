#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
INSTANCE_ID="${INSTANCE_ID:?Set INSTANCE_ID to the gateway origin EC2 instance ID}"
INSTANCE_ROLE_NAME="${INSTANCE_ROLE_NAME:?Set INSTANCE_ROLE_NAME to the gateway origin IAM role name}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:?Set SNS_TOPIC_ARN to the production on-call topic}"
INSTANCE_DOMAIN="${INSTANCE_DOMAIN:-matters.town}"
NAMESPACE="${NAMESPACE:-Matters/FediverseGateway}"
QUEUE_NAME="${QUEUE_NAME:-federation-export-prod.fifo}"
DLQ_NAME="${DLQ_NAME:-federation-export-prod-dlq.fifo}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-federation-export-prod}"
ALARM_PREFIX="${ALARM_PREFIX:-prod-fediverse}"

aws sns get-topic-attributes \
  --region "$REGION" \
  --topic-arn "$SNS_TOPIC_ARN" \
  >/dev/null

POLICY_DOCUMENT="$(mktemp)"
trap 'rm -f "$POLICY_DOCUMENT"' EXIT

cat >"$POLICY_DOCUMENT" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublishFediverseGatewayMetrics",
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "$NAMESPACE"
        }
      }
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name "$INSTANCE_ROLE_NAME" \
  --policy-name matters-fediverse-gateway-cloudwatch-metrics \
  --policy-document "file://$POLICY_DOCUMENT"

put_gateway_alarm() {
  local alarm_name="$1"
  local metric_name="$2"
  local comparison_operator="$3"
  local threshold="$4"
  local evaluation_periods="$5"
  local treat_missing_data="$6"

  aws cloudwatch put-metric-alarm \
    --region "$REGION" \
    --alarm-name "$ALARM_PREFIX-$alarm_name" \
    --alarm-description "Matters Fediverse gateway $alarm_name" \
    --namespace "$NAMESPACE" \
    --metric-name "$metric_name" \
    --dimensions "Name=InstanceDomain,Value=$INSTANCE_DOMAIN" \
    --statistic Maximum \
    --period 300 \
    --evaluation-periods "$evaluation_periods" \
    --datapoints-to-alarm "$evaluation_periods" \
    --comparison-operator "$comparison_operator" \
    --threshold "$threshold" \
    --treat-missing-data "$treat_missing_data" \
    --alarm-actions "$SNS_TOPIC_ARN"
}

put_gateway_alarm heartbeat GatewayHeartbeat LessThanThreshold 1 2 breaching
put_gateway_alarm gateway-delivery-dead-letters DeliveryDeadLetters GreaterThanThreshold 0 1 notBreaching
put_gateway_alarm gateway-delivery-oldest-pending DeliveryOldestPendingAge GreaterThanThreshold 300 1 notBreaching

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "$ALARM_PREFIX-sqs-oldest-message" \
  --alarm-description "Matters Fediverse export queue oldest message exceeds five minutes" \
  --namespace AWS/SQS \
  --metric-name ApproximateAgeOfOldestMessage \
  --dimensions "Name=QueueName,Value=$QUEUE_NAME" \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --comparison-operator GreaterThanThreshold \
  --threshold 300 \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_TOPIC_ARN"

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "$ALARM_PREFIX-sqs-dlq-visible" \
  --alarm-description "Matters Fediverse export dead-letter queue contains messages" \
  --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions "Name=QueueName,Value=$DLQ_NAME" \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --comparison-operator GreaterThanThreshold \
  --threshold 0 \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_TOPIC_ARN"

for metric_name in Errors Throttles; do
  alarm_suffix="$(printf '%s' "$metric_name" | tr '[:upper:]' '[:lower:]')"
  aws cloudwatch put-metric-alarm \
    --region "$REGION" \
    --alarm-name "$ALARM_PREFIX-lambda-$alarm_suffix" \
    --alarm-description "Matters Fediverse export Lambda $metric_name detected" \
    --namespace AWS/Lambda \
    --metric-name "$metric_name" \
    --dimensions "Name=FunctionName,Value=$LAMBDA_FUNCTION_NAME" \
    --statistic Sum \
    --period 300 \
    --evaluation-periods 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --threshold 1 \
    --treat-missing-data notBreaching \
    --alarm-actions "$SNS_TOPIC_ARN"
done

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "$ALARM_PREFIX-ec2-status-check" \
  --alarm-description "Matters Fediverse gateway EC2 status check failed" \
  --namespace AWS/EC2 \
  --metric-name StatusCheckFailed \
  --dimensions "Name=InstanceId,Value=$INSTANCE_ID" \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --datapoints-to-alarm 2 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --threshold 1 \
  --treat-missing-data breaching \
  --alarm-actions "$SNS_TOPIC_ARN"

aws logs put-retention-policy \
  --region "$REGION" \
  --log-group-name "/aws/lambda/$LAMBDA_FUNCTION_NAME" \
  --retention-in-days 30

aws cloudwatch describe-alarms \
  --region "$REGION" \
  --alarm-name-prefix "$ALARM_PREFIX-" \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Actions:AlarmActions}' \
  --output table
