/**
 * Post-execution hooks that fan out telemetry and compliance records
 * to core bundles after successful ROI calculations.
 *
 * All calls are non-blocking -- failures are logged but never propagate
 * back to the caller.
 */

const INTELLIGENCE_CORE_URL =
  process.env['INTELLIGENCE_CORE_URL'] ??
  'https://intelligence-core-1062287243982.us-central1.run.app';

const GOVERNANCE_CORE_URL =
  process.env['GOVERNANCE_CORE_URL'] ??
  'https://governance-core-1062287243982.us-central1.run.app';

const HOOK_TIMEOUT_MS = 5_000;

interface ROIReportPayload {
  id: string;
  report_type: string;
  summary: Record<string, unknown>;
}

interface ExecutionMetadata {
  trace_id: string;
  timestamp: string;
}

/**
 * Fires non-blocking POST calls to intelligence-core and governance-core.
 * Uses Promise.allSettled so neither failure blocks the other or the caller.
 */
export function fanOutPostExecution(
  report: ROIReportPayload,
  metadata: ExecutionMetadata,
): void {
  const timestamp = metadata.timestamp;

  const telemetryPayload = {
    source: 'enterprise-roi-engine',
    event: 'roi_calculated',
    report_id: report.id,
    report_type: report.report_type,
    metrics_summary: report.summary,
    timestamp,
  };

  const compliancePayload = {
    source: 'enterprise-roi-engine',
    event: 'roi_calculated',
    report_id: report.id,
    cost_impact: {
      total_investment: report.summary['total_investment'] ?? 0,
      projected_savings: report.summary['projected_savings'] ?? 0,
      net_present_value: report.summary['net_present_value'] ?? 0,
    },
    risk_assessment: {
      roi_percentage: report.summary['roi_percentage'] ?? 0,
      payback_period_months: report.summary['payback_period_months'] ?? 0,
    },
    timestamp,
  };

  // Fire-and-forget -- errors are caught and logged
  Promise.allSettled([
    postJSON(`${INTELLIGENCE_CORE_URL}/v1/ingest/telemetry`, telemetryPayload, metadata.trace_id),
    postJSON(`${GOVERNANCE_CORE_URL}/v1/compliance/record`, compliancePayload, metadata.trace_id),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[post-execution-hook] fan-out failed:', r.reason);
      }
    }
  });
}

async function postJSON(
  url: string,
  body: unknown,
  traceId: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOOK_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': traceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.warn(
        `[post-execution-hook] ${url} responded ${resp.status}: ${resp.statusText}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
