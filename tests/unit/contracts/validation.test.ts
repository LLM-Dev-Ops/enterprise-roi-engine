/**
 * Contract Validation Tests
 * Verifies that contract enforcement is working correctly at the request boundary.
 */

import {
  ContractValidator,
  getContractValidator,
  resetContractValidator,
  ContractValidationException,
} from '../../../src/contracts/validation';

describe('ContractValidator', () => {
  let validator: ContractValidator;

  beforeEach(() => {
    resetContractValidator();
    validator = getContractValidator({
      platformId: 'test-platform',
      platformVersion: '1.0.0',
    });
  });

  describe('schema validation', () => {
    it('should reject request missing required fields', () => {
      const invalidRequest = {};
      const result = validator.validate(invalidRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.schemaId).toContain('roi/v1/request');
    });

    it('should reject request with invalid simulation metadata', () => {
      const invalidRequest = {
        simulation: {
          metadata: {
            simulationId: 'not-a-uuid',
            engineVersion: 'invalid',
            timestamp: 'not-a-date',
            checksum: 'too-short',
          },
          scenario: {
            name: 'Test',
            baselineId: '123e4567-e89b-12d3-a456-426614174000',
            timeHorizonMonths: 12,
            confidenceLevel: 0.9,
          },
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        },
        erpMetadata: {
          erpSystem: 'SAP',
          erpVersion: '1.0',
          extractTimestamp: '2024-01-01T00:00:00Z',
          entities: [],
          chartOfAccounts: [],
          costCenters: [],
          fiscalCalendar: [],
          reportingCurrency: 'USD',
        },
        costBaseline: {
          baselineId: '123e4567-e89b-12d3-a456-426614174000',
          snapshotTimestamp: '2024-01-01T00:00:00Z',
          costModelVersion: '1.0',
          laborRates: [],
          infrastructureCosts: [],
          licenseCosts: [],
          overheadFactors: [],
          riskWeights: [],
          discountRate: 0.1,
          baselinePeriod: 'FY2024',
        },
      };

      const result = validator.validate(invalidRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('simulationId'))).toBe(true);
    });

    it('should accept valid complete request', () => {
      const validRequest = {
        simulation: {
          metadata: {
            simulationId: '123e4567-e89b-12d3-a456-426614174000',
            engineVersion: '1.0.0',
            timestamp: '2024-01-01T00:00:00Z',
            checksum: 'a'.repeat(64),
          },
          scenario: {
            name: 'Test Scenario',
            baselineId: '123e4567-e89b-12d3-a456-426614174000',
            timeHorizonMonths: 12,
            confidenceLevel: 0.9,
          },
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        },
        erpMetadata: {
          erpSystem: 'SAP',
          erpVersion: '1.0',
          extractTimestamp: '2024-01-01T00:00:00Z',
          entities: [],
          chartOfAccounts: [],
          costCenters: [],
          fiscalCalendar: [],
          reportingCurrency: 'USD',
        },
        costBaseline: {
          baselineId: '123e4567-e89b-12d3-a456-426614174000',
          snapshotTimestamp: '2024-01-01T00:00:00Z',
          costModelVersion: '1.0',
          laborRates: [],
          infrastructureCosts: [],
          licenseCosts: [],
          overheadFactors: [],
          riskWeights: [],
          discountRate: 0.1,
          baselinePeriod: 'FY2024',
        },
      };

      const result = validator.validate(validRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject additional properties in strict mode', () => {
      const requestWithExtra = {
        simulation: {
          metadata: {
            simulationId: '123e4567-e89b-12d3-a456-426614174000',
            engineVersion: '1.0.0',
            timestamp: '2024-01-01T00:00:00Z',
            checksum: 'a'.repeat(64),
            extraField: 'not allowed',
          },
          scenario: {
            name: 'Test',
            baselineId: '123e4567-e89b-12d3-a456-426614174000',
            timeHorizonMonths: 12,
            confidenceLevel: 0.9,
          },
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        },
        erpMetadata: {
          erpSystem: 'SAP',
          erpVersion: '1.0',
          extractTimestamp: '2024-01-01T00:00:00Z',
          entities: [],
          chartOfAccounts: [],
          costCenters: [],
          fiscalCalendar: [],
          reportingCurrency: 'USD',
        },
        costBaseline: {
          baselineId: '123e4567-e89b-12d3-a456-426614174000',
          snapshotTimestamp: '2024-01-01T00:00:00Z',
          costModelVersion: '1.0',
          laborRates: [],
          infrastructureCosts: [],
          licenseCosts: [],
          overheadFactors: [],
          riskWeights: [],
          discountRate: 0.1,
          baselinePeriod: 'FY2024',
        },
      };

      const result = validator.validate(requestWithExtra);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'additionalProperties')).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('should throw ContractValidationException for invalid data', () => {
      expect(() => validator.validateOrThrow({})).toThrow(ContractValidationException);
    });

    it('should not throw for valid data', () => {
      const validRequest = {
        simulation: {
          metadata: {
            simulationId: '123e4567-e89b-12d3-a456-426614174000',
            engineVersion: '1.0.0',
            timestamp: '2024-01-01T00:00:00Z',
            checksum: 'a'.repeat(64),
          },
          scenario: {
            name: 'Test',
            baselineId: '123e4567-e89b-12d3-a456-426614174000',
            timeHorizonMonths: 12,
            confidenceLevel: 0.9,
          },
          decisions: [],
          resourceDeltas: [],
          workflowTraces: [],
          confidenceIntervals: [],
        },
        erpMetadata: {
          erpSystem: 'SAP',
          erpVersion: '1.0',
          extractTimestamp: '2024-01-01T00:00:00Z',
          entities: [],
          chartOfAccounts: [],
          costCenters: [],
          fiscalCalendar: [],
          reportingCurrency: 'USD',
        },
        costBaseline: {
          baselineId: '123e4567-e89b-12d3-a456-426614174000',
          snapshotTimestamp: '2024-01-01T00:00:00Z',
          costModelVersion: '1.0',
          laborRates: [],
          infrastructureCosts: [],
          licenseCosts: [],
          overheadFactors: [],
          riskWeights: [],
          discountRate: 0.1,
          baselinePeriod: 'FY2024',
        },
      };

      expect(() => validator.validateOrThrow(validRequest)).not.toThrow();
    });
  });

  describe('execution proof', () => {
    it('should create execution proof with platform information', () => {
      const input = { test: 'data' };
      const proof = validator.createExecutionProof(input, 10);

      expect(proof.platformId).toBe('test-platform');
      expect(proof.platformVersion).toBe('1.0.0');
      expect(proof.contractSchemaId).toContain('roi/v1/request');
      expect(proof.inputHash).toHaveLength(64);
      expect(proof.signature).toHaveLength(64);
      expect(proof.validationDurationMs).toBe(10);
    });

    it('should finalize execution proof with output hash', () => {
      const input = { test: 'input' };
      const output = { test: 'output' };
      const initialProof = validator.createExecutionProof(input, 10);
      const finalProof = validator.finalizeExecutionProof(initialProof, output, 100);

      expect(finalProof.outputHash).toHaveLength(64);
      expect(finalProof.executionDurationMs).toBe(100);
      expect(finalProof.inputHash).toBe(initialProof.inputHash);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      resetContractValidator();
      const first = getContractValidator();
      const second = getContractValidator();

      expect(first).toBe(second);
    });

    it('should reset instance correctly', () => {
      resetContractValidator();
      const first = getContractValidator({ platformId: 'first' });
      resetContractValidator();
      const second = getContractValidator({ platformId: 'second' });

      expect(first).not.toBe(second);
    });
  });
});
