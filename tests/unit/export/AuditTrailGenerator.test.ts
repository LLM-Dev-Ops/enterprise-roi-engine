/**
 * Unit Tests for AuditTrailGenerator
 * Tests audit trail generation, integrity verification, and cryptographic hashing.
 */

import {
  AuditTrailGenerator,
  AuditTrailGeneratorOptions,
  AuditStep,
  createAuditTrailGenerator,
  computeHash,
} from '../../../src/export/AuditTrailGenerator';
import { AuditRecordSchema } from '../../../src/contracts/artifacts';

// ============================================================================
// Mock Data
// ============================================================================

function createMockInputData() {
  return {
    id: 'test-input-001',
    values: [1, 2, 3],
    metadata: { source: 'test' },
  };
}

function createMockOutputData() {
  return {
    id: 'test-output-001',
    result: 'processed',
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('AuditTrailGenerator', () => {
  let generator: AuditTrailGenerator;

  beforeEach(() => {
    generator = new AuditTrailGenerator();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(generator).toBeInstanceOf(AuditTrailGenerator);
      expect(generator.getStepCount()).toBe(0);
    });

    it('should create an instance with custom options', () => {
      const options: AuditTrailGeneratorOptions = {
        includeFullData: true,
        maxDetailSize: 5000,
      };
      const customGenerator = new AuditTrailGenerator(options);
      expect(customGenerator).toBeInstanceOf(AuditTrailGenerator);
    });
  });

  describe('createAuditTrailGenerator factory', () => {
    it('should create a new AuditTrailGenerator instance', () => {
      const newGenerator = createAuditTrailGenerator();
      expect(newGenerator).toBeInstanceOf(AuditTrailGenerator);
    });

    it('should accept options', () => {
      const newGenerator = createAuditTrailGenerator({ includeFullData: true });
      expect(newGenerator).toBeInstanceOf(AuditTrailGenerator);
    });
  });

  describe('recordStep', () => {
    it('should record a step and return an AuditRecord', () => {
      const step: AuditStep = {
        operation: 'TEST_OPERATION',
        inputData: createMockInputData(),
        outputData: createMockOutputData(),
      };

      const record = generator.recordStep(step);

      expect(record.stepNumber).toBe(1);
      expect(record.operation).toBe('TEST_OPERATION');
      expect(record.inputHash).toBeDefined();
      expect(record.outputHash).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    it('should increment step number for each recorded step', () => {
      const step: AuditStep = {
        operation: 'TEST_OPERATION',
        inputData: {},
        outputData: {},
      };

      const record1 = generator.recordStep(step);
      const record2 = generator.recordStep(step);
      const record3 = generator.recordStep(step);

      expect(record1.stepNumber).toBe(1);
      expect(record2.stepNumber).toBe(2);
      expect(record3.stepNumber).toBe(3);
      expect(generator.getStepCount()).toBe(3);
    });

    it('should compute SHA-256 hashes for input and output', () => {
      const step: AuditStep = {
        operation: 'HASH_TEST',
        inputData: { test: 'data' },
        outputData: { result: 'value' },
      };

      const record = generator.recordStep(step);

      // SHA-256 produces 64 character hex string
      expect(record.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.outputHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same data', () => {
      const data = { key: 'value', number: 42 };
      const step1: AuditStep = {
        operation: 'HASH_TEST',
        inputData: data,
        outputData: {},
      };
      const step2: AuditStep = {
        operation: 'HASH_TEST',
        inputData: data,
        outputData: {},
      };

      const record1 = generator.recordStep(step1);
      generator.reset();
      const record2 = generator.recordStep(step2);

      expect(record1.inputHash).toBe(record2.inputHash);
    });

    it('should include details when provided', () => {
      const step: AuditStep = {
        operation: 'DETAIL_TEST',
        inputData: {},
        outputData: {},
        details: { customField: 'customValue', count: 5 },
      };

      const record = generator.recordStep(step);

      expect(record.details).toEqual(expect.objectContaining({
        customField: 'customValue',
        count: 5,
      }));
    });

    it('should produce records that pass schema validation', () => {
      const step: AuditStep = {
        operation: 'SCHEMA_TEST',
        inputData: createMockInputData(),
        outputData: createMockOutputData(),
        details: { phase: 'test' },
      };

      const record = generator.recordStep(step);
      const result = AuditRecordSchema.safeParse(record);

      expect(result.success).toBe(true);
    });
  });

  describe('specialized recording methods', () => {
    describe('recordIngestion', () => {
      it('should record ingestion with correct operation', () => {
        const record = generator.recordIngestion('erp_system', { raw: 'data' }, { normalized: 'data' });

        expect(record.operation).toBe('INGESTION');
        expect(record.details).toEqual(expect.objectContaining({
          sourceSystem: 'erp_system',
          phase: 'ingestion',
        }));
      });
    });

    describe('recordNormalization', () => {
      it('should record normalization with record count', () => {
        const record = generator.recordNormalization({ raw: [] }, { canonical: [] }, 10);

        expect(record.operation).toBe('NORMALIZATION');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'normalization',
          recordCount: 10,
        }));
      });
    });

    describe('recordDeltaCalculation', () => {
      it('should record delta calculation with method', () => {
        const record = generator.recordDeltaCalculation({}, {}, 'risk-adjusted');

        expect(record.operation).toBe('DELTA_CALCULATION');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'calculation',
          calculationMethod: 'risk-adjusted',
        }));
      });
    });

    describe('recordRiskAdjustment', () => {
      it('should record risk adjustment with factors', () => {
        const riskFactors = { base: 0.9, confidence: 0.95 };
        const record = generator.recordRiskAdjustment({}, {}, riskFactors);

        expect(record.operation).toBe('RISK_ADJUSTMENT');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'risk_adjustment',
          riskFactors,
        }));
      });
    });

    describe('recordTimeValueAdjustment', () => {
      it('should record time value adjustment with parameters', () => {
        const record = generator.recordTimeValueAdjustment({}, {}, 0.1, 12);

        expect(record.operation).toBe('TIME_VALUE_ADJUSTMENT');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'time_value',
          discountRate: 0.1,
          horizonMonths: 12,
        }));
      });
    });

    describe('recordAttribution', () => {
      it('should record attribution with method', () => {
        const record = generator.recordAttribution({}, {}, 'activity-based');

        expect(record.operation).toBe('ATTRIBUTION');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'attribution',
          attributionMethod: 'activity-based',
        }));
      });
    });

    describe('recordConfidenceCalculation', () => {
      it('should record confidence calculation with levels', () => {
        const record = generator.recordConfidenceCalculation({}, {}, [10, 50, 90]);

        expect(record.operation).toBe('CONFIDENCE_CALCULATION');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'confidence',
          confidenceLevels: [10, 50, 90],
        }));
      });
    });

    describe('recordArtifactAssembly', () => {
      it('should record artifact assembly with artifact ID', () => {
        const record = generator.recordArtifactAssembly({}, {}, 'artifact-123');

        expect(record.operation).toBe('ARTIFACT_ASSEMBLY');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'assembly',
          artifactId: 'artifact-123',
        }));
      });
    });

    describe('recordValidation', () => {
      it('should record validation with pass status', () => {
        const record = generator.recordValidation({}, { valid: true }, true);

        expect(record.operation).toBe('VALIDATION');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'validation',
          passed: true,
        }));
      });

      it('should record validation with fail status', () => {
        const record = generator.recordValidation({}, { valid: false, errors: [] }, false);

        expect(record.details).toEqual(expect.objectContaining({
          passed: false,
        }));
      });
    });

    describe('recordCustomOperation', () => {
      it('should record custom operation with details', () => {
        const record = generator.recordCustomOperation(
          'CUSTOM_OP',
          { input: 'data' },
          { output: 'result' },
          { customKey: 'customValue' }
        );

        expect(record.operation).toBe('CUSTOM_OP');
        expect(record.details).toEqual(expect.objectContaining({
          phase: 'custom',
          customKey: 'customValue',
        }));
      });
    });
  });

  describe('getAuditTrail', () => {
    it('should return empty array when no steps recorded', () => {
      const trail = generator.getAuditTrail();
      expect(trail).toEqual([]);
    });

    it('should return all recorded steps', () => {
      generator.recordIngestion('system', {}, {});
      generator.recordNormalization({}, {}, 5);
      generator.recordDeltaCalculation({}, {}, 'method');

      const trail = generator.getAuditTrail();
      expect(trail.length).toBe(3);
    });

    it('should return a copy of the records (immutable)', () => {
      generator.recordIngestion('system', {}, {});
      const trail1 = generator.getAuditTrail();
      const trail2 = generator.getAuditTrail();

      expect(trail1).not.toBe(trail2);
      expect(trail1).toEqual(trail2);
    });
  });

  describe('getStepCount', () => {
    it('should return 0 for empty generator', () => {
      expect(generator.getStepCount()).toBe(0);
    });

    it('should return correct count after recording steps', () => {
      generator.recordIngestion('system', {}, {});
      generator.recordNormalization({}, {}, 5);

      expect(generator.getStepCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all recorded steps', () => {
      generator.recordIngestion('system', {}, {});
      generator.recordNormalization({}, {}, 5);

      generator.reset();

      expect(generator.getStepCount()).toBe(0);
      expect(generator.getAuditTrail()).toEqual([]);
    });

    it('should reset step counter', () => {
      generator.recordIngestion('system', {}, {});
      generator.reset();

      const record = generator.recordIngestion('new_system', {}, {});
      expect(record.stepNumber).toBe(1);
    });
  });

  describe('computeTrailChecksum', () => {
    it('should compute checksum of entire trail', () => {
      generator.recordIngestion('system', {}, {});
      generator.recordNormalization({}, {}, 5);

      const checksum = generator.computeTrailChecksum();

      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different checksums for different trails', () => {
      generator.recordIngestion('system1', {}, {});
      const checksum1 = generator.computeTrailChecksum();

      generator.reset();
      generator.recordIngestion('system2', {}, {});
      const checksum2 = generator.computeTrailChecksum();

      expect(checksum1).not.toBe(checksum2);
    });

    it('should produce consistent checksums for same trail', () => {
      generator.recordIngestion('system', { key: 'value' }, { result: 'output' });

      const checksum1 = generator.computeTrailChecksum();
      const checksum2 = generator.computeTrailChecksum();

      expect(checksum1).toBe(checksum2);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return valid for properly sequenced trail', () => {
      generator.recordIngestion('system', {}, {});
      generator.recordNormalization({}, {}, 5);
      generator.recordDeltaCalculation({}, {}, 'method');

      const result = generator.verifyIntegrity();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid for empty trail', () => {
      const result = generator.verifyIntegrity();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate hash formats', () => {
      generator.recordIngestion('system', {}, {});
      const trail = generator.getAuditTrail();

      trail.forEach(record => {
        expect(record.inputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(record.outputHash).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('includeFullData option', () => {
    it('should include data summaries when enabled', () => {
      const generatorWithData = new AuditTrailGenerator({ includeFullData: true });

      const step: AuditStep = {
        operation: 'TEST',
        inputData: { items: [1, 2, 3, 4, 5] },
        outputData: { result: 'success' },
      };

      const record = generatorWithData.recordStep(step);

      expect(record.details).toEqual(expect.objectContaining({
        inputDataSummary: expect.any(Object),
        outputDataSummary: expect.any(Object),
      }));
    });

    it('should summarize arrays correctly', () => {
      const generatorWithData = new AuditTrailGenerator({ includeFullData: true });

      const step: AuditStep = {
        operation: 'TEST',
        inputData: [1, 2, 3, 4, 5],
        outputData: {},
      };

      const record = generatorWithData.recordStep(step);

      expect(record.details['inputDataSummary']).toEqual({
        type: 'array',
        length: 5,
        firstItem: 'number',
      });
    });

    it('should summarize objects correctly', () => {
      const generatorWithData = new AuditTrailGenerator({ includeFullData: true });

      const step: AuditStep = {
        operation: 'TEST',
        inputData: { a: 1, b: 2, c: 3 },
        outputData: {},
      };

      const record = generatorWithData.recordStep(step);

      expect(record.details['inputDataSummary']).toEqual({
        type: 'object',
        keyCount: 3,
        keys: expect.arrayContaining(['a', 'b', 'c']),
      });
    });
  });

  describe('maxDetailSize option', () => {
    it('should truncate details exceeding max size', () => {
      const generatorWithLimit = new AuditTrailGenerator({ maxDetailSize: 100 });

      const largeDetails: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeDetails[`key_${i}`] = `value_${i}_with_some_extra_content`;
      }

      const step: AuditStep = {
        operation: 'TEST',
        inputData: {},
        outputData: {},
        details: largeDetails,
      };

      const record = generatorWithLimit.recordStep(step);

      expect(record.details['_truncated']).toBe(true);
      expect(record.details['_originalSize']).toBeGreaterThan(100);
    });

    it('should not truncate details within max size', () => {
      const generatorWithLimit = new AuditTrailGenerator({ maxDetailSize: 10000 });

      const step: AuditStep = {
        operation: 'TEST',
        inputData: {},
        outputData: {},
        details: { key: 'value' },
      };

      const record = generatorWithLimit.recordStep(step);

      expect(record.details['_truncated']).toBeUndefined();
      expect(record.details['key']).toBe('value');
    });
  });

  describe('computeHash standalone function', () => {
    it('should compute SHA-256 hash of any data', () => {
      const hash = computeHash({ test: 'data' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const data = { key: 'value', nested: { prop: 123 } };

      const hash1 = computeHash(data);
      const hash2 = computeHash(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = computeHash({ a: 1 });
      const hash2 = computeHash({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });

    it('should handle strings directly', () => {
      const hash = computeHash('test string');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle null and undefined', () => {
      const hashNull = computeHash(null);
      const hashUndefined = computeHash(undefined);

      expect(hashNull).toMatch(/^[a-f0-9]{64}$/);
      expect(hashUndefined).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('audit trail completeness', () => {
    it('should maintain complete provenance chain', () => {
      // Simulate a complete processing flow
      generator.recordIngestion('simulation', { rawData: [] }, { parsed: [] });
      generator.recordNormalization({ parsed: [] }, { canonical: [] }, 10);
      generator.recordDeltaCalculation({ canonical: [] }, { deltas: [] }, 'standard');
      generator.recordRiskAdjustment({ deltas: [] }, { adjusted: [] }, { factor: 0.85 });
      generator.recordTimeValueAdjustment({ adjusted: [] }, { pv: [] }, 0.1, 12);
      generator.recordAttribution({ pv: [] }, { attributed: [] }, 'activity-based');
      generator.recordConfidenceCalculation({ attributed: [] }, { intervals: {} }, [10, 50, 90]);
      generator.recordArtifactAssembly({ all: 'inputs' }, { artifact: {} }, 'art-001');
      generator.recordValidation({ artifact: {} }, { valid: true }, true);

      const trail = generator.getAuditTrail();

      expect(trail.length).toBe(9);

      // Verify all steps are sequential
      trail.forEach((record, index) => {
        expect(record.stepNumber).toBe(index + 1);
      });

      // Verify all operations are tracked
      const operations = trail.map(r => r.operation);
      expect(operations).toContain('INGESTION');
      expect(operations).toContain('NORMALIZATION');
      expect(operations).toContain('DELTA_CALCULATION');
      expect(operations).toContain('RISK_ADJUSTMENT');
      expect(operations).toContain('TIME_VALUE_ADJUSTMENT');
      expect(operations).toContain('ATTRIBUTION');
      expect(operations).toContain('CONFIDENCE_CALCULATION');
      expect(operations).toContain('ARTIFACT_ASSEMBLY');
      expect(operations).toContain('VALIDATION');
    });

    it('should all records pass schema validation', () => {
      generator.recordIngestion('system', { data: 'input' }, { data: 'output' });
      generator.recordNormalization({ raw: [] }, { canonical: [] }, 5);
      generator.recordDeltaCalculation({}, {}, 'method');

      const trail = generator.getAuditTrail();

      trail.forEach(record => {
        const result = AuditRecordSchema.safeParse(record);
        expect(result.success).toBe(true);
      });
    });
  });
});
