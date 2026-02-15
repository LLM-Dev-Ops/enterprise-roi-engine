/**
 * HTTP Server for Enterprise ROI Engine
 * Exposes /v1/roi endpoint for ROI analysis and quantification.
 *
 * Supports two request modes:
 * 1. Full contract: simulation + erpMetadata + costBaseline (existing callers)
 * 2. Lightweight sim_ref: CLI sends simulation_id, service resolves data server-side
 */

import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';

import { isLightweightRequest } from './api/types';
import {
  resolveSimulationData,
  resolveTimeHorizonMonths,
  SimulationResolverError,
} from './api/simulation-resolver';
import {
  handleCalculateROI,
  createHandlerContext,
} from './api/handlers';
import {
  getContractValidator,
  resetContractValidator,
} from './contracts/validation';

import type { ROIEngineRequest, LightweightROIRequest } from './api/types';

const PORT = parseInt(process.env['PORT'] || '8080', 10);

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Maps report_type from the lightweight request to risk tolerance level
 * for the existing calculation pipeline.
 */
function reportTypeToRiskTolerance(
  reportType?: string
): 'LOW' | 'MODERATE' | 'HIGH' {
  switch (reportType) {
    case 'cfo-grade': return 'HIGH';
    case 'executive-summary':
    case 'full':
    case 'summary': return 'MODERATE';
    case 'technical-deep-dive':
    case 'comparison': return 'LOW';
    default: return 'HIGH';
  }
}

// Force re-creation of the contract validator so it picks up the updated schema
resetContractValidator();

const server = http.createServer(async (req, res) => {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? uuidv4();

  // Health check endpoint
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJSON(res, 200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ROI analysis endpoint
  if (req.method === 'POST' && req.url === '/v1/roi') {
    try {
      const body = await parseBody(req);
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        sendJSON(res, 400, {
          error: 'Request body is not valid JSON',
          execution_metadata: {
            trace_id: correlationId,
            timestamp: new Date().toISOString(),
            service: 'enterprise-roi-engine',
          },
        });
        return;
      }

      // Detect request mode: lightweight sim_ref vs full contract
      if (isLightweightRequest(parsedBody)) {
        await handleLightweightRequest(parsedBody, correlationId, res);
      } else {
        await handleFullContractRequest(parsedBody, correlationId, res);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendJSON(res, 500, {
        error: message,
        execution_metadata: {
          trace_id: correlationId,
          timestamp: new Date().toISOString(),
          service: 'enterprise-roi-engine',
        },
      });
    }
    return;
  }

  // 404 for all other routes
  sendJSON(res, 404, { error: 'Not found' });
});

/**
 * Handles the lightweight sim_ref intake mode.
 * Fetches simulation from ruvector-service, generates defaults, runs pipeline.
 */
async function handleLightweightRequest(
  request: LightweightROIRequest,
  correlationId: string,
  res: http.ServerResponse
): Promise<void> {
  const startTime = Date.now();

  try {
    // Resolve simulation data from ruvector-service + generate defaults
    const resolved = await resolveSimulationData(request);

    // Build the full ROIEngineRequest for the existing pipeline
    const timeHorizonMonths = resolveTimeHorizonMonths(request.time_horizon);
    const riskTolerance = reportTypeToRiskTolerance(request.report_type);

    const fullRequest: ROIEngineRequest = {
      correlationId,
      simulation: resolved.simulation,
      erpMetadata: resolved.erpMetadata,
      costBaseline: resolved.costBaseline,
      options: {
        ...request.options,
        defaultHorizonMonths: request.options?.defaultHorizonMonths ?? timeHorizonMonths,
        riskToleranceLevel: request.options?.riskToleranceLevel ?? riskTolerance,
      },
    };

    // Run through the existing calculation pipeline
    const context = createHandlerContext();
    const result = await handleCalculateROI(fullRequest, context);

    // Format response to match the expected CLI contract
    const roiId = `roi-${uuidv4()}`;
    const reportType = request.report_type ?? 'cfo-grade';

    const response = {
      roi_report: {
        id: roiId,
        simulation_ref: request.sim_ref.id,
        report_type: reportType,
        summary: extractSummary(result),
        generated_at: new Date().toISOString(),
      },
      execution_metadata: {
        trace_id: correlationId,
        timestamp: new Date().toISOString(),
        service: 'enterprise-roi-engine',
        resolution_mode: 'lightweight',
        pipeline_status: result.status,
        duration_ms: Date.now() - startTime,
      },
    };

    if (result.status === 'FAILED') {
      sendJSON(res, 422, {
        ...response,
        error: result.error,
      });
    } else {
      sendJSON(res, 200, response);
    }
  } catch (error) {
    if (error instanceof SimulationResolverError) {
      const statusCode = error.code === 'FETCH_ERROR' ? 502 : 504;
      sendJSON(res, statusCode, {
        error: error.message,
        error_code: error.code,
        execution_metadata: {
          trace_id: correlationId,
          timestamp: new Date().toISOString(),
          service: 'enterprise-roi-engine',
          resolution_mode: 'lightweight',
          duration_ms: Date.now() - startTime,
        },
      });
    } else {
      throw error;
    }
  }
}

/**
 * Handles the full contract request mode (existing behavior).
 * Validates against JSON Schema, then runs the pipeline.
 */
async function handleFullContractRequest(
  parsedBody: unknown,
  correlationId: string,
  res: http.ServerResponse
): Promise<void> {
  const startTime = Date.now();

  // Validate against the full contract schema
  const validator = getContractValidator();
  const validationResult = validator.validate(parsedBody);

  if (!validationResult.valid) {
    sendJSON(res, 400, {
      error: 'Schema validation failed',
      validation_errors: validationResult.errors,
      execution_metadata: {
        trace_id: correlationId,
        timestamp: new Date().toISOString(),
        service: 'enterprise-roi-engine',
      },
    });
    return;
  }

  const request = parsedBody as ROIEngineRequest;
  const context = createHandlerContext();
  const result = await handleCalculateROI(
    { ...request, correlationId },
    context
  );

  const roiId = `roi-${uuidv4()}`;

  const response = {
    roi_report: {
      id: roiId,
      simulation_ref: request.simulation.metadata.simulationId,
      report_type: 'full',
      summary: extractSummary(result),
      generated_at: new Date().toISOString(),
    },
    execution_metadata: {
      trace_id: correlationId,
      timestamp: new Date().toISOString(),
      service: 'enterprise-roi-engine',
      resolution_mode: 'full-contract',
      pipeline_status: result.status,
      duration_ms: Date.now() - startTime,
    },
  };

  if (result.status === 'FAILED') {
    sendJSON(res, 422, {
      ...response,
      error: result.error,
    });
  } else {
    sendJSON(res, 200, response);
  }
}

/**
 * Extracts a summary object from the pipeline result.
 */
function extractSummary(result: { status: string; financialArtifact?: unknown; metrics?: unknown }): Record<string, unknown> {
  if (result.status === 'FAILED') {
    return {
      total_investment: 0,
      projected_savings: 0,
      net_present_value: 0,
      roi_percentage: 0,
      payback_period_months: 0,
    };
  }

  const metrics = result.metrics as Record<string, unknown> | undefined;

  return {
    total_investment: 0,
    projected_savings: metrics?.['totalSavingsIdentified'] ?? 0,
    net_present_value: 0,
    roi_percentage: 0,
    payback_period_months: 0,
    decisions_processed: metrics?.['decisionsProcessed'] ?? 0,
    execution_duration_ms: metrics?.['executionDurationMs'] ?? 0,
  };
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ROI Engine server listening on port ${PORT}`);
});
