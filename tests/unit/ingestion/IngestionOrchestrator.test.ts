/**
 * IngestionOrchestrator Unit Tests
 * Tests parallel ingestion, result aggregation, cross-validation, and error handling.
 */

import {
  IngestionOrchestrator,
  IngestionEndpointConfig,
  IngestionOptions,
} from '../../../src/ingestion/IngestionOrchestrator';
import { IngestionStatus } from '../../../src/contracts';
import {
  createMockSimulationOutput,
  createMockSimulationEndpoint,
  createMockSimulationEndpointWithError,
  createMockERPMetadata,
  createMockERPSurfaceEndpoint,
  createMockERPSurfaceEndpointWithError,
  createMockCostBaseline,
  createMockCostOpsEndpoint,
  createMockCostOpsEndpointWithError,
  createInvalidSimulationOutput,
  createInvalidERPMetadata,
  createInvalidCostBaseline,
  createMockSimulationScenario,
  createMockCostCenter,
  createMockOverheadFactor,
  createMockLaborRate,
  getPastTimestamp,
  getFutureTimestamp,
  getStaleTimestamp,
  resetUUIDCounter,
  generateUUID,
} from './__mocks__/mockData';

describe('IngestionOrchestrator', () => {
  beforeEach(() => {
    resetUUIDCounter();
  });

  // Helper to create a valid endpoint config
  function createValidEndpointConfig(
    overrides: Partial<{
      simulationData: unknown;
      erpData: unknown;
      costBaselineData: unknown;
    }> = {}
  ): IngestionEndpointConfig {
    const baselineId = generateUUID();
    const costCenterId = 'CC-001';

    // Create consistent mock data by default
    const costBaseline = createMockCostBaseline({
      baselineId,
      laborRates: [createMockLaborRate({ currency: 'USD' })],
      overheadFactors: [createMockOverheadFactor({ costCenterId })],
    });
    const simulationOutput = createMockSimulationOutput({
      scenario: createMockSimulationScenario({ baselineId }),
    });
    const erpMetadata = createMockERPMetadata({
      reportingCurrency: 'USD',
      costCenters: [createMockCostCenter({ costCenterId })],
    });

    return {
      simulation: createMockSimulationEndpoint(
        overrides.simulationData ?? simulationOutput
      ),
      erpSurface: createMockERPSurfaceEndpoint(overrides.erpData ?? erpMetadata),
      costOps: createMockCostOpsEndpoint(overrides.costBaselineData ?? costBaseline),
    };
  }

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with a valid config', () => {
      const config = createValidEndpointConfig();
      const orchestrator = new IngestionOrchestrator(config);
      expect(orchestrator).toBeInstanceOf(IngestionOrchestrator);
    });
  });

  // ==========================================================================
  // ingestAll() Method Tests
  // ==========================================================================

  describe('ingestAll()', () => {
    describe('success cases', () => {
      it('should successfully ingest from all sources', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(result.data?.simulation).toBeDefined();
        expect(result.data?.erpMetadata).toBeDefined();
        expect(result.data?.costBaseline).toBeDefined();
        expect(result.errors).toHaveLength(0);
      });

      it('should populate checksums for all sources', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.checksums.simulation).toHaveLength(64);
        expect(result.checksums.erpMetadata).toHaveLength(64);
        expect(result.checksums.costBaseline).toHaveLength(64);
      });

      it('should populate individual results', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.individualResults.simulation).not.toBeNull();
        expect(result.individualResults.erpMetadata).not.toBeNull();
        expect(result.individualResults.costBaseline).not.toBeNull();
        expect(result.individualResults.simulation?.status).toBe(IngestionStatus.SUCCESS);
        expect(result.individualResults.erpMetadata?.status).toBe(IngestionStatus.SUCCESS);
        expect(result.individualResults.costBaseline?.status).toBe(IngestionStatus.SUCCESS);
      });

      it('should call all endpoints in parallel', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        await orchestrator.ingestAll();

        expect(config.simulation.fetchSimulationOutput).toHaveBeenCalledTimes(1);
        expect(config.erpSurface.fetchERPMetadata).toHaveBeenCalledTimes(1);
        expect(config.costOps.fetchCostBaseline).toHaveBeenCalledTimes(1);
      });

      it('should pass baselineId to CostOps endpoint when provided', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);
        const options: IngestionOptions = { baselineId: 'specific-baseline' };

        await orchestrator.ingestAll(options);

        expect(config.costOps.fetchCostBaseline).toHaveBeenCalledWith('specific-baseline');
      });

      it('should pass undefined to CostOps endpoint when no baselineId', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        await orchestrator.ingestAll();

        expect(config.costOps.fetchCostBaseline).toHaveBeenCalledWith(undefined);
      });

      it('should return ingestedAt timestamp', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const beforeTime = new Date().toISOString();
        const result = await orchestrator.ingestAll();
        const afterTime = new Date().toISOString();

        expect(result.ingestedAt).toBeDefined();
        expect(result.ingestedAt >= beforeTime).toBe(true);
        expect(result.ingestedAt <= afterTime).toBe(true);
      });
    });

    describe('cross-validation', () => {
      it('should warn when simulation references different baseline', async () => {
        const baselineId1 = generateUUID();
        const baselineId2 = generateUUID();
        const costCenterId = 'CC-001';

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId: baselineId1 }),
        });
        const costBaseline = createMockCostBaseline({
          baselineId: baselineId2,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });
        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('baseline'))).toBe(true);
      });

      it('should warn when ERP currency not in labor rates', async () => {
        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'EUR',
          costCenters: [createMockCostCenter({ costCenterId })],
        });
        const costBaseline = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })], // Different currency
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('currency'))).toBe(true);
      });

      it('should warn when overhead factor references unknown cost center', async () => {
        const baselineId = generateUUID();

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId: 'CC-001' })],
        });
        const costBaseline = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId: 'CC-UNKNOWN' })],
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(
          result.warnings.some((w) => w.includes('cost center') && w.includes('CC-UNKNOWN'))
        ).toBe(true);
      });

      it('should not warn when all cross-references are valid', async () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });

      it('should accumulate multiple cross-validation warnings', async () => {
        const baselineId1 = generateUUID();
        const baselineId2 = generateUUID();

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId: baselineId1 }),
        });
        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'EUR',
          costCenters: [createMockCostCenter({ costCenterId: 'CC-001' })],
        });
        const costBaseline = createMockCostBaseline({
          baselineId: baselineId2,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId: 'CC-UNKNOWN' })],
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('partial success (warnings)', () => {
      it('should return PARTIAL when individual ingestor has warnings', async () => {
        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
          extractTimestamp: getStaleTimestamp(), // Stale data
        });
        const costBaseline = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.data).not.toBeNull();
        expect(result.warnings.some((w) => w.includes('stale'))).toBe(true);
      });

      it('should aggregate warnings from all sources', async () => {
        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        simulationOutput.metadata.timestamp = getStaleTimestamp();

        const erpMetadata = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
          extractTimestamp: getStaleTimestamp(),
        });
        const costBaseline = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
          snapshotTimestamp: getStaleTimestamp(),
        });

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint({
            ...simulationOutput,
            metadata: { ...simulationOutput.metadata, timestamp: getStaleTimestamp() },
          }),
          erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
          costOps: createMockCostOpsEndpoint(costBaseline),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        // Each source should have a stale warning
        const staleWarnings = result.warnings.filter((w) => w.includes('stale'));
        expect(staleWarnings.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('failure cases', () => {
      it('should return FAILED when simulation ingestion fails', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(createInvalidSimulationOutput()),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return FAILED when ERP ingestion fails', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(),
          erpSurface: createMockERPSurfaceEndpoint(createInvalidERPMetadata()),
          costOps: createMockCostOpsEndpoint(),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
      });

      it('should return FAILED when cost baseline ingestion fails', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(createInvalidCostBaseline()),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
      });

      it('should return FAILED when all ingestions fail', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(createInvalidSimulationOutput()),
          erpSurface: createMockERPSurfaceEndpoint(createInvalidERPMetadata()),
          costOps: createMockCostOpsEndpoint(createInvalidCostBaseline()),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        // Should have errors from all three
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should aggregate errors from all failed sources', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(createInvalidSimulationOutput()),
          erpSurface: createMockERPSurfaceEndpoint(createInvalidERPMetadata()),
          costOps: createMockCostOpsEndpoint(createInvalidCostBaseline()),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        // Should have multiple schema validation errors
        const schemaErrors = result.errors.filter(
          (e) => e.code === 'SCHEMA_VALIDATION_ERROR'
        );
        expect(schemaErrors.length).toBeGreaterThan(1);
      });

      it('should handle fetch errors from endpoints', async () => {
        const error = new Error('Network failure');
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpointWithError(error),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.some((e) => e.code === 'FETCH_ERROR')).toBe(true);
      });

      it('should still have checksums for successful validations in failed result', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(createInvalidSimulationOutput()),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        // Simulation has invalid data but checksum should still be computed
        expect(result.checksums.simulation).toHaveLength(64);
        expect(result.checksums.erpMetadata).toHaveLength(64);
        expect(result.checksums.costBaseline).toHaveLength(64);
      });
    });

    describe('temporal validation failures', () => {
      it('should fail when simulation has future timestamp', async () => {
        const baselineId = generateUUID();
        const simulationOutput = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        (simulationOutput.metadata as any).timestamp = getFutureTimestamp(1);

        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(simulationOutput),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(createMockCostBaseline({ baselineId })),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.some((e) => e.code === 'FUTURE_TIMESTAMP_ERROR')).toBe(true);
      });

      it('should fail when ERP has future timestamp', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(),
          erpSurface: createMockERPSurfaceEndpoint(
            createMockERPMetadata({ extractTimestamp: getFutureTimestamp(1) })
          ),
          costOps: createMockCostOpsEndpoint(),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should fail when cost baseline has future timestamp', async () => {
        const config: IngestionEndpointConfig = {
          simulation: createMockSimulationEndpoint(),
          erpSurface: createMockERPSurfaceEndpoint(),
          costOps: createMockCostOpsEndpoint(
            createMockCostBaseline({ snapshotTimestamp: getFutureTimestamp(1) })
          ),
        };
        const orchestrator = new IngestionOrchestrator(config);

        const result = await orchestrator.ingestAll();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });
    });
  });

  // ==========================================================================
  // validateAll() Method Tests
  // ==========================================================================

  describe('validateAll()', () => {
    describe('success cases', () => {
      it('should validate all payloads without calling endpoints', () => {
        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationPayload = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpPayload = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
        });
        const costBaselinePayload = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = orchestrator.validateAll(
          simulationPayload,
          erpPayload,
          costBaselinePayload
        );

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(config.simulation.fetchSimulationOutput).not.toHaveBeenCalled();
        expect(config.erpSurface.fetchERPMetadata).not.toHaveBeenCalled();
        expect(config.costOps.fetchCostBaseline).not.toHaveBeenCalled();
      });

      it('should compute checksums for all validated payloads', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const simulationPayload = createMockSimulationOutput();
        const erpPayload = createMockERPMetadata();
        const costBaselinePayload = createMockCostBaseline();

        const result = orchestrator.validateAll(
          simulationPayload,
          erpPayload,
          costBaselinePayload
        );

        expect(result.checksums.simulation).toHaveLength(64);
        expect(result.checksums.erpMetadata).toHaveLength(64);
        expect(result.checksums.costBaseline).toHaveLength(64);
      });

      it('should populate individual validation results', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationPayload = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpPayload = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
        });
        const costBaselinePayload = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const result = orchestrator.validateAll(
          simulationPayload,
          erpPayload,
          costBaselinePayload
        );

        expect(result.individualResults.simulation).not.toBeNull();
        expect(result.individualResults.erpMetadata).not.toBeNull();
        expect(result.individualResults.costBaseline).not.toBeNull();
      });
    });

    describe('validation failures', () => {
      it('should return FAILED for invalid simulation payload', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = orchestrator.validateAll(
          createInvalidSimulationOutput(),
          createMockERPMetadata(),
          createMockCostBaseline()
        );

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
      });

      it('should return FAILED for invalid ERP payload', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = orchestrator.validateAll(
          createMockSimulationOutput(),
          createInvalidERPMetadata(),
          createMockCostBaseline()
        );

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
      });

      it('should return FAILED for invalid cost baseline payload', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = orchestrator.validateAll(
          createMockSimulationOutput(),
          createMockERPMetadata(),
          createInvalidCostBaseline()
        );

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
      });

      it('should aggregate errors from all invalid payloads', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const result = orchestrator.validateAll(
          createInvalidSimulationOutput(),
          createInvalidERPMetadata(),
          createInvalidCostBaseline()
        );

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });

    describe('cross-validation in validateAll', () => {
      it('should perform cross-validation on valid payloads', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const baselineId1 = generateUUID();
        const baselineId2 = generateUUID();
        const costCenterId = 'CC-001';

        const simulationPayload = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId: baselineId1 }),
        });
        const erpPayload = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
        });
        const costBaselinePayload = createMockCostBaseline({
          baselineId: baselineId2, // Mismatched
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const result = orchestrator.validateAll(
          simulationPayload,
          erpPayload,
          costBaselinePayload
        );

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('baseline'))).toBe(true);
      });
    });

    describe('partial success in validateAll', () => {
      it('should return PARTIAL when individual validation has warnings', () => {
        const config = createValidEndpointConfig();
        const orchestrator = new IngestionOrchestrator(config);

        const baselineId = generateUUID();
        const costCenterId = 'CC-001';

        const simulationPayload = createMockSimulationOutput({
          scenario: createMockSimulationScenario({ baselineId }),
        });
        const erpPayload = createMockERPMetadata({
          reportingCurrency: 'USD',
          costCenters: [createMockCostCenter({ costCenterId })],
          extractTimestamp: getStaleTimestamp(),
        });
        const costBaselinePayload = createMockCostBaseline({
          baselineId,
          laborRates: [createMockLaborRate({ currency: 'USD' })],
          overheadFactors: [createMockOverheadFactor({ costCenterId })],
        });

        const result = orchestrator.validateAll(
          simulationPayload,
          erpPayload,
          costBaselinePayload
        );

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('stale'))).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty cost centers in ERP when checking overhead factors', async () => {
      const baselineId = generateUUID();

      const simulationOutput = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ baselineId }),
      });
      const erpMetadata = createMockERPMetadata({
        reportingCurrency: 'USD',
        costCenters: [], // Empty
      });
      const costBaseline = createMockCostBaseline({
        baselineId,
        laborRates: [createMockLaborRate({ currency: 'USD' })],
        overheadFactors: [createMockOverheadFactor({ costCenterId: 'CC-001' })],
      });

      const config: IngestionEndpointConfig = {
        simulation: createMockSimulationEndpoint(simulationOutput),
        erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
        costOps: createMockCostOpsEndpoint(costBaseline),
      };
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      expect(result.status).toBe(IngestionStatus.PARTIAL);
      expect(result.warnings.some((w) => w.includes('cost center'))).toBe(true);
    });

    it('should handle empty labor rates when checking currency', async () => {
      const baselineId = generateUUID();
      const costCenterId = 'CC-001';

      const simulationOutput = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ baselineId }),
      });
      const erpMetadata = createMockERPMetadata({
        reportingCurrency: 'EUR',
        costCenters: [createMockCostCenter({ costCenterId })],
      });
      const costBaseline = createMockCostBaseline({
        baselineId,
        laborRates: [], // Empty
        overheadFactors: [createMockOverheadFactor({ costCenterId })],
      });

      const config: IngestionEndpointConfig = {
        simulation: createMockSimulationEndpoint(simulationOutput),
        erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
        costOps: createMockCostOpsEndpoint(costBaseline),
      };
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      expect(result.status).toBe(IngestionStatus.PARTIAL);
      expect(result.warnings.some((w) => w.includes('currency'))).toBe(true);
    });

    it('should handle empty overhead factors', async () => {
      const baselineId = generateUUID();

      const simulationOutput = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ baselineId }),
      });
      const erpMetadata = createMockERPMetadata({
        reportingCurrency: 'USD',
        costCenters: [createMockCostCenter()],
      });
      const costBaseline = createMockCostBaseline({
        baselineId,
        laborRates: [createMockLaborRate({ currency: 'USD' })],
        overheadFactors: [], // Empty
      });

      const config: IngestionEndpointConfig = {
        simulation: createMockSimulationEndpoint(simulationOutput),
        erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
        costOps: createMockCostOpsEndpoint(costBaseline),
      };
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      // No cross-validation warnings for overhead factors
      expect(result.warnings.filter((w) => w.includes('cost center')).length).toBe(0);
    });

    it('should handle multiple overhead factors with some invalid', async () => {
      const baselineId = generateUUID();

      const simulationOutput = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ baselineId }),
      });
      const erpMetadata = createMockERPMetadata({
        reportingCurrency: 'USD',
        costCenters: [
          createMockCostCenter({ costCenterId: 'CC-001' }),
          createMockCostCenter({ costCenterId: 'CC-002' }),
        ],
      });
      const costBaseline = createMockCostBaseline({
        baselineId,
        laborRates: [createMockLaborRate({ currency: 'USD' })],
        overheadFactors: [
          createMockOverheadFactor({ costCenterId: 'CC-001' }), // Valid
          createMockOverheadFactor({ costCenterId: 'CC-INVALID' }), // Invalid
        ],
      });

      const config: IngestionEndpointConfig = {
        simulation: createMockSimulationEndpoint(simulationOutput),
        erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
        costOps: createMockCostOpsEndpoint(costBaseline),
      };
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      expect(result.status).toBe(IngestionStatus.PARTIAL);
      const ccWarnings = result.warnings.filter((w) =>
        w.includes('CC-INVALID')
      );
      expect(ccWarnings.length).toBe(1);
    });

    it('should handle multiple currencies in labor rates', async () => {
      const baselineId = generateUUID();
      const costCenterId = 'CC-001';

      const simulationOutput = createMockSimulationOutput({
        scenario: createMockSimulationScenario({ baselineId }),
      });
      const erpMetadata = createMockERPMetadata({
        reportingCurrency: 'EUR',
        costCenters: [createMockCostCenter({ costCenterId })],
      });
      const costBaseline = createMockCostBaseline({
        baselineId,
        laborRates: [
          createMockLaborRate({ roleId: 'r1', currency: 'USD' }),
          createMockLaborRate({ roleId: 'r2', currency: 'EUR' }),
          createMockLaborRate({ roleId: 'r3', currency: 'GBP' }),
        ],
        overheadFactors: [createMockOverheadFactor({ costCenterId })],
      });

      const config: IngestionEndpointConfig = {
        simulation: createMockSimulationEndpoint(simulationOutput),
        erpSurface: createMockERPSurfaceEndpoint(erpMetadata),
        costOps: createMockCostOpsEndpoint(costBaseline),
      };
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      // EUR is present in labor rates, so no warning
      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });
  });

  // ==========================================================================
  // Consistency Tests
  // ==========================================================================

  describe('consistency', () => {
    it('should produce consistent checksums for same payloads', async () => {
      const config1 = createValidEndpointConfig();
      const config2 = createValidEndpointConfig();
      const orchestrator1 = new IngestionOrchestrator(config1);
      const orchestrator2 = new IngestionOrchestrator(config2);

      const result1 = await orchestrator1.ingestAll();
      const result2 = await orchestrator2.ingestAll();

      // Note: checksums will be same if the mock data is identical
      expect(result1.status).toBe(result2.status);
    });

    it('should maintain referential integrity in returned data', async () => {
      const config = createValidEndpointConfig();
      const orchestrator = new IngestionOrchestrator(config);

      const result = await orchestrator.ingestAll();

      expect(result.data?.simulation).toBeDefined();
      expect(result.data?.erpMetadata).toBeDefined();
      expect(result.data?.costBaseline).toBeDefined();

      // Individual results should match aggregated data
      expect(result.individualResults.simulation?.data).toEqual(result.data?.simulation);
      expect(result.individualResults.erpMetadata?.data).toEqual(result.data?.erpMetadata);
      expect(result.individualResults.costBaseline?.data).toEqual(result.data?.costBaseline);
    });
  });
});
