/**
 * CostBaselineIngestor Unit Tests
 * Tests validation, ingestion, rate consistency checks, and error handling.
 */

import { createHash } from 'crypto';
import {
  CostBaselineIngestor,
  CostOpsEndpoint,
} from '../../../src/ingestion/CostBaselineIngestor';
import { IngestionStatus } from '../../../src/contracts';
import {
  createMockCostBaseline,
  createMockCostOpsEndpoint,
  createMockCostOpsEndpointWithError,
  createInvalidCostBaseline,
  createCostBaselineMissingFields,
  createEmptyArraysCostBaseline,
  createMockLaborRate,
  createMockInfrastructureCost,
  createMockOverheadFactor,
  createMockRiskWeightMatrix,
  getPastTimestamp,
  getFutureTimestamp,
  getStaleTimestamp,
  resetUUIDCounter,
} from './__mocks__/mockData';

describe('CostBaselineIngestor', () => {
  beforeEach(() => {
    resetUUIDCounter();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with a valid endpoint', () => {
      const endpoint = createMockCostOpsEndpoint();
      const ingestor = new CostBaselineIngestor(endpoint);
      expect(ingestor).toBeInstanceOf(CostBaselineIngestor);
    });
  });

  // ==========================================================================
  // ingest() Method Tests
  // ==========================================================================

  describe('ingest()', () => {
    describe('success cases', () => {
      it('should successfully ingest valid cost baseline', async () => {
        const mockData = createMockCostBaseline();
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(result.data?.baselineId).toBe(mockData.baselineId);
        expect(result.errors).toHaveLength(0);
        expect(result.checksum).toHaveLength(64);
        expect(result.ingestedAt).toBeDefined();
      });

      it('should compute correct checksum for payload', async () => {
        const mockData = createMockCostBaseline();
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(mockData))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should call endpoint fetchCostBaseline with no args', async () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);

        await ingestor.ingest();

        expect(endpoint.fetchCostBaseline).toHaveBeenCalledTimes(1);
        expect(endpoint.fetchCostBaseline).toHaveBeenCalledWith(undefined);
      });

      it('should pass baselineId to endpoint when provided', async () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const baselineId = 'specific-baseline-id';

        await ingestor.ingest(baselineId);

        expect(endpoint.fetchCostBaseline).toHaveBeenCalledWith(baselineId);
      });

      it('should handle cost baseline with empty arrays', async () => {
        const mockData = createEmptyArraysCostBaseline();
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.laborRates).toHaveLength(0);
        expect(result.data?.infrastructureCosts).toHaveLength(0);
        expect(result.data?.licenseCosts).toHaveLength(0);
        expect(result.data?.overheadFactors).toHaveLength(0);
        expect(result.data?.riskWeights).toHaveLength(0);
      });

      it('should handle multiple labor rates', async () => {
        const laborRates = [
          createMockLaborRate({ roleId: 'role-1', roleName: 'Engineer' }),
          createMockLaborRate({ roleId: 'role-2', roleName: 'Analyst' }),
          createMockLaborRate({ roleId: 'role-3', roleName: 'Manager' }),
        ];
        const mockData = createMockCostBaseline({ laborRates });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.laborRates).toHaveLength(3);
      });
    });

    describe('temporal bounds validation', () => {
      it('should reject future snapshotTimestamp with FAILED status', async () => {
        const mockData = createMockCostBaseline({
          snapshotTimestamp: getFutureTimestamp(1),
        });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.code).toBe('FUTURE_TIMESTAMP_ERROR');
        expect(result.errors[0]!.message).toContain('in the future');
      });

      it('should return PARTIAL status for stale data (>24h old)', async () => {
        const mockData = createMockCostBaseline({
          snapshotTimestamp: getStaleTimestamp(),
        });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.data).not.toBeNull();
        expect(result.warnings.some((w) => w.includes('stale'))).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept recent snapshotTimestamp without warnings', async () => {
        const mockData = createMockCostBaseline({
          snapshotTimestamp: getPastTimestamp(1),
        });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('rate consistency validation', () => {
      it('should warn about duplicate labor rate role IDs', async () => {
        const laborRates = [
          createMockLaborRate({ roleId: 'duplicate-role' }),
          createMockLaborRate({ roleId: 'duplicate-role' }),
        ];
        const mockData = createMockCostBaseline({ laborRates });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('Duplicate labor rate'))).toBe(true);
      });

      it('should warn about duplicate infrastructure resource types', async () => {
        const infrastructureCosts = [
          createMockInfrastructureCost({ resourceType: 'duplicate-type' }),
          createMockInfrastructureCost({ resourceType: 'duplicate-type' }),
        ];
        const mockData = createMockCostBaseline({ infrastructureCosts });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('Duplicate infrastructure cost'))).toBe(
          true
        );
      });

      it('should warn about discount rate below typical range', async () => {
        const mockData = createMockCostBaseline({ discountRate: 0.04 });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('outside typical range'))).toBe(true);
      });

      it('should warn about discount rate above typical range', async () => {
        const mockData = createMockCostBaseline({ discountRate: 0.16 });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('outside typical range'))).toBe(true);
      });

      it('should accept discount rate at boundaries of typical range', async () => {
        const mockDataMin = createMockCostBaseline({ discountRate: 0.05 });
        const mockDataMax = createMockCostBaseline({ discountRate: 0.15 });
        const endpointMin = createMockCostOpsEndpoint(mockDataMin);
        const endpointMax = createMockCostOpsEndpoint(mockDataMax);
        const ingestorMin = new CostBaselineIngestor(endpointMin);
        const ingestorMax = new CostBaselineIngestor(endpointMax);

        const resultMin = await ingestorMin.ingest();
        const resultMax = await ingestorMax.ingest();

        expect(resultMin.status).toBe(IngestionStatus.SUCCESS);
        expect(resultMax.status).toBe(IngestionStatus.SUCCESS);
      });

      it('should warn about overhead factors exceeding 100%', async () => {
        const overheadFactors = [
          createMockOverheadFactor({
            directRate: 0.50,
            indirectRate: 0.40,
            sharedServicesRate: 0.20, // Total: 110%
          }),
        ];
        const mockData = createMockCostBaseline({ overheadFactors });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('exceed 100%'))).toBe(true);
      });

      it('should not warn about overhead factors at exactly 100%', async () => {
        const overheadFactors = [
          createMockOverheadFactor({
            directRate: 0.40,
            indirectRate: 0.35,
            sharedServicesRate: 0.25, // Total: 100%
          }),
        ];
        const mockData = createMockCostBaseline({ overheadFactors });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings.filter((w) => w.includes('exceed 100%'))).toHaveLength(0);
      });

      it('should report multiple rate consistency warnings', async () => {
        const laborRates = [
          createMockLaborRate({ roleId: 'dup-role' }),
          createMockLaborRate({ roleId: 'dup-role' }),
        ];
        const infrastructureCosts = [
          createMockInfrastructureCost({ resourceType: 'dup-type' }),
          createMockInfrastructureCost({ resourceType: 'dup-type' }),
        ];
        const overheadFactors = [
          createMockOverheadFactor({
            directRate: 0.60,
            indirectRate: 0.30,
            sharedServicesRate: 0.20, // 110%
          }),
        ];
        const mockData = createMockCostBaseline({
          laborRates,
          infrastructureCosts,
          overheadFactors,
          discountRate: 0.02, // Also atypical
        });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe('fetch error handling', () => {
      it('should return FAILED status when endpoint throws error', async () => {
        const error = new Error('Service unavailable');
        const endpoint = createMockCostOpsEndpointWithError(error);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.checksum).toBe('');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.code).toBe('FETCH_ERROR');
        expect(result.errors[0]!.message).toContain('Service unavailable');
      });

      it('should handle non-Error thrown values', async () => {
        const endpoint: CostOpsEndpoint = {
          fetchCostBaseline: jest.fn().mockRejectedValue('string error'),
        };
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0]!.message).toContain('string error');
      });
    });

    describe('schema validation errors', () => {
      it('should return FAILED status for invalid schema', async () => {
        const invalidData = createInvalidCostBaseline();
        const endpoint = createMockCostOpsEndpoint(invalidData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]!.code).toBe('SCHEMA_VALIDATION_ERROR');
      });

      it('should return FAILED status for missing required fields', async () => {
        const incompleteData = createCostBaselineMissingFields();
        const endpoint = createMockCostOpsEndpoint(incompleteData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject invalid baselineId (non-UUID)', async () => {
        const invalidData = {
          ...createMockCostBaseline(),
          baselineId: 'not-a-uuid',
        };
        const endpoint = createMockCostOpsEndpoint(invalidData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should reject discountRate exceeding 1.0', async () => {
        const invalidData = {
          ...createMockCostBaseline(),
          discountRate: 1.5,
        };
        const endpoint = createMockCostOpsEndpoint(invalidData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should reject negative discountRate', async () => {
        const invalidData = {
          ...createMockCostBaseline(),
          discountRate: -0.1,
        };
        const endpoint = createMockCostOpsEndpoint(invalidData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should reject invalid fullyLoadedRate format', async () => {
        const invalidData = {
          ...createMockCostBaseline(),
          laborRates: [
            {
              ...createMockLaborRate(),
              fullyLoadedRate: 'abc', // Not a valid decimal
            },
          ],
        };
        const endpoint = createMockCostOpsEndpoint(invalidData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });
    });

    describe('null and undefined handling', () => {
      it('should handle null payload', async () => {
        const endpoint = createMockCostOpsEndpoint(null);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should handle undefined payload', async () => {
        const endpoint = createMockCostOpsEndpoint(undefined);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });
    });
  });

  // ==========================================================================
  // validatePayload() Method Tests
  // ==========================================================================

  describe('validatePayload()', () => {
    describe('success cases', () => {
      it('should validate valid payload without endpoint call', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline();

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(endpoint.fetchCostBaseline).not.toHaveBeenCalled();
      });

      it('should compute checksum for validated payload', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline();

        const result = ingestor.validatePayload(payload);

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should return ingestedAt timestamp', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline();

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
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const invalidPayload = createInvalidCostBaseline();

        const result = ingestor.validatePayload(invalidPayload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return FAILED for future timestamp', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline({
          snapshotTimestamp: getFutureTimestamp(1),
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0]!.code).toBe('FUTURE_TIMESTAMP_ERROR');
      });
    });

    describe('rate consistency in validatePayload', () => {
      it('should validate duplicate labor rates', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline({
          laborRates: [
            createMockLaborRate({ roleId: 'dup' }),
            createMockLaborRate({ roleId: 'dup' }),
          ],
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('Duplicate labor rate'))).toBe(true);
      });

      it('should validate overhead factor totals', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline({
          overheadFactors: [
            createMockOverheadFactor({
              directRate: 0.50,
              indirectRate: 0.40,
              sharedServicesRate: 0.20,
            }),
          ],
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('exceed 100%'))).toBe(true);
      });
    });

    describe('temporal bounds in validatePayload', () => {
      it('should return PARTIAL for stale data', () => {
        const endpoint = createMockCostOpsEndpoint();
        const ingestor = new CostBaselineIngestor(endpoint);
        const payload = createMockCostBaseline({
          snapshotTimestamp: getStaleTimestamp(),
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('stale'))).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Edge Cases and Boundary Tests
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle long role names at max length', async () => {
      const longName = 'A'.repeat(256);
      const mockData = createMockCostBaseline({
        laborRates: [createMockLaborRate({ roleName: longName })],
      });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.laborRates[0]!.roleName).toBe(longName);
    });

    it('should reject role names exceeding max length', async () => {
      const tooLongName = 'A'.repeat(257);
      const mockData = {
        ...createMockCostBaseline(),
        laborRates: [{ ...createMockLaborRate(), roleName: tooLongName }],
      };
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.FAILED);
    });

    it('should handle discountRate at boundary (0)', async () => {
      const mockData = createMockCostBaseline({ discountRate: 0 });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.PARTIAL); // 0 is outside typical range
      expect(result.data?.discountRate).toBe(0);
    });

    it('should handle discountRate at boundary (1)', async () => {
      const mockData = createMockCostBaseline({ discountRate: 1 });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.PARTIAL); // 1 is outside typical range
      expect(result.data?.discountRate).toBe(1);
    });

    it('should handle overhead factors at boundary (0)', async () => {
      const overheadFactors = [
        createMockOverheadFactor({
          directRate: 0,
          indirectRate: 0,
          sharedServicesRate: 0,
        }),
      ];
      const mockData = createMockCostBaseline({ overheadFactors });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should handle overhead factors at boundary (1 each)', async () => {
      const overheadFactors = [
        createMockOverheadFactor({
          directRate: 1,
          indirectRate: 1,
          sharedServicesRate: 1,
        }),
      ];
      const mockData = createMockCostBaseline({ overheadFactors });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.PARTIAL); // Total exceeds 100%
    });

    it('should handle various decimal precision in rates', async () => {
      const laborRates = [
        createMockLaborRate({ fullyLoadedRate: '150' }),
        createMockLaborRate({ roleId: 'r2', fullyLoadedRate: '150.1' }),
        createMockLaborRate({ roleId: 'r3', fullyLoadedRate: '150.12' }),
        createMockLaborRate({ roleId: 'r4', fullyLoadedRate: '150.123' }),
        createMockLaborRate({ roleId: 'r5', fullyLoadedRate: '150.1234' }),
      ];
      const mockData = createMockCostBaseline({ laborRates });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should reject rates with too many decimal places', async () => {
      const laborRates = [
        createMockLaborRate({ fullyLoadedRate: '150.12345' }),
      ];
      const mockData = {
        ...createMockCostBaseline(),
        laborRates,
      };
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.FAILED);
    });

    it('should handle various currency codes', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
      const laborRates = currencies.map((currency, i) =>
        createMockLaborRate({ roleId: `role-${i}`, currency })
      );
      const mockData = createMockCostBaseline({ laborRates });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should handle risk weight matrix with all fields', async () => {
      const riskWeights = [
        createMockRiskWeightMatrix({
          categoryId: 'high-risk',
          categoryName: 'High Risk Category',
          baseWeight: 1.5,
          volatilityMultiplier: 0.8,
          confidenceDecayRate: 0.5,
          maxWeight: 3.0,
        }),
      ];
      const mockData = createMockCostBaseline({ riskWeights });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.riskWeights[0]!.baseWeight).toBe(1.5);
    });

    it('should handle large number of rate entries', async () => {
      const laborRates = Array.from({ length: 100 }, (_, i) =>
        createMockLaborRate({ roleId: `role-${i}`, roleName: `Role ${i}` })
      );
      const mockData = createMockCostBaseline({ laborRates });
      const endpoint = createMockCostOpsEndpoint(mockData);
      const ingestor = new CostBaselineIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.laborRates).toHaveLength(100);
    });

    it('should handle various baseline period formats', async () => {
      const periods = ['FY2024', 'Q1-2024', 'CY2024', 'H1-2024'];

      for (const period of periods) {
        const mockData = createMockCostBaseline({ baselinePeriod: period });
        const endpoint = createMockCostOpsEndpoint(mockData);
        const ingestor = new CostBaselineIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.baselinePeriod).toBe(period);
      }
    });
  });

  // ==========================================================================
  // Consistency Tests
  // ==========================================================================

  describe('consistency', () => {
    it('should produce consistent checksums for same payload', async () => {
      const mockData = createMockCostBaseline();
      const endpoint1 = createMockCostOpsEndpoint(mockData);
      const endpoint2 = createMockCostOpsEndpoint(mockData);
      const ingestor1 = new CostBaselineIngestor(endpoint1);
      const ingestor2 = new CostBaselineIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('should produce different checksums for different payloads', async () => {
      const mockData1 = createMockCostBaseline({ baselinePeriod: 'FY2024' });
      const mockData2 = createMockCostBaseline({ baselinePeriod: 'FY2025' });
      const endpoint1 = createMockCostOpsEndpoint(mockData1);
      const endpoint2 = createMockCostOpsEndpoint(mockData2);
      const ingestor1 = new CostBaselineIngestor(endpoint1);
      const ingestor2 = new CostBaselineIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });
});
