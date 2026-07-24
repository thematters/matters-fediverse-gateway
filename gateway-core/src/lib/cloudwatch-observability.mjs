const CLOUDWATCH_GAUGE_MAP = new Map([
  ["gateway.delivery.pending_total", { metricName: "DeliveryPending", unit: "Count", scale: 1 }],
  ["gateway.delivery.processing_total", { metricName: "DeliveryProcessing", unit: "Count", scale: 1 }],
  ["gateway.delivery.dead_letter_open_total", { metricName: "DeliveryDeadLetters", unit: "Count", scale: 1 }],
  ["gateway.delivery.oldest_pending_age_ms", { metricName: "DeliveryOldestPendingAge", unit: "Seconds", scale: 0.001 }],
  ["gateway.storage.backup_age_ms", { metricName: "BackupAge", unit: "Seconds", scale: 0.001 }],
  ["gateway.followers.total", { metricName: "Followers", unit: "Count", scale: 1 }],
  ["gateway.inbound.engagements_total", { metricName: "InboundEngagements", unit: "Count", scale: 1 }],
]);

export function buildCloudWatchMetricData({ metrics, now = new Date().toISOString() }) {
  const domain = metrics?.instance?.domain?.trim();
  if (!domain) {
    throw new Error("Runtime metrics instance domain is required");
  }

  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("CloudWatch metric timestamp is invalid");
  }

  const dimensions = [{ Name: "InstanceDomain", Value: domain }];
  const metricData = [
    {
      MetricName: "GatewayHeartbeat",
      Dimensions: dimensions,
      Timestamp: timestamp.toISOString(),
      Unit: "Count",
      Value: 1,
    },
  ];

  for (const gauge of metrics.gauges ?? []) {
    const mapping = CLOUDWATCH_GAUGE_MAP.get(gauge?.name);
    if (!mapping || !Number.isFinite(gauge?.value)) {
      continue;
    }

    metricData.push({
      MetricName: mapping.metricName,
      Dimensions: dimensions,
      Timestamp: timestamp.toISOString(),
      Unit: mapping.unit,
      Value: gauge.value * mapping.scale,
    });
  }

  return metricData;
}
