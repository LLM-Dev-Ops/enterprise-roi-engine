/**
 * OpenAPI 3.1 Specification
 * Complete OpenAPI specification for the Enterprise ROI Engine API.
 * Defined as a TypeScript object for type safety and easy manipulation.
 */

/**
 * OpenAPI 3.1 specification for the Enterprise ROI Engine API.
 */
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Enterprise ROI Engine API',
    description: `
The Enterprise ROI Engine API provides endpoints for calculating Return on Investment
for enterprise decisions. It ingests data from simulation engines, ERP systems, and
cost baselines to produce CFO-grade financial artifacts.

## Overview

The API follows a stateless, deterministic design. Given the same inputs, it will
always produce the same outputs. All calculations are performed using decimal
arithmetic for financial precision.

## Key Features

- **ROI Calculation**: Full end-to-end calculation with attribution and risk adjustment
- **Input Validation**: Validate inputs before calculation to catch errors early
- **Artifact Storage**: Retrieve previously calculated artifact bundles
- **Health Monitoring**: Check API and component health status

## Correlation IDs

All requests support a correlation ID for distributed tracing. If not provided in
the \`X-Correlation-ID\` header, one will be generated automatically.
    `.trim(),
    version: '1.0.0',
    contact: {
      name: 'Enterprise ROI Engine Team',
      email: 'roi-engine@example.com',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API Version 1',
    },
  ],
  tags: [
    {
      name: 'Calculation',
      description: 'ROI calculation endpoints',
    },
    {
      name: 'Validation',
      description: 'Input validation endpoints',
    },
    {
      name: 'Artifacts',
      description: 'Artifact retrieval endpoints',
    },
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
  ],
  paths: {
    '/calculate': {
      post: {
        operationId: 'calculateROI',
        summary: 'Calculate ROI',
        description: `
Performs a complete ROI calculation based on simulation output, ERP metadata,
and cost baseline inputs. Returns a complete artifact bundle with financial
artifacts, audit trail, and governance payload.

The calculation proceeds through these phases:
1. **Ingestion**: Validate and normalize input data
2. **Normalization**: Convert to canonical decision records
3. **Attribution**: Attribute costs and benefits to cost centers
4. **Calculation**: Compute financial deltas, NPV, and confidence intervals
5. **Export**: Generate CFO-grade financial artifacts
        `.trim(),
        tags: ['Calculation'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ROIEngineRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Calculation completed successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ROIEngineResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request or validation error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/validate': {
      post: {
        operationId: 'validateInputs',
        summary: 'Validate Inputs',
        description: `
Validates simulation, ERP, and cost baseline inputs without performing
the full calculation. Useful for catching errors before expensive
calculation operations.

Supports validation of individual inputs or cross-validation between
multiple inputs to check referential integrity.
        `.trim(),
        tags: ['Validation'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Validation completed (check status for results)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request format',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        operationId: 'healthCheck',
        summary: 'Health Check',
        description: 'Returns the health status of the API and its components.',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Health check completed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthCheckResponse',
                },
              },
            },
          },
        },
      },
    },
    '/artifacts/{id}': {
      get: {
        operationId: 'getArtifact',
        summary: 'Get Artifact',
        description: 'Retrieves a previously generated artifact bundle by its ID.',
        tags: ['Artifacts'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'The artifact bundle ID (UUID)',
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Artifact bundle found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ArtifactBundle',
                },
              },
            },
          },
          '404': {
            description: 'Artifact not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      // Request Types
      ROIEngineRequest: {
        type: 'object',
        required: ['simulation', 'erpMetadata', 'costBaseline'],
        properties: {
          correlationId: {
            type: 'string',
            description: 'Correlation ID for distributed tracing',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          simulation: {
            $ref: '#/components/schemas/SimulationOutput',
          },
          erpMetadata: {
            $ref: '#/components/schemas/ERPMetadata',
          },
          costBaseline: {
            $ref: '#/components/schemas/CostBaseline',
          },
          options: {
            $ref: '#/components/schemas/CalculationOptions',
          },
        },
      },
      CalculationOptions: {
        type: 'object',
        properties: {
          discountRateOverride: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Override the discount rate from cost baseline',
          },
          defaultHorizonMonths: {
            type: 'integer',
            minimum: 1,
            maximum: 120,
            description: 'Default time horizon in months',
          },
          includeSensitivity: {
            type: 'boolean',
            default: true,
            description: 'Whether to include sensitivity analysis',
          },
          confidenceLevels: {
            type: 'array',
            items: {
              type: 'integer',
              minimum: 1,
              maximum: 99,
            },
            description: 'Confidence levels to calculate',
            example: [50, 75, 90, 95],
          },
          riskToleranceLevel: {
            type: 'string',
            enum: ['LOW', 'MODERATE', 'HIGH'],
            default: 'MODERATE',
            description: 'Risk tolerance level for governance flags',
          },
          strictValidation: {
            type: 'boolean',
            default: true,
            description: 'Whether to perform strict schema validation',
          },
        },
      },
      ValidationRequest: {
        type: 'object',
        properties: {
          correlationId: {
            type: 'string',
            description: 'Correlation ID for distributed tracing',
          },
          simulation: {
            $ref: '#/components/schemas/SimulationOutput',
          },
          erpMetadata: {
            $ref: '#/components/schemas/ERPMetadata',
          },
          costBaseline: {
            $ref: '#/components/schemas/CostBaseline',
          },
          crossValidate: {
            type: 'boolean',
            default: true,
            description: 'Whether to perform cross-validation between inputs',
          },
        },
      },

      // Response Types
      ROIEngineResponse: {
        type: 'object',
        required: ['correlationId', 'timestamp', 'apiVersion', 'status'],
        properties: {
          correlationId: {
            type: 'string',
            description: 'Correlation ID for distributed tracing',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Response generation timestamp',
          },
          apiVersion: {
            type: 'string',
            enum: ['v1'],
            description: 'API version',
          },
          status: {
            type: 'string',
            enum: ['SUCCESS', 'FAILED', 'PENDING'],
            description: 'Execution status',
          },
          artifactBundle: {
            $ref: '#/components/schemas/ArtifactBundle',
          },
          financialArtifact: {
            $ref: '#/components/schemas/FinancialArtifact',
          },
          governance: {
            $ref: '#/components/schemas/GovernancePayload',
          },
          metrics: {
            $ref: '#/components/schemas/ExecutionMetrics',
          },
          error: {
            $ref: '#/components/schemas/APIError',
          },
          warnings: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Warnings that occurred during processing',
          },
        },
      },
      ValidationResponse: {
        type: 'object',
        required: ['correlationId', 'timestamp', 'apiVersion', 'status', 'valid', 'results', 'summary'],
        properties: {
          correlationId: {
            type: 'string',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          apiVersion: {
            type: 'string',
            enum: ['v1'],
          },
          status: {
            type: 'string',
            enum: ['PASSED', 'FAILED', 'WARNING'],
          },
          valid: {
            type: 'boolean',
            description: 'Whether all validations passed',
          },
          results: {
            type: 'object',
            properties: {
              simulation: {
                $ref: '#/components/schemas/InputValidationResult',
              },
              erpMetadata: {
                $ref: '#/components/schemas/InputValidationResult',
              },
              costBaseline: {
                $ref: '#/components/schemas/InputValidationResult',
              },
              crossValidation: {
                $ref: '#/components/schemas/CrossValidationResult',
              },
            },
          },
          summary: {
            $ref: '#/components/schemas/ValidationSummary',
          },
        },
      },
      HealthCheckResponse: {
        type: 'object',
        required: ['status', 'version', 'timestamp', 'uptimeMs', 'components'],
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
          },
          version: {
            type: 'string',
            description: 'Engine version',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptimeMs: {
            type: 'integer',
            description: 'Uptime in milliseconds',
          },
          components: {
            type: 'object',
            properties: {
              engine: {
                $ref: '#/components/schemas/ComponentHealth',
              },
              validation: {
                $ref: '#/components/schemas/ComponentHealth',
              },
            },
          },
          build: {
            type: 'object',
            properties: {
              commitHash: {
                type: 'string',
              },
              buildTime: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['correlationId', 'timestamp', 'apiVersion', 'error'],
        properties: {
          correlationId: {
            type: 'string',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          apiVersion: {
            type: 'string',
            enum: ['v1'],
          },
          error: {
            $ref: '#/components/schemas/APIError',
          },
        },
      },

      // Supporting Types
      ExecutionMetrics: {
        type: 'object',
        properties: {
          decisionsProcessed: {
            type: 'integer',
            description: 'Number of decisions processed',
          },
          totalSavingsIdentified: {
            type: 'string',
            description: 'Total identified savings (decimal string)',
          },
          executionDurationMs: {
            type: 'integer',
            description: 'Execution duration in milliseconds',
          },
          phasesCompleted: {
            type: 'integer',
            description: 'Number of processing phases completed',
          },
          phaseBreakdown: {
            type: 'object',
            properties: {
              ingestionMs: { type: 'integer' },
              normalizationMs: { type: 'integer' },
              attributionMs: { type: 'integer' },
              calculationMs: { type: 'integer' },
              exportMs: { type: 'integer' },
            },
          },
        },
      },
      InputValidationResult: {
        type: 'object',
        required: ['valid', 'errors', 'warnings', 'schemaVersion'],
        properties: {
          valid: {
            type: 'boolean',
          },
          errors: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/ValidationIssue',
            },
          },
          warnings: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/ValidationIssue',
            },
          },
          schemaVersion: {
            type: 'string',
          },
        },
      },
      CrossValidationResult: {
        type: 'object',
        required: ['valid', 'issues'],
        properties: {
          valid: {
            type: 'boolean',
          },
          issues: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/CrossValidationIssue',
            },
          },
        },
      },
      ValidationIssue: {
        type: 'object',
        required: ['path', 'message', 'code', 'severity'],
        properties: {
          path: {
            type: 'string',
            description: 'Field or path where the issue was found',
          },
          message: {
            type: 'string',
            description: 'Issue message',
          },
          code: {
            type: 'string',
            description: 'Issue code for programmatic handling',
          },
          severity: {
            type: 'string',
            enum: ['error', 'warning'],
          },
        },
      },
      CrossValidationIssue: {
        type: 'object',
        required: ['sourceInput', 'targetInput', 'message', 'code'],
        properties: {
          sourceInput: {
            type: 'string',
            enum: ['simulation', 'erpMetadata', 'costBaseline'],
          },
          targetInput: {
            type: 'string',
            enum: ['simulation', 'erpMetadata', 'costBaseline'],
          },
          message: {
            type: 'string',
          },
          code: {
            type: 'string',
          },
        },
      },
      ValidationSummary: {
        type: 'object',
        required: ['errorCount', 'warningCount', 'allValid', 'inputsValidated'],
        properties: {
          errorCount: {
            type: 'integer',
          },
          warningCount: {
            type: 'integer',
          },
          allValid: {
            type: 'boolean',
          },
          inputsValidated: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
      ComponentHealth: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
          },
          message: {
            type: 'string',
          },
          lastCheck: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      APIError: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            description: 'Error code for programmatic handling',
            enum: [
              'VALIDATION_ERROR',
              'INVALID_REQUEST',
              'MISSING_REQUIRED_FIELD',
              'INVALID_FIELD_VALUE',
              'SCHEMA_VALIDATION_FAILED',
              'CROSS_VALIDATION_FAILED',
              'ARTIFACT_NOT_FOUND',
              'RESOURCE_NOT_FOUND',
              'CALCULATION_ERROR',
              'INGESTION_ERROR',
              'NORMALIZATION_ERROR',
              'ATTRIBUTION_ERROR',
              'EXPORT_ERROR',
              'INTERNAL_ERROR',
              'SERVICE_UNAVAILABLE',
              'TIMEOUT_ERROR',
            ],
          },
          message: {
            type: 'string',
            description: 'Human-readable error message',
          },
          details: {
            type: 'object',
            additionalProperties: true,
            description: 'Additional error details',
          },
          stack: {
            type: 'string',
            description: 'Stack trace (only in development)',
          },
          errors: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/APIError',
            },
            description: 'Nested errors if applicable',
          },
        },
      },

      // Domain Types (simplified references)
      SimulationOutput: {
        type: 'object',
        description: 'Simulation output from the Agentics simulation engine',
        required: ['metadata', 'scenario', 'decisions', 'resourceDeltas', 'workflowTraces', 'confidenceIntervals'],
        properties: {
          metadata: {
            type: 'object',
            required: ['simulationId', 'engineVersion', 'timestamp', 'checksum'],
            properties: {
              simulationId: { type: 'string', format: 'uuid' },
              engineVersion: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              checksum: { type: 'string', minLength: 64, maxLength: 64 },
            },
          },
          scenario: {
            type: 'object',
            required: ['name', 'baselineId', 'timeHorizonMonths', 'confidenceLevel'],
            properties: {
              name: { type: 'string' },
              baselineId: { type: 'string', format: 'uuid' },
              timeHorizonMonths: { type: 'integer', minimum: 1, maximum: 120 },
              confidenceLevel: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          decisions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['nodeId', 'decision', 'probability', 'outcomeMetrics'],
              properties: {
                nodeId: { type: 'string', format: 'uuid' },
                parentId: { type: ['string', 'null'], format: 'uuid' },
                decision: { type: 'string' },
                probability: { type: 'number', minimum: 0, maximum: 1 },
                outcomeMetrics: { type: 'object', additionalProperties: { type: 'number' } },
              },
            },
          },
          resourceDeltas: { type: 'array', items: { type: 'object' } },
          workflowTraces: { type: 'array', items: { type: 'object' } },
          confidenceIntervals: { type: 'array', items: { type: 'object' } },
        },
      },
      ERPMetadata: {
        type: 'object',
        description: 'ERP metadata from erp-surface',
        required: ['erpSystem', 'erpVersion', 'extractTimestamp', 'entities', 'chartOfAccounts', 'costCenters', 'fiscalCalendar', 'reportingCurrency'],
        properties: {
          erpSystem: { type: 'string' },
          erpVersion: { type: 'string' },
          extractTimestamp: { type: 'string', format: 'date-time' },
          entities: { type: 'array', items: { type: 'object' } },
          chartOfAccounts: { type: 'array', items: { type: 'object' } },
          costCenters: { type: 'array', items: { type: 'object' } },
          fiscalCalendar: { type: 'array', items: { type: 'object' } },
          reportingCurrency: { type: 'string', minLength: 3, maxLength: 3 },
        },
      },
      CostBaseline: {
        type: 'object',
        description: 'Cost baseline from CostOps',
        required: ['baselineId', 'snapshotTimestamp', 'costModelVersion', 'laborRates', 'infrastructureCosts', 'licenseCosts', 'overheadFactors', 'riskWeights', 'discountRate', 'baselinePeriod'],
        properties: {
          baselineId: { type: 'string', format: 'uuid' },
          snapshotTimestamp: { type: 'string', format: 'date-time' },
          costModelVersion: { type: 'string' },
          laborRates: { type: 'array', items: { type: 'object' } },
          infrastructureCosts: { type: 'array', items: { type: 'object' } },
          licenseCosts: { type: 'array', items: { type: 'object' } },
          overheadFactors: { type: 'array', items: { type: 'object' } },
          riskWeights: { type: 'array', items: { type: 'object' } },
          discountRate: { type: 'number', minimum: 0, maximum: 1 },
          baselinePeriod: { type: 'string' },
        },
      },
      ArtifactBundle: {
        type: 'object',
        description: 'Complete artifact bundle with all outputs',
        required: ['bundleId', 'artifacts', 'generationTimestamp', 'sourceSimulationId', 'schemaVersion', 'checksum'],
        properties: {
          bundleId: { type: 'string', format: 'uuid' },
          artifacts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['artifactType', 'content', 'format', 'schemaVersion'],
              properties: {
                artifactType: {
                  type: 'string',
                  enum: ['EXECUTIVE_SUMMARY', 'SAVINGS_PROJECTION', 'RISK_DELTA_REPORT', 'COST_CENTER_BREAKDOWN', 'AUDIT_TRAIL', 'GL_JOURNAL_ENTRIES', 'FINANCIAL_ARTIFACT'],
                },
                content: { type: 'object' },
                format: { type: 'string', enum: ['JSON'] },
                schemaVersion: { type: 'string' },
              },
            },
          },
          generationTimestamp: { type: 'string', format: 'date-time' },
          sourceSimulationId: { type: 'string' },
          schemaVersion: { type: 'string' },
          checksum: { type: 'string', minLength: 64, maxLength: 64 },
        },
      },
      FinancialArtifact: {
        type: 'object',
        description: 'CFO-grade financial artifact',
        properties: {
          artifactId: { type: 'string', format: 'uuid' },
          generatedAt: { type: 'string', format: 'date-time' },
          engineVersion: { type: 'string' },
          inputManifest: { type: 'object' },
          summary: { type: 'object' },
          periodDetails: { type: 'array', items: { type: 'object' } },
          attributions: { type: 'array', items: { type: 'object' } },
          sensitivityAnalysis: { type: 'object' },
          auditTrail: { type: 'array', items: { type: 'object' } },
          humanReadableSummary: { type: 'string' },
        },
      },
      GovernancePayload: {
        type: 'object',
        description: 'Governance and compliance information',
        properties: {
          artifactId: { type: 'string', format: 'uuid' },
          approvalRequired: { type: 'boolean' },
          thresholdBreaches: { type: 'array', items: { type: 'object' } },
          complianceFlags: { type: 'array', items: { type: 'object' } },
          attestationRequirements: { type: 'array', items: { type: 'string' } },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
      },
    },
    headers: {
      'X-Correlation-ID': {
        description: 'Correlation ID for distributed tracing',
        schema: {
          type: 'string',
        },
      },
    },
  },
} as const;

/**
 * Type for the OpenAPI specification.
 */
export type OpenAPISpec = typeof openApiSpec;

/**
 * Gets the OpenAPI specification as a JSON string.
 */
export function getOpenAPISpecJSON(): string {
  return JSON.stringify(openApiSpec, null, 2);
}

/**
 * Gets the OpenAPI specification object.
 */
export function getOpenAPISpec(): OpenAPISpec {
  return openApiSpec;
}
