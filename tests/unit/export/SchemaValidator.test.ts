/**
 * Unit Tests for SchemaValidator
 * Tests schema validation for financial artifacts, including valid and invalid cases.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SchemaValidator,
  SchemaValidatorOptions,
  ValidationResult,
  SchemaValidationError,
  createSchemaValidator,
} from '../../../src/export/SchemaValidator';
import {
  FinancialArtifact,
  FinancialSummary,
  InputManifest,
  PeriodDetail,
  AttributionRecord,
  SensitivityTable,
  AuditRecord,
  GovernancePayload,
} from '../../../src/contracts/artifacts';
import { ArtifactBundle, ArtifactType } from '../../../src/contracts/internal';

// ============================================================================
// Mock Data Factory Functions
// ============================================================================

function createValidChecksum(): string {
  return 'a'.repeat(64);
}

function createValidMonetaryValue() {
  return {
    amount: '1000.0000',
    currency: 'USD',
    asOfDate: new Date().toISOString(),
  };
}

function createValidConfidenceInterval() {
  return {
    confidenceLevel: 90,
    lowerBound: '800.00',
    upperBound: '1200.00',
    margin: '200.00',
  };
}

function createValidFinancialSummary(): FinancialSummary {
  return {
    totalInvestment: createValidMonetaryValue(),
    totalBenefit: { ...createValidMonetaryValue(), amount: '5000.0000' },
    netBenefit: { ...createValidMonetaryValue(), amount: '4000.0000' },
    roi: 0.8,
    roiMethodology: 'Net Present Value / Total Investment',
    paybackPeriodMonths: 6,
    npv: { ...createValidMonetaryValue(), amount: '3800.0000' },
    discountRate: 0.1,
    irr: 0.25,
    confidenceInterval: createValidConfidenceInterval(),
  };
}

function createValidInputManifest(): InputManifest {
  return {
    simulationId: uuidv4(),
    simulationChecksum: createValidChecksum(),
    erpMetadataChecksum: 'b'.repeat(64),
    costBaselineId: uuidv4(),
    costBaselineChecksum: 'c'.repeat(64),
    calculationParameters: {
      discountRate: 0.1,
      confidenceLevels: [10, 50, 90],
      timeHorizonMonths: 12,
      baseCurrency: 'USD',
      riskToleranceLevel: 'MODERATE',
    },
  };
}

function createValidPeriodDetail(periodNumber: number = 1): PeriodDetail {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() + periodNumber - 1);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);

  return {
    periodNumber,
    periodStart: startDate.toISOString(),
    periodEnd: endDate.toISOString(),
    projectedSavings: createValidMonetaryValue(),
    projectedCosts: { ...createValidMonetaryValue(), amount: '200.0000' },
    netDelta: { ...createValidMonetaryValue(), amount: '800.0000' },
    cumulativeNetDelta: { ...createValidMonetaryValue(), amount: (800 * periodNumber).toFixed(4) },
    discountFactor: Math.pow(0.99, periodNumber),
    presentValue: { ...createValidMonetaryValue(), amount: (800 * Math.pow(0.99, periodNumber)).toFixed(4) },
  };
}

function createValidAttributionRecord(): AttributionRecord {
  return {
    decisionId: uuidv4(),
    costCenterId: 'CC-001',
    costCenterName: 'Engineering',
    glAccountId: 'GL-5000',
    glAccountName: 'Operating Expenses',
    attributedAmount: createValidMonetaryValue(),
    allocationPercentage: 0.75,
    attributionMethod: 'activity-based',
  };
}

function createValidSensitivityTable(): SensitivityTable {
  return {
    factors: [
      {
        factorName: 'Discount Rate',
        baseValue: 0.1,
        lowValue: 0.08,
        highValue: 0.12,
        impactOnNPV: createValidMonetaryValue(),
        elasticity: -0.3,
      },
      {
        factorName: 'Time Horizon',
        baseValue: 12,
        lowValue: 9,
        highValue: 15,
        impactOnNPV: { ...createValidMonetaryValue(), amount: '500.0000' },
        elasticity: 0.4,
      },
    ],
    tornadoOrder: ['Discount Rate', 'Time Horizon'],
  };
}

function createValidAuditRecord(stepNumber: number = 1): AuditRecord {
  return {
    stepNumber,
    timestamp: new Date().toISOString(),
    operation: 'INGESTION',
    inputHash: createValidChecksum(),
    outputHash: 'b'.repeat(64),
    details: { phase: 'ingestion' },
  };
}

function createValidFinancialArtifact(): FinancialArtifact {
  return {
    artifactId: uuidv4(),
    generatedAt: new Date().toISOString(),
    engineVersion: '1.0.0',
    inputManifest: createValidInputManifest(),
    summary: createValidFinancialSummary(),
    periodDetails: [createValidPeriodDetail(1), createValidPeriodDetail(2), createValidPeriodDetail(3)],
    attributions: [createValidAttributionRecord()],
    sensitivityAnalysis: createValidSensitivityTable(),
    auditTrail: [createValidAuditRecord(1), createValidAuditRecord(2)],
    humanReadableSummary: 'This decision would save $1,000 per year',
  };
}

function createValidGovernancePayload(): GovernancePayload {
  return {
    artifactId: uuidv4(),
    approvalRequired: true,
    thresholdBreaches: [
      {
        thresholdName: 'Max Single Investment',
        thresholdValue: 50000,
        actualValue: 75000,
        severity: 'HIGH',
      },
    ],
    complianceFlags: [
      {
        flagId: 'FLAG-001',
        flagName: 'Budget Variance',
        description: 'Investment exceeds approved budget',
        requiresReview: true,
      },
    ],
    attestationRequirements: ['CFO Approval', 'Finance Committee Review'],
    riskLevel: 'HIGH',
  };
}

function createValidArtifactBundle(): ArtifactBundle {
  const artifact = createValidFinancialArtifact();
  return {
    bundleId: uuidv4(),
    artifacts: [
      {
        artifactType: ArtifactType.FINANCIAL_ARTIFACT,
        content: artifact,
        format: 'JSON',
        schemaVersion: '1.0.0',
      },
    ],
    generationTimestamp: new Date().toISOString(),
    sourceSimulationId: uuidv4(),
    schemaVersion: '1.0.0',
    checksum: createValidChecksum(),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(validator).toBeInstanceOf(SchemaValidator);
    });

    it('should create an instance with custom options', () => {
      const options: SchemaValidatorOptions = {
        strictMode: false,
        validateChecksums: false,
        warnOnMissingOptionals: true,
      };
      const customValidator = new SchemaValidator(options);
      expect(customValidator).toBeInstanceOf(SchemaValidator);
    });
  });

  describe('createSchemaValidator factory', () => {
    it('should create a new SchemaValidator instance', () => {
      const newValidator = createSchemaValidator();
      expect(newValidator).toBeInstanceOf(SchemaValidator);
    });

    it('should accept options', () => {
      const newValidator = createSchemaValidator({ strictMode: false });
      expect(newValidator).toBeInstanceOf(SchemaValidator);
    });
  });

  describe('validateFinancialArtifact', () => {
    it('should validate a correct financial artifact', () => {
      const artifact = createValidFinancialArtifact();
      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject artifact with invalid UUID', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).artifactId = 'not-a-uuid';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_string')).toBe(true);
    });

    it('should reject artifact with invalid timestamp', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).generatedAt = 'not-a-timestamp';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
    });

    it('should reject artifact with empty human readable summary', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).humanReadableSummary = '   ';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'empty_string')).toBe(true);
    });

    it('should reject artifact with invalid checksum format', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).inputManifest.simulationChecksum = 'invalid-checksum';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_checksum')).toBe(true);
    });

    it('should warn on non-semver engine version', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).engineVersion = 'version-one';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.warnings.some(w => w.path === 'engineVersion')).toBe(true);
    });

    it('should validate period sequence', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).periodDetails[1].periodNumber = 5; // Out of sequence

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_sequence')).toBe(true);
    });

    it('should validate audit trail sequence', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).auditTrail[1].stepNumber = 10; // Out of sequence

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_sequence')).toBe(true);
    });

    it('should warn on empty period details', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).periodDetails = [];

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.warnings.some(w => w.path === 'periodDetails')).toBe(true);
    });

    it('should warn on empty attributions', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).attributions = [];

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.warnings.some(w => w.path === 'attributions')).toBe(true);
    });

    it('should warn on empty audit trail', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).auditTrail = [];

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.warnings.some(w => w.path === 'auditTrail')).toBe(true);
    });
  });

  describe('validateFinancialSummary', () => {
    it('should validate a correct financial summary', () => {
      const summary = createValidFinancialSummary();
      const result = validator.validateFinancialSummary(summary);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject summary with invalid monetary value format', () => {
      const summary = createValidFinancialSummary();
      (summary as any).totalInvestment.amount = 'not-a-number';

      const result = validator.validateFinancialSummary(summary);

      expect(result.valid).toBe(false);
    });

    it('should reject summary with invalid confidence interval bounds', () => {
      const summary = createValidFinancialSummary();
      (summary as any).confidenceInterval.lowerBound = '2000.00';
      (summary as any).confidenceInterval.upperBound = '1000.00';

      const result = validator.validateFinancialSummary(summary);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_bounds')).toBe(true);
    });

    it('should warn on inconsistent ROI calculation', () => {
      const summary = createValidFinancialSummary();
      (summary as any).roi = 5.0; // Inconsistent with netBenefit / totalInvestment

      const result = validator.validateFinancialSummary(summary);

      expect(result.warnings.some(w => w.path === 'summary.roi')).toBe(true);
    });
  });

  describe('validateInputManifest', () => {
    it('should validate a correct input manifest', () => {
      const manifest = createValidInputManifest();
      const result = validator.validateInputManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest with invalid simulation UUID', () => {
      const manifest = createValidInputManifest();
      (manifest as any).simulationId = 'not-a-uuid';

      const result = validator.validateInputManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should reject manifest with invalid checksum format', () => {
      const manifest = createValidInputManifest();
      (manifest as any).simulationChecksum = 'short';

      const result = validator.validateInputManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should reject manifest with invalid currency code', () => {
      const manifest = createValidInputManifest();
      (manifest as any).calculationParameters.baseCurrency = 'INVALID';

      const result = validator.validateInputManifest(manifest);

      expect(result.valid).toBe(false);
    });

    it('should reject manifest with invalid discount rate', () => {
      const manifest = createValidInputManifest();
      (manifest as any).calculationParameters.discountRate = 1.5; // > 1

      const result = validator.validateInputManifest(manifest);

      expect(result.valid).toBe(false);
    });
  });

  describe('validatePeriodDetail', () => {
    it('should validate a correct period detail', () => {
      const period = createValidPeriodDetail();
      const result = validator.validatePeriodDetail(period);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject period with invalid period number', () => {
      const period = createValidPeriodDetail();
      (period as any).periodNumber = 0;

      const result = validator.validatePeriodDetail(period);

      expect(result.valid).toBe(false);
    });

    it('should reject period with invalid discount factor', () => {
      const period = createValidPeriodDetail();
      (period as any).discountFactor = 1.5; // > 1

      const result = validator.validatePeriodDetail(period);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateAttributionRecord', () => {
    it('should validate a correct attribution record', () => {
      const attribution = createValidAttributionRecord();
      const result = validator.validateAttributionRecord(attribution);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject attribution with invalid decision UUID', () => {
      const attribution = createValidAttributionRecord();
      (attribution as any).decisionId = 'not-a-uuid';

      const result = validator.validateAttributionRecord(attribution);

      expect(result.valid).toBe(false);
    });

    it('should reject attribution with allocation percentage out of range', () => {
      const attribution = createValidAttributionRecord();
      (attribution as any).allocationPercentage = 1.5; // > 1

      const result = validator.validateAttributionRecord(attribution);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_range')).toBe(true);
    });

    it('should reject attribution with negative allocation percentage', () => {
      const attribution = createValidAttributionRecord();
      (attribution as any).allocationPercentage = -0.5;

      const result = validator.validateAttributionRecord(attribution);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateSensitivityTable', () => {
    it('should validate a correct sensitivity table', () => {
      const table = createValidSensitivityTable();
      const result = validator.validateSensitivityTable(table);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject table with tornado order referencing non-existent factor', () => {
      const table = createValidSensitivityTable();
      (table as any).tornadoOrder = ['Discount Rate', 'Nonexistent Factor'];

      const result = validator.validateSensitivityTable(table);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'missing_factor')).toBe(true);
    });
  });

  describe('validateAuditRecord', () => {
    it('should validate a correct audit record', () => {
      const record = createValidAuditRecord();
      const result = validator.validateAuditRecord(record);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject record with invalid step number', () => {
      const record = createValidAuditRecord();
      (record as any).stepNumber = 0;

      const result = validator.validateAuditRecord(record);

      expect(result.valid).toBe(false);
    });

    it('should reject record with invalid input hash format', () => {
      const record = createValidAuditRecord();
      (record as any).inputHash = 'invalid-hash';

      const result = validator.validateAuditRecord(record);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_hash')).toBe(true);
    });

    it('should reject record with invalid output hash format', () => {
      const record = createValidAuditRecord();
      (record as any).outputHash = 'too-short';

      const result = validator.validateAuditRecord(record);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateGovernancePayload', () => {
    it('should validate a correct governance payload', () => {
      const payload = createValidGovernancePayload();
      const result = validator.validateGovernancePayload(payload);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject payload with invalid artifact UUID', () => {
      const payload = createValidGovernancePayload();
      (payload as any).artifactId = 'not-a-uuid';

      const result = validator.validateGovernancePayload(payload);

      expect(result.valid).toBe(false);
    });

    it('should reject payload with invalid risk level', () => {
      const payload = createValidGovernancePayload();
      (payload as any).riskLevel = 'UNKNOWN';

      const result = validator.validateGovernancePayload(payload);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateArtifactBundle', () => {
    it('should validate a correct artifact bundle', () => {
      const bundle = createValidArtifactBundle();
      const result = validator.validateArtifactBundle(bundle);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject bundle with invalid bundle UUID', () => {
      const bundle = createValidArtifactBundle();
      (bundle as any).bundleId = 'not-a-uuid';

      const result = validator.validateArtifactBundle(bundle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_uuid')).toBe(true);
    });

    it('should reject bundle with invalid timestamp', () => {
      const bundle = createValidArtifactBundle();
      (bundle as any).generationTimestamp = 'not-a-timestamp';

      const result = validator.validateArtifactBundle(bundle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_timestamp')).toBe(true);
    });

    it('should reject bundle with invalid checksum', () => {
      const bundle = createValidArtifactBundle();
      (bundle as any).checksum = 'invalid';

      const result = validator.validateArtifactBundle(bundle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_checksum')).toBe(true);
    });

    it('should validate nested financial artifacts', () => {
      const bundle = createValidArtifactBundle();
      (bundle.artifacts[0]!.content as any).artifactId = 'not-a-uuid';

      const result = validator.validateArtifactBundle(bundle);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('bundle.artifacts[0]'))).toBe(true);
    });

    it('should reject non-object bundle', () => {
      const result = validator.validateArtifactBundle(null);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_type')).toBe(true);
    });
  });

  describe('options behavior', () => {
    describe('validateChecksums option', () => {
      it('should skip checksum validation when disabled', () => {
        const validatorNoChecksums = new SchemaValidator({ validateChecksums: false });
        const artifact = createValidFinancialArtifact();
        (artifact as any).inputManifest.simulationChecksum = 'invalid';

        const result = validatorNoChecksums.validateFinancialArtifact(artifact);

        // Should only have Zod validation error for length, not custom checksum error
        expect(result.errors.every(e => e.code !== 'invalid_checksum')).toBe(true);
      });
    });
  });

  describe('SchemaValidationError', () => {
    it('should create error with validation result', () => {
      const validationResult: ValidationResult = {
        valid: false,
        errors: [
          { path: 'test.path', message: 'Test error', code: 'test_error' },
        ],
        warnings: [
          { path: 'test.warning', message: 'Test warning', severity: 'LOW' as const },
        ],
      };

      const error = new SchemaValidationError(validationResult);

      expect(error.name).toBe('SchemaValidationError');
      expect(error.message).toContain('test.path');
      expect(error.message).toContain('Test error');
      expect(error.errors).toEqual(validationResult.errors);
      expect(error.warnings).toEqual(validationResult.warnings);
    });
  });

  describe('validation error details', () => {
    it('should include path in error', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).summary.totalInvestment.amount = 'invalid';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('summary'))).toBe(true);
    });

    it('should include expected and received in type errors', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).summary.roi = 'not-a-number';

      const result = validator.validateFinancialArtifact(artifact);

      expect(result.valid).toBe(false);
      // Zod type errors include expected/received
      const typeError = result.errors.find(e => e.path.includes('roi'));
      expect(typeError).toBeDefined();
    });
  });

  describe('warning severity levels', () => {
    it('should classify empty audit trail as HIGH severity', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).auditTrail = [];

      const result = validator.validateFinancialArtifact(artifact);

      const auditWarning = result.warnings.find(w => w.path === 'auditTrail');
      expect(auditWarning?.severity).toBe('HIGH');
    });

    it('should classify empty period details as MEDIUM severity', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).periodDetails = [];

      const result = validator.validateFinancialArtifact(artifact);

      const periodWarning = result.warnings.find(w => w.path === 'periodDetails');
      expect(periodWarning?.severity).toBe('MEDIUM');
    });

    it('should classify non-semver version as LOW severity', () => {
      const artifact = createValidFinancialArtifact();
      (artifact as any).engineVersion = 'v1';

      const result = validator.validateFinancialArtifact(artifact);

      const versionWarning = result.warnings.find(w => w.path === 'engineVersion');
      expect(versionWarning?.severity).toBe('LOW');
    });
  });
});
