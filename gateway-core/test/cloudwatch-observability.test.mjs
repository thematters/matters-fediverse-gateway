import assert from "node:assert/strict";
import test from "node:test";
import { buildCloudWatchMetricData } from "../src/lib/cloudwatch-observability.mjs";

test("maps bounded gateway runtime gauges to CloudWatch metrics", () => {
  const metricData = buildCloudWatchMetricData({
    now: "2026-07-24T08:00:00.000Z",
    metrics: {
      instance: {
        domain: "matters.town",
      },
      gauges: [
        { name: "gateway.delivery.pending_total", value: 2, unit: "count" },
        { name: "gateway.delivery.dead_letter_open_total", value: 1, unit: "count" },
        { name: "gateway.delivery.oldest_pending_age_ms", value: 125_000, unit: "ms" },
        { name: "gateway.storage.backup_age_ms", value: 7_200_000, unit: "ms" },
        { name: "gateway.audit.total", value: 999, unit: "count" },
      ],
    },
  });

  assert.deepEqual(
    metricData.map(({ MetricName, Unit, Value }) => ({
      MetricName,
      Unit,
      Value,
    })),
    [
      { MetricName: "GatewayHeartbeat", Unit: "Count", Value: 1 },
      { MetricName: "DeliveryPending", Unit: "Count", Value: 2 },
      { MetricName: "DeliveryDeadLetters", Unit: "Count", Value: 1 },
      { MetricName: "DeliveryOldestPendingAge", Unit: "Seconds", Value: 125 },
      { MetricName: "BackupAge", Unit: "Seconds", Value: 7200 },
    ],
  );
  assert.deepEqual(metricData[0].Dimensions, [
    { Name: "InstanceDomain", Value: "matters.town" },
  ]);
});

test("requires a valid instance domain and timestamp", () => {
  assert.throws(
    () =>
      buildCloudWatchMetricData({
        metrics: {
          instance: {},
          gauges: [],
        },
      }),
    /instance domain is required/,
  );
  assert.throws(
    () =>
      buildCloudWatchMetricData({
        now: "not-a-date",
        metrics: {
          instance: { domain: "matters.town" },
          gauges: [],
        },
      }),
    /timestamp is invalid/,
  );
});
