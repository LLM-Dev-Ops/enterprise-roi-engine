/**
 * ERPMetadataIngestor Unit Tests
 * Tests validation, ingestion, hierarchy validation, and error handling.
 */

import { createHash } from 'crypto';
import {
  ERPMetadataIngestor,
  ERPSurfaceEndpoint,
} from '../../../src/ingestion/ERPMetadataIngestor';
import { IngestionStatus, EntityType, AccountType, NaturalSign } from '../../../src/contracts';
import {
  createMockERPMetadata,
  createMockERPSurfaceEndpoint,
  createMockERPSurfaceEndpointWithError,
  createInvalidERPMetadata,
  createERPMetadataMissingFields,
  createEmptyArraysERPMetadata,
  createMockEntityMapping,
  createMockGLAccount,
  createMockCostCenter,
  createMockFiscalPeriod,
  getPastTimestamp,
  getFutureTimestamp,
  getStaleTimestamp,
  resetUUIDCounter,
  generateUUID,
} from './__mocks__/mockData';

describe('ERPMetadataIngestor', () => {
  beforeEach(() => {
    resetUUIDCounter();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with a valid endpoint', () => {
      const endpoint = createMockERPSurfaceEndpoint();
      const ingestor = new ERPMetadataIngestor(endpoint);
      expect(ingestor).toBeInstanceOf(ERPMetadataIngestor);
    });
  });

  // ==========================================================================
  // ingest() Method Tests
  // ==========================================================================

  describe('ingest()', () => {
    describe('success cases', () => {
      it('should successfully ingest valid ERP metadata', async () => {
        const mockData = createMockERPMetadata();
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(result.data?.erpSystem).toBe(mockData.erpSystem);
        expect(result.errors).toHaveLength(0);
        expect(result.checksum).toHaveLength(64);
        expect(result.ingestedAt).toBeDefined();
      });

      it('should compute correct checksum for payload', async () => {
        const mockData = createMockERPMetadata();
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(mockData))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should call endpoint fetchERPMetadata exactly once', async () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);

        await ingestor.ingest();

        expect(endpoint.fetchERPMetadata).toHaveBeenCalledTimes(1);
      });

      it('should handle ERP metadata with empty arrays', async () => {
        const mockData = createEmptyArraysERPMetadata();
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.entities).toHaveLength(0);
        expect(result.data?.chartOfAccounts).toHaveLength(0);
        expect(result.data?.costCenters).toHaveLength(0);
        expect(result.data?.fiscalCalendar).toHaveLength(0);
      });

      it('should handle multiple entity types', async () => {
        const entities = [
          createMockEntityMapping({ entityType: EntityType.COST_CENTER }),
          createMockEntityMapping({ entityType: EntityType.DEPARTMENT }),
          createMockEntityMapping({ entityType: EntityType.PROJECT }),
          createMockEntityMapping({ entityType: EntityType.BUSINESS_UNIT }),
          createMockEntityMapping({ entityType: EntityType.LEGAL_ENTITY }),
        ];
        const mockData = createMockERPMetadata({ entities });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.entities).toHaveLength(5);
      });

      it('should handle multiple account types', async () => {
        const chartOfAccounts = [
          createMockGLAccount({ accountType: AccountType.ASSET }),
          createMockGLAccount({ accountType: AccountType.LIABILITY }),
          createMockGLAccount({ accountType: AccountType.EQUITY }),
          createMockGLAccount({ accountType: AccountType.REVENUE }),
          createMockGLAccount({ accountType: AccountType.EXPENSE }),
        ];
        const mockData = createMockERPMetadata({ chartOfAccounts });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.chartOfAccounts).toHaveLength(5);
      });
    });

    describe('temporal bounds validation', () => {
      it('should reject future extractTimestamp with FAILED status', async () => {
        const mockData = createMockERPMetadata({
          extractTimestamp: getFutureTimestamp(1),
        });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('FUTURE_TIMESTAMP_ERROR');
        expect(result.errors[0].message).toContain('in the future');
      });

      it('should return PARTIAL status for stale data (>24h old)', async () => {
        const mockData = createMockERPMetadata({
          extractTimestamp: getStaleTimestamp(),
        });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.data).not.toBeNull();
        expect(result.warnings.some((w) => w.includes('stale'))).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept recent extractTimestamp without warnings', async () => {
        const mockData = createMockERPMetadata({
          extractTimestamp: getPastTimestamp(1),
        });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('entity hierarchy validation', () => {
      it('should warn about entity with non-existent parent', async () => {
        const entities = [
          createMockEntityMapping({
            erpEntityId: 'child-entity',
            parentId: 'non-existent-parent',
          }),
        ];
        const mockData = createMockERPMetadata({ entities });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('non-existent parent'))).toBe(true);
      });

      it('should not warn when parent entity exists', async () => {
        const entities = [
          createMockEntityMapping({
            erpEntityId: 'parent-entity',
            parentId: null,
          }),
          createMockEntityMapping({
            erpEntityId: 'child-entity',
            parentId: 'parent-entity',
          }),
        ];
        const mockData = createMockERPMetadata({ entities });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });

      it('should handle deeply nested entity hierarchy', async () => {
        const entities = [
          createMockEntityMapping({ erpEntityId: 'level-0', parentId: null }),
          createMockEntityMapping({ erpEntityId: 'level-1', parentId: 'level-0' }),
          createMockEntityMapping({ erpEntityId: 'level-2', parentId: 'level-1' }),
          createMockEntityMapping({ erpEntityId: 'level-3', parentId: 'level-2' }),
        ];
        const mockData = createMockERPMetadata({ entities });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('cost center hierarchy validation', () => {
      it('should warn about cost center with non-existent parent', async () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'child-cc',
            parentCostCenterId: 'non-existent-parent-cc',
          }),
        ];
        const mockData = createMockERPMetadata({ costCenters });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('non-existent parent'))).toBe(true);
      });

      it('should not warn when parent cost center exists', async () => {
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'parent-cc',
            parentCostCenterId: null,
          }),
          createMockCostCenter({
            costCenterId: 'child-cc',
            parentCostCenterId: 'parent-cc',
          }),
        ];
        const mockData = createMockERPMetadata({ costCenters });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.warnings).toHaveLength(0);
      });

      it('should report multiple hierarchy warnings', async () => {
        const entities = [
          createMockEntityMapping({
            erpEntityId: 'orphan-entity-1',
            parentId: 'missing-parent-1',
          }),
          createMockEntityMapping({
            erpEntityId: 'orphan-entity-2',
            parentId: 'missing-parent-2',
          }),
        ];
        const costCenters = [
          createMockCostCenter({
            costCenterId: 'orphan-cc',
            parentCostCenterId: 'missing-cc',
          }),
        ];
        const mockData = createMockERPMetadata({ entities, costCenters });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.length).toBe(3);
      });
    });

    describe('fetch error handling', () => {
      it('should return FAILED status when endpoint throws error', async () => {
        const error = new Error('Connection refused');
        const endpoint = createMockERPSurfaceEndpointWithError(error);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.checksum).toBe('');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('FETCH_ERROR');
        expect(result.errors[0].message).toContain('Connection refused');
      });

      it('should handle non-Error thrown values', async () => {
        const endpoint: ERPSurfaceEndpoint = {
          fetchERPMetadata: jest.fn().mockRejectedValue('string error'),
        };
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].message).toContain('string error');
      });
    });

    describe('schema validation errors', () => {
      it('should return FAILED status for invalid schema', async () => {
        const invalidData = createInvalidERPMetadata();
        const endpoint = createMockERPSurfaceEndpoint(invalidData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('SCHEMA_VALIDATION_ERROR');
      });

      it('should return FAILED status for missing required fields', async () => {
        const incompleteData = createERPMetadataMissingFields();
        const endpoint = createMockERPSurfaceEndpoint(incompleteData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject invalid currency code length', async () => {
        const invalidData = {
          ...createMockERPMetadata(),
          reportingCurrency: 'INVALID',
        };
        const endpoint = createMockERPSurfaceEndpoint(invalidData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].message).toContain('reportingCurrency');
      });

      it('should reject empty erpSystem', async () => {
        const invalidData = {
          ...createMockERPMetadata(),
          erpSystem: '',
        };
        const endpoint = createMockERPSurfaceEndpoint(invalidData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });
    });

    describe('null and undefined handling', () => {
      it('should handle null payload', async () => {
        const endpoint = createMockERPSurfaceEndpoint(null);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should handle undefined payload', async () => {
        const endpoint = createMockERPSurfaceEndpoint(undefined);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.FAILED);
      });

      it('should accept null parentId in entities', async () => {
        const mockData = createMockERPMetadata({
          entities: [createMockEntityMapping({ parentId: null })],
        });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.entities[0]!.parentId).toBeNull();
      });

      it('should accept null parentCostCenterId', async () => {
        const mockData = createMockERPMetadata({
          costCenters: [createMockCostCenter({ parentCostCenterId: null })],
        });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.costCenters[0]!.parentCostCenterId).toBeNull();
      });
    });
  });

  // ==========================================================================
  // validatePayload() Method Tests
  // ==========================================================================

  describe('validatePayload()', () => {
    describe('success cases', () => {
      it('should validate valid payload without endpoint call', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata();

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data).not.toBeNull();
        expect(endpoint.fetchERPMetadata).not.toHaveBeenCalled();
      });

      it('should compute checksum for validated payload', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata();

        const result = ingestor.validatePayload(payload);

        const expectedChecksum = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
        expect(result.checksum).toBe(expectedChecksum);
      });

      it('should return ingestedAt timestamp', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata();

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
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const invalidPayload = createInvalidERPMetadata();

        const result = ingestor.validatePayload(invalidPayload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return FAILED for future timestamp', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata({
          extractTimestamp: getFutureTimestamp(1),
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.FAILED);
        expect(result.errors[0].code).toBe('FUTURE_TIMESTAMP_ERROR');
      });
    });

    describe('hierarchy validation in validatePayload', () => {
      it('should validate entity hierarchy', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata({
          entities: [
            createMockEntityMapping({
              erpEntityId: 'child',
              parentId: 'non-existent',
            }),
          ],
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('non-existent parent'))).toBe(true);
      });

      it('should validate cost center hierarchy', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata({
          costCenters: [
            createMockCostCenter({
              costCenterId: 'child',
              parentCostCenterId: 'non-existent',
            }),
          ],
        });

        const result = ingestor.validatePayload(payload);

        expect(result.status).toBe(IngestionStatus.PARTIAL);
        expect(result.warnings.some((w) => w.includes('non-existent parent'))).toBe(true);
      });
    });

    describe('temporal bounds in validatePayload', () => {
      it('should return PARTIAL for stale data', () => {
        const endpoint = createMockERPSurfaceEndpoint();
        const ingestor = new ERPMetadataIngestor(endpoint);
        const payload = createMockERPMetadata({
          extractTimestamp: getStaleTimestamp(),
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
    it('should handle long display names at max length', async () => {
      const longName = 'A'.repeat(256);
      const mockData = createMockERPMetadata({
        entities: [createMockEntityMapping({ displayName: longName })],
      });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.entities[0]!.displayName).toBe(longName);
    });

    it('should reject display names exceeding max length', async () => {
      const tooLongName = 'A'.repeat(257);
      const mockData = {
        ...createMockERPMetadata(),
        entities: [{ ...createMockEntityMapping(), displayName: tooLongName }],
      };
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.FAILED);
    });

    it('should handle hierarchyLevel at minimum (0)', async () => {
      const mockData = createMockERPMetadata({
        costCenters: [createMockCostCenter({ hierarchyLevel: 0 })],
      });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.costCenters[0]!.hierarchyLevel).toBe(0);
    });

    it('should handle fiscal periods across year boundary', async () => {
      const fiscalCalendar = [
        createMockFiscalPeriod({ year: 2023, period: 12 }),
        createMockFiscalPeriod({ year: 2024, period: 1 }),
      ];
      const mockData = createMockERPMetadata({ fiscalCalendar });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.fiscalCalendar).toHaveLength(2);
    });

    it('should handle large attributes objects', async () => {
      const attributes: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        attributes[`attr_${i}`] = `value_${i}`;
      }
      const mockData = createMockERPMetadata({
        entities: [createMockEntityMapping({ attributes })],
      });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(Object.keys(result.data?.entities[0]!.attributes ?? {}).length).toBe(100);
    });

    it('should handle accounts with both natural signs', async () => {
      const chartOfAccounts = [
        createMockGLAccount({ naturalSign: NaturalSign.DEBIT }),
        createMockGLAccount({ naturalSign: NaturalSign.CREDIT }),
      ];
      const mockData = createMockERPMetadata({ chartOfAccounts });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.chartOfAccounts[0]!.naturalSign).toBe(NaturalSign.DEBIT);
      expect(result.data?.chartOfAccounts[1]!.naturalSign).toBe(NaturalSign.CREDIT);
    });

    it('should handle both active and inactive accounts', async () => {
      const chartOfAccounts = [
        createMockGLAccount({ isActive: true }),
        createMockGLAccount({ isActive: false }),
      ];
      const mockData = createMockERPMetadata({ chartOfAccounts });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
      expect(result.data?.chartOfAccounts[0]!.isActive).toBe(true);
      expect(result.data?.chartOfAccounts[1]!.isActive).toBe(false);
    });

    it('should handle cost centers that do and do not accept direct charges', async () => {
      const costCenters = [
        createMockCostCenter({ acceptsDirectCharges: true }),
        createMockCostCenter({ acceptsDirectCharges: false }),
      ];
      const mockData = createMockERPMetadata({ costCenters });
      const endpoint = createMockERPSurfaceEndpoint(mockData);
      const ingestor = new ERPMetadataIngestor(endpoint);

      const result = await ingestor.ingest();

      expect(result.status).toBe(IngestionStatus.SUCCESS);
    });

    it('should handle various ERP systems', async () => {
      const erpSystems = ['SAP', 'Oracle', 'NetSuite', 'Custom-ERP'];

      for (const erpSystem of erpSystems) {
        const mockData = createMockERPMetadata({ erpSystem });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.erpSystem).toBe(erpSystem);
      }
    });

    it('should handle various currency codes', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];

      for (const currency of currencies) {
        const mockData = createMockERPMetadata({ reportingCurrency: currency });
        const endpoint = createMockERPSurfaceEndpoint(mockData);
        const ingestor = new ERPMetadataIngestor(endpoint);

        const result = await ingestor.ingest();

        expect(result.status).toBe(IngestionStatus.SUCCESS);
        expect(result.data?.reportingCurrency).toBe(currency);
      }
    });
  });

  // ==========================================================================
  // Consistency Tests
  // ==========================================================================

  describe('consistency', () => {
    it('should produce consistent checksums for same payload', async () => {
      const mockData = createMockERPMetadata();
      const endpoint1 = createMockERPSurfaceEndpoint(mockData);
      const endpoint2 = createMockERPSurfaceEndpoint(mockData);
      const ingestor1 = new ERPMetadataIngestor(endpoint1);
      const ingestor2 = new ERPMetadataIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('should produce different checksums for different payloads', async () => {
      const mockData1 = createMockERPMetadata({ erpSystem: 'SAP' });
      const mockData2 = createMockERPMetadata({ erpSystem: 'Oracle' });
      const endpoint1 = createMockERPSurfaceEndpoint(mockData1);
      const endpoint2 = createMockERPSurfaceEndpoint(mockData2);
      const ingestor1 = new ERPMetadataIngestor(endpoint1);
      const ingestor2 = new ERPMetadataIngestor(endpoint2);

      const result1 = await ingestor1.ingest();
      const result2 = await ingestor2.ingest();

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });
});
