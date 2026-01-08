/**
 * HTTP Server for Enterprise ROI Engine
 * Exposes /v1/roi endpoint for Cloud Run deployment
 *
 * Contract Enforcement:
 * - All incoming ROI requests are validated at this single boundary
 * - Uses @agentics/contracts (local) with Ajv in strict mode
 * - Rejects invalid inputs BEFORE any ROI calculation, modeling, or aggregation
 * - All responses include required execution proof
 */

import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  getContractValidator,
  ContractValidationException,
  ExecutionProof,
} from './contracts/validation';
import { executeROIEngine, EngineConfig, ExecutionOptions } from './index';
import { ExecutionStatus } from './contracts/common';

const PORT = parseInt(process.env['PORT'] || '8080', 10);
const PLATFORM_VERSION = '1.0.0';

// Initialize contract validator singleton
const contractValidator = getContractValidator({
  platformId: 'enterprise-roi-engine',
  platformVersion: PLATFORM_VERSION,
});

interface ROIRequest {
  config: EngineConfig;
  options?: ExecutionOptions;
}

interface ROIResponse {
  correlationId: string;
  timestamp: string;
  apiVersion: string;
  status: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  executionProof: ExecutionProof;
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Contract-Schema-Id': contractValidator.getSchemaId(),
    'X-Contract-Schema-Version': contractValidator.getSchemaVersion(),
  });
  res.end(JSON.stringify(data));
}

function createErrorResponse(
  correlationId: string,
  code: string,
  message: string,
  executionProof: ExecutionProof,
  details?: unknown
): ROIResponse {
  return {
    correlationId,
    timestamp: new Date().toISOString(),
    apiVersion: 'v1',
    status: ExecutionStatus.FAILED,
    error: {
      code,
      message,
      details,
    },
    executionProof,
  };
}

const server = http.createServer(async (req, res) => {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? uuidv4();
  const requestStartTime = Date.now();

  // Health check endpoint
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJSON(res, 200, {
      status: 'healthy',
      service: 'agentics-roi',
      contractSchema: contractValidator.getSchemaId(),
      schemaVersion: contractValidator.getSchemaVersion(),
    });
    return;
  }

  // ROI endpoint - Single validation boundary
  if (req.method === 'POST' && req.url === '/v1/roi') {
    let parsedBody: unknown;
    const validationStartTime = Date.now();

    try {
      // Parse request body
      const body = await parseBody(req);
      try {
        parsedBody = JSON.parse(body);
      } catch {
        const validationDurationMs = Date.now() - validationStartTime;
        const executionProof = contractValidator.createExecutionProof(
          null,
          validationDurationMs
        );
        const response = createErrorResponse(
          correlationId,
          'INVALID_JSON',
          'Request body is not valid JSON',
          executionProof
        );
        sendJSON(res, 400, response);
        return;
      }

      // ============================================================
      // CONTRACT VALIDATION BOUNDARY
      // All validation happens here - no bypass paths
      // ============================================================
      const validationResult = contractValidator.validate(parsedBody);
      const validationDurationMs = Date.now() - validationStartTime;

      if (!validationResult.valid) {
        // Reject invalid input BEFORE any ROI calculation
        const executionProof = contractValidator.createExecutionProof(
          parsedBody,
          validationDurationMs
        );
        const response = createErrorResponse(
          correlationId,
          'CONTRACT_VALIDATION_FAILED',
          `Request failed contract validation against schema ${validationResult.schemaId}`,
          executionProof,
          {
            schemaId: validationResult.schemaId,
            schemaVersion: validationResult.schemaVersion,
            validatedAt: validationResult.validatedAt,
            errors: validationResult.errors,
          }
        );
        sendJSON(res, 400, response);
        return;
      }

      // Create execution proof for validated request
      let executionProof = contractValidator.createExecutionProof(
        parsedBody,
        validationDurationMs
      );

      // ============================================================
      // VALIDATED REQUEST PROCESSING
      // Only reached if contract validation passes
      // ============================================================
      const request = parsedBody as ROIRequest;

      if (!request.config) {
        executionProof = contractValidator.finalizeExecutionProof(
          executionProof,
          null,
          Date.now() - requestStartTime
        );
        const response = createErrorResponse(
          correlationId,
          'MISSING_CONFIG',
          'Missing required field: config',
          executionProof
        );
        sendJSON(res, 400, response);
        return;
      }

      // Execute ROI calculation (only after validation passes)
      const result = await executeROIEngine(request.config, request.options);
      const executionDurationMs = Date.now() - requestStartTime;

      // Finalize execution proof with output
      executionProof = contractValidator.finalizeExecutionProof(
        executionProof,
        result,
        executionDurationMs
      );

      const response: ROIResponse = {
        correlationId,
        timestamp: new Date().toISOString(),
        apiVersion: 'v1',
        status: ExecutionStatus.SUCCESS,
        result,
        executionProof,
      };

      sendJSON(res, 200, response);
    } catch (error) {
      const executionDurationMs = Date.now() - requestStartTime;
      const validationDurationMs = Date.now() - validationStartTime;

      // Handle contract validation exceptions
      if (error instanceof ContractValidationException) {
        const executionProof = contractValidator.createExecutionProof(
          parsedBody,
          validationDurationMs
        );
        const response = createErrorResponse(
          correlationId,
          error.code,
          error.message,
          executionProof,
          { errors: error.toAPIErrors() }
        );
        sendJSON(res, 400, response);
        return;
      }

      // Handle other errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      const executionProof = contractValidator.createExecutionProof(
        parsedBody,
        validationDurationMs
      );
      const finalProof = contractValidator.finalizeExecutionProof(
        executionProof,
        null,
        executionDurationMs
      );
      const response = createErrorResponse(
        correlationId,
        'INTERNAL_ERROR',
        message,
        finalProof
      );
      sendJSON(res, 500, response);
    }
    return;
  }

  // 404 for all other routes
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ROI Engine server listening on port ${PORT}`);
  console.log(`Contract Schema: ${contractValidator.getSchemaId()}`);
  console.log(`Contract enforcement enabled - strict mode`);
});
