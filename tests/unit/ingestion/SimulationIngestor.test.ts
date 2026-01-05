/**
 * SimulationIngestor Unit Tests
 * Tests validation, ingestion, temporal bounds, and error handling.
 */

import { createHash } from 'crypto';
import {
  SimulationIngestor,
  SimulationEndpoint,
} from '../../../src/ingestion/SimulationIngestor';
import { IngestionStatus, ResourceType, DeltaDirection } from '../../../src/contracts';
import {
  createMockSimulationOutput,
  createMockSimulationEndpoint,
  createMockSimulationEndpointWithError,
  createInvalidSimulationOutput,
  createSimulationOutputMissingFields,
  createEmptyArraysSimulationOutput,
  createMockSimulationMetadata,
  createMockSimulationScenario,
  createMockDecisionNode,
  createMockResourceDelta,
  createMockWorkflowTrace,
  createMockConfidenceIntervals,
  getPastTimestamp,
  getFutureTimestamp,
  getStaleTimestamp,
  resetUUIDCounter,
  generateUUID,
} from './__mocks__/mockData';

describe('SimulationIngestor', () => {
  beforeEach(() => {
    resetUUIDCounter();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with a valid endpoint', () => {
      const endpoint = createMockSimulationEndpoint();
      const ingestor = new SimulationIngestor(endpoint);
      expect(ingestor).toBeInstanceOf(SimulationIngestor);
    });
  });

  // ==========================================================================
  // ingest() Method Tests
  // ==========================================================================

  describe('ingest()', () => {
    describe('success cases', () => {
      it('should successfully ingest valid simulation output', async () => {
        const mockData = createMockSimulationOutput();
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(result.data?.metadata.simulationId).toBe(mockData.metadata.simulationId);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.checksum).toHaveLength(64);
        expect(result.ingestedAt).toBeDefined();
      });

      it('should compute correct checksum for payload', async () => {
        const mockData = createMockSimulationOutput();
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(mockData))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should call endpoint fetchSimulationOutput exactly once', async () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);

        await ingestor.ingest();

        expect(endpoint.fetchSimulationOutput).toHaveBeenCalledTimes(1);
      });

      it('should handle simulation with empty arrays', async () => {
        const mockData = createEmptyArraysSimulationOutput();
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.decisions).toHaveLength(0);
        expect(result.data?.resourceDeltas).toHaveLength(0);
        expect(result.data?.workflowTraces).toHaveLength(0);
        expect(result.data?.confidenceIntervals).toHaveLength(0);
      });

      it('should handle simulation with multiple decision nodes', async () => {
        const decisions = [
          createMockDecisionNode({ nodeId: generateUUID(), decision: 'Decision 1' }),
          createMockDecisionNode({ nodeId: generateUUID(), decision: 'Decision 2' }),
          createMockDecisionNode({ nodeId: generateUUID(), decision: 'Decision 3' }),
        ];
        const mockData = createMockSimulationOutput({ decisions });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.decisions).toHaveLength(3);
      });

      it('should preserve all resource delta types', async () => {
        const resourceDeltas = [
          createMockResourceDelta({ resourceType: ResourceType.FTE }),
          createMockResourceDelta({ resourceType: ResourceType.COMPUTE }),
          createMockResourceDelta({ resourceType: ResourceType.LICENSE }),
          createMockResourceDelta({ resourceType: ResourceType.CUSTOM }),
        ];
        const mockData = createMockSimulationOutput({ resourceDeltas });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.resourceDeltas).toHaveLength(4);
        const types = result.data?.resourceDeltas.map((d) => d.resourceType);
        expect(types).toContain(ResourceType.FTE);
        expect(types).toContain(ResourceType.COMPUTE);
        expect(types).toContain(ResourceType.LICENSE);
        expect(types).toContain(ResourceType.CUSTOM);
      });
    });

    describe('temporal bounds validation', () => {
      it('should reject future timestamps with FAILED status', async () => {
        const mockData = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getFutureTimestamp(1),
          }),
        });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('FUTURE_TIMESTAMP_ERROR');
        expect(result.errors[0].message).toContain('in the future');
      });

      it('should return PARTIAL status for stale data (>24h old)', async () => {
        const mockData = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getStaleTimestamp(),
          }),
        });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.data).not.toBeNull();
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('stale');
        expect(result.errors).toHaveLength(0);
      });

      it('should accept recent timestamps without warnings', async () => {
        const mockData = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getPastTimestamp(1), // 1 hour ago
          }),
        });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });

      it('should accept timestamp at exactly 24h boundary without warning', async () => {
        const mockData = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getPastTimestamp(24),
          }),
        });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        // At exactly 24h, it should not be considered stale yet
        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('fetch error handling', () => {
      it('should return FAILED status when endpoint throws error', async () => {
        const error = new Error('Network error');
        const endpoint = createMockSimulationEndpointWithError(error);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.checksum).toBe('');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('FETCH_ERROR');
        expect(result.errors[0].message).toContain('Network error');
      });

      it('should handle non-Error thrown values', async () => {
        const endpoint: SimulationEndpoint = {
          fetchSimulationOutput: jest.fn().mockRejectedValue('string error'),
        };
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].message).toContain('string error');
      });
    });

    describe('schema validation errors', () => {
      it('should return FAILED status for invalid schema', async () => {
        const invalidData = createInvalidSimulationOutput();
        const endpoint = createMockSimulationEndpoint(invalidData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('SCHEMA_VALIDATION_ERROR');
      });

      it('should return FAILED status for missing required fields', async () => {
        const incompleteData = createSimulationOutputMissingFields();
        const endpoint = createMockSimulationEndpoint(incompleteData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return multiple errors for multiple validation failures', async () => {
        const invalidData = {
          metadata: {
            simulationId: 'not-uuid',
            engineVersion: 'bad',
            timestamp: 'invalid',
            checksum: 'short',
          },
          scenario: {
            name: '',
            baselineId: 'not-uuid',
            timeHorizonMonths: 0,
            confidenceLevel: 2.0,
          },
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        };
        const endpoint = createMockSimulationEndpoint(invalidData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.length).toBeGreaterThan(1);
      });

      it('should include path information in validation errors', async () => {
        const invalidData = {
          metadata: {
            simulationId: 'not-a-uuid',
            engineVersion: '1.0.0',
            timestamp: new Date().toISOString(),
            checksum: 'a'.repeat(64),
          },
          scenario: createMockSimulationScenario(),
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        };
        const endpoint = createMockSimulationEndpoint(invalidData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].message).toContain('metadata.simulationId');
      });

      it('should still compute checksum for invalid data', async () => {
        const invalidData = createInvalidSimulationOutput();
        const endpoint = createMockSimulationEndpoint(invalidData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.checksum).toHaveLength(64);
      });
    });

    describe('null and undefined handling', () => {
      it('should handle null payload', async () => {
        const endpoint = createMockSimulationEndpoint(null);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should handle undefined payload', async () => {
        const endpoint = createMockSimulationEndpoint(undefined);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should accept null parentId in decision nodes', async () => {
        const mockData = createMockSimulationOutput({
          decisions: [createMockDecisionNode({ parentId: null })],
        });
        const endpoint = createMockSimulationEndpoint(mockData);
        const ingestor = new SimulationIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.decisions[0]!.parentId).toBeNull();
      });
    });
  });

  // ==========================================================================
  // validatePayload() Method Tests
  // ==========================================================================

  describe('validatePayload()', () => {
    describe('success cases', () => {
      it('should validate valid payload without endpoint call', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const payload = createMockSimulationOutput();

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(endpoint.fetchSimulationOutput).not.toHaveBeenCalled();
      });

      it('should compute checksum for validated payload', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const payload = createMockSimulationOutput();

        const result = ingestor.validatePayload(payload);

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should return ingestedAt timestamp', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const payload = createMockSimulationOutput();

        const beforeTime = new Date().toISOString();
        const result = ingestor.validatePayload(payload);
        const afterTime = new Date().toISOString();

        expect(result.ingestedAt).toBeDefined();
        expect(result.ingestedAt >= beforeTime).toBe(true);
        expect(result.ingestedAt <= afterTime).toBe(true);
      });
    });

    describe('validation failures', () => {
      it('should return FAILED for invalid schema', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const invalidPayload = createInvalidSimulationOutput();

        const result = ingestor.validatePayload(invalidPayload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return FAILED for future timestamp', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const payload = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getFutureTimestamp(1),
          }),
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].code).toBe('FUTURE_TIMESTAMP_ERROR');
      });
    });

    describe('temporal bounds in validatePayload', () => {
      it('should return PARTIAL for stale data', () => {
        const endpoint = createMockSimulationEndpoint();
        const ingestor = new SimulationIngestor(endpoint);
        const payload = createMockSimulationOutput({
          metadata: createMockSimulationMetadata({
            timestamp: getStaleTimestamp(),
          }),
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // Edge Cases and Boundary Tests
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle very long scenario names', () => {
      const longName = 'A'.repeat(256);
      const mockData = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ name: longName }),
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      return ingestor.ingest().then((result) => {
        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.scenario.name).toBe(longName);
      });
    });

    it('should reject scenario names exceeding max length', async () => {
      const tooLongName = 'A'.repeat(257);
      const mockData = {
        ...createMockSimulationOutput(),
        scenario: { ...createMockSimulationScenario(), name: tooLongName },
      };
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.FAILED);
    });

    it('should handle minimum valid timeHorizonMonths', async () => {
      const mockData = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ timeHorizonMonths: 1 }),
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.scenario.timeHorizonMonths).toBe(1);
    });

    it('should handle maximum valid timeHorizonMonths', async () => {
      const mockData = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ timeHorizonMonths: 120 }),
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.scenario.timeHorizonMonths).toBe(120);
    });

    it('should reject timeHorizonMonths exceeding max', async () => {
      const mockData = {
        ...createMockSimulationOutput(),
        scenario: { ...createMockSimulationScenario(), timeHorizonMonths: 121 },
      };
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.FAILED);
    });

    it('should handle confidenceLevel at boundaries', async () => {
      const mockDataMin = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ confidenceLevel: 0 }),
      });
      const mockDataMax = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ confidenceLevel: 1 }),
      });

      const endpointMin = createMockSimulationEndpoint(mockDataMin);
      const endpointMax = createMockSimulationEndpoint(mockDataMax);

      const ingestorMin = new SimulationIngestor(endpointMin);
      const ingestorMax = new SimulationIngestor(endpointMax);

      const resultMin = await ingestorMin.ingest();
      const resultMax = await ingestorMax.ingest();

      expect(resultMin.status).toBe(IngestionStatus.SUCCESS);
      expect(resultMax.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should handle probability at boundaries in decision nodes', async () => {
      const mockData = createMockSimulationOutput({
        decisions: [
          createMockDecisionNode({ probability: 0 }),
          createMockDecisionNode({ probability: 1 }),
        ],
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should handle delta directions correctly', async () => {
      const mockData = createMockSimulationOutput({
        resourceDeltas: [
          createMockResourceDelta({ direction: DeltaDirection.INCREASE }),
          createMockResourceDelta({ direction: DeltaDirection.DECREASE }),
        ],
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.resourceDeltas[0]!.direction).toBe(DeltaDirection.INCREASE);
      expect(result.data?.resourceDeltas[1]!.direction).toBe(DeltaDirection.DECREASE);
    });

    it('should handle workflow with multiple steps', async () => {
      const mockData = createMockSimulationOutput({
        workflowTraces: [
          createMockWorkflowTrace({
            steps: [
              { stepId: generateUUID(), stepName: 'Step 1', duration: 100, resourcesConsumed: {} },
              { stepId: generateUUID(), stepName: 'Step 2', duration: 200, resourcesConsumed: {} },
              { stepId: generateUUID(), stepName: 'Step 3', duration: 300, resourcesConsumed: {} },
            ],
            totalDuration: 600,
          }),
        ],
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.workflowTraces[0]!.steps).toHaveLength(3);
    });

    it('should handle large outcome metrics objects', async () => {
      const outcomeMetrics: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        outcomeMetrics[`metric_${i}`] = i * 1000;
      }
      const mockData = createMockSimulationOutput({
        decisions: [createMockDecisionNode({ outcomeMetrics })],
      });
      const endpoint = createMockSimulationEndpoint(mockData);
      const ingestor = new SimulationIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(Object.keys(result.data?.decisions[0]!.outcomeMetrics ?? {}).length).toBe(100);
    });
  });

  // ==========================================================================
  // Consistency Tests
  // ==========================================================================

  describe('consistency', () => {
    it('should produce consistent checksums for same payload', async () => {
      const mockData = createMockSimulationOutput();
      const endpoint1 = createMockSimulationEndpoint(mockData);
      const endpoint2 = createMockSimulationEndpoint(mockData);
      const ingestor1 = new SimulationIngestor(endpoint1);
      const ingestor2 = new SimulationIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('should produce different checksums for different payloads', async () => {
      const mockData1 = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ name: 'Scenario 1' }),
      });
      const mockData2 = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ name: 'Scenario 2' }),
      });
      const endpoint1 = createMockSimulationEndpoint(mockData1);
      const endpoint2 = createMockSimulationEndpoint(mockData2);
      const ingestor1 = new SimulationIngestor(endpoint1);
      const ingestor2 = new SimulationIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });
});
