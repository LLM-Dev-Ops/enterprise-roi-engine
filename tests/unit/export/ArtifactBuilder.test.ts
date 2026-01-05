/**
 * Unit Tests for ArtifactBuilder
 * Tests financial artifact construction with valid inputs, checksums, and schema validation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ArtifactBuilder,
  ArtifactBuilderConfig,
  createArtifactBuilder,
} from '../../../src/export/ArtifactBuilder';
import {
  FinancialDeltaResult,
  AttributionResult,
  NormalizedDataset,
  CanonicalDecisionRecord,
  FinancialDelta,
  AttributionChain,
  PortfolioMetrics,
} from '../../../src/contracts/internal';
import {
  DecisionCategory,
  AllocationMethod,
  ImpactType,
} from '../../../src/contracts/common';
import {
  FinancialArtifactSchema,
  FinancialSummarySchema,
  InputManifestSchema,
  PeriodDetailSchema,
  AttributionRecordSchema,
  SensitivityTableSchema,
  AuditRecord,
} from '../../../src/contracts/artifacts';


// ============================================================================
// Mock Data Factory Functions
// ============================================================================

function createMockConfig(): ArtifactBuilderConfig {
  return {
    engineVersion: '1.0.0',
    baseCurrency: 'USD',
    discountRate: 0.1,
    confidenceLevels: [10, 50, 90],
    timeHorizonMonths: 12,
    riskToleranceLevel: 'MODERATE',
  };
}

function createMockDecision(): CanonicalDecisionRecord {
  const now = new Date().toISOString();
  return {
    recordId: uuidv4(),
    sourceDecisionId: uuidv4(),
    decisionTimestamp: now,
    decisionCategory: DecisionCategory.COST_REDUCTION,
    primaryCostCenterId: 'CC-001',
    secondaryCostCenters: [
      {
        costCenterId: 'CC-002',
        allocationPercentage: 25,
        allocationMethod: AllocationMethod.ACTIVITY_BASED,
      },
    ],
    glAccountImpacts: [
      {
        glAccountId: 'GL-5000',
        impactType: ImpactType.CREDIT,
        amount: '10000.00',
        period: {
          year: 2025,
          period: 1,
          startDate: now,
          endDate: now,
        },
      },
    ],
    grossImpactAmount: '10000.00',
    confidenceScore: 0.85,
    impactHorizonMonths: 12,
    riskCategoryId: 'RISK-001',
    volatilityScore: 0.2,
    sourceSystem: 'simulation',
    normalizationTimestamp: now,
    rawChecksum: 'a'.repeat(64),
  };
}

function createMockNormalizedDataset(): NormalizedDataset {
  return {
    normalizationId: uuidv4(),
    decisions: [createMockDecision()],
    recordCount: 1,
    normalizationTimestamp: new Date().toISOString(),
    baseCurrency: 'USD',
    inputChecksums: {
      simulationChecksum: 'a'.repeat(64),
      erpMetadataChecksum: 'b'.repeat(64),
      costBaselineChecksum: 'c'.repeat(64),
    },
  };
}

function createMockFinancialDelta(): FinancialDelta {
  const now = new Date().toISOString();
  return {
    decisionRecordId: uuidv4(),
    grossDelta: {
      decisionRecordId: uuidv4(),
      totalSavings: '12000.00',
      totalCosts: '2000.00',
      netDelta: '10000.00',
      savingsToCostRatio: 6.0,
    },
    riskAdjustedDelta: {
      decisionRecordId: uuidv4(),
      grossNetDelta: '10000.00',
      adjustedSavings: '10200.00',
      adjustedCosts: '2040.00',
      adjustedNetDelta: '8160.00',
      riskFactor: 0.85,
      riskComponents: {
        baseWeight: 0.9,
        confidenceFactor: 0.95,
        volatilityAdjustment: 0.99,
      },
      riskCategory: 'MODERATE',
    },
    timeAdjustedDelta: {
      decisionRecordId: uuidv4(),
      undiscountedDelta: '8160.00',
      presentValue: '7500.00',
      discountFactor: 0.9191,
      horizonMonths: 12,
      monthlyDiscountRate: 0.00833,
      annualizedValue: '7500.00',
    },
    confidenceIntervals: {
      baseValue: '7500.00',
      intervals: new Map([
        [90, { confidenceLevel: 90, lowerBound: '6000.00', upperBound: '9000.00', margin: '1500.00' }],
      ]),
      p10Value: '6000.00',
      p50Value: '7500.00',
      p90Value: '9000.00',
      uncertaintyFactor: 0.2,
    },
    deltaType: 'SAVINGS',
    calculationTimestamp: now,
  };
}

function createMockPortfolioMetrics(): PortfolioMetrics {
  return {
    totalGrossSavings: '12000.00',
    totalRiskAdjustedSavings: '10200.00',
    totalPresentValue: '7500.00',
    averageRiskAdjustmentFactor: 0.85,
    averageDiscountFactor: 0.9191,
    weightedUncertaintyFactor: 0.2,
    decisionCount: 1,
    positiveNPVCount: 1,
    calculationTimestamp: new Date().toISOString(),
  };
}

function createMockDeltaResult(): FinancialDeltaResult {
  return {
    calculationId: uuidv4(),
    deltas: [createMockFinancialDelta()],
    portfolioMetrics: createMockPortfolioMetrics(),
    timestamp: new Date().toISOString(),
  };
}

function createMockAttributionChain(): AttributionChain {
  const now = new Date().toISOString();
  const decisionId = uuidv4();
  return {
    decisionRecordId: decisionId,
    primaryAttribution: {
      decisionRecordId: decisionId,
      costCenterId: 'CC-001',
      costCenterName: 'Engineering',
      costCenterLevel: 1,
      attributedAmount: '7500.00',
      fiscalPeriod: {
        year: 2025,
        period: 1,
        startDate: now,
        endDate: now,
      },
      attributionBasis: 'Direct GL:5000 allocation',
      originalAmount: '10000.00',
      adjustmentFactor: 0.75,
    },
    overheadAttribution: {
      decisionRecordId: decisionId,
      costCenterId: 'CC-001',
      directAmount: '7500.00',
      indirectOverhead: '500.00',
      sharedServicesOverhead: '250.00',
      totalOverhead: '750.00',
      fullyLoadedAmount: '8250.00',
      overheadRateVersion: '2025-01',
    },
    distributedAttributions: [
      {
        costCenterId: 'CC-002',
        amount: '1875.00',
        allocationPercentage: 25,
        allocationType: 'SECONDARY',
        allocationMethod: AllocationMethod.ACTIVITY_BASED,
      },
    ],
    totalAttributedAmount: '7500.00',
    attributionMethod: 'activity-based',
    attributionTimestamp: now,
  };
}

function createMockAttributionResult(): AttributionResult {
  return {
    attributionId: uuidv4(),
    attributionChains: [createMockAttributionChain()],
    costCenterSummaries: new Map([
      ['CC-001', { costCenterId: 'CC-001', totalSavings: '7500.00', totalCosts: '2000.00', decisionCount: 1 }],
    ]),
    glAccountSummaries: new Map([
      ['GL-5000', { glAccountId: 'GL-5000', totalDebits: '0.00', totalCredits: '10000.00', netAmount: '10000.00' }],
    ]),
    totalAttributedValue: '7500.00',
    timestamp: new Date().toISOString(),
  };
}

function createMockAuditTrail(): AuditRecord[] {
  const now = new Date().toISOString();
  return [
    {
      stepNumber: 1,
      timestamp: now,
      operation: 'INGESTION',
      inputHash: 'a'.repeat(64),
      outputHash: 'b'.repeat(64),
      details: { phase: 'ingestion' },
    },
    {
      stepNumber: 2,
      timestamp: now,
      operation: 'NORMALIZATION',
      inputHash: 'b'.repeat(64),
      outputHash: 'c'.repeat(64),
      details: { phase: 'normalization' },
    },
    {
      stepNumber: 3,
      timestamp: now,
      operation: 'DELTA_CALCULATION',
      inputHash: 'c'.repeat(64),
      outputHash: 'd'.repeat(64),
      details: { phase: 'calculation' },
    },
  ];
}

// ============================================================================
// Test Suites
// ============================================================================

describe('ArtifactBuilder', () => {
  let config: ArtifactBuilderConfig;
  let builder: ArtifactBuilder;

  beforeEach(() => {
    config = createMockConfig();
    builder = new ArtifactBuilder(config);
  });

  describe('constructor', () => {
    it('should create an instance with the provided configuration', () => {
      expect(builder).toBeInstanceOf(ArtifactBuilder);
    });

    it('should accept custom configuration values', () => {
      const customConfig: ArtifactBuilderConfig = {
        engineVersion: '2.0.0',
        baseCurrency: 'EUR',
        discountRate: 0.08,
        confidenceLevels: [5, 50, 95],
        timeHorizonMonths: 24,
        riskToleranceLevel: 'CONSERVATIVE',
      };
      const customBuilder = new ArtifactBuilder(customConfig);
      expect(customBuilder).toBeInstanceOf(ArtifactBuilder);
    });
  });

  describe('createArtifactBuilder factory', () => {
    it('should create a new ArtifactBuilder instance', () => {
      const newBuilder = createArtifactBuilder(config);
      expect(newBuilder).toBeInstanceOf(ArtifactBuilder);
    });
  });

  describe('buildFinancialArtifact', () => {
    it('should build a complete financial artifact with all required fields', () => {
      const deltaResult = createMockDeltaResult();
      const attributionResult = createMockAttributionResult();
      const normalizedDataset = createMockNormalizedDataset();
      const auditTrail = createMockAuditTrail();
      const humanReadableSummary = 'This decision would save $7,500 per year';

      const artifact = builder.buildFinancialArtifact(
        deltaResult,
        attributionResult,
        normalizedDataset,
        auditTrail,
        humanReadableSummary
      );

      expect(artifact.artifactId).toBeDefined();
      expect(artifact.generatedAt).toBeDefined();
      expect(artifact.engineVersion).toBe('1.0.0');
      expect(artifact.inputManifest).toBeDefined();
      expect(artifact.summary).toBeDefined();
      expect(artifact.periodDetails).toBeDefined();
      expect(artifact.attributions).toBeDefined();
      expect(artifact.sensitivityAnalysis).toBeDefined();
      expect(artifact.auditTrail).toEqual(auditTrail);
      expect(artifact.humanReadableSummary).toBe(humanReadableSummary);
    });

    it('should generate a valid UUID for artifactId', () => {
      const artifact = builder.buildFinancialArtifact(
        createMockDeltaResult(),
        createMockAttributionResult(),
        createMockNormalizedDataset(),
        createMockAuditTrail(),
        'Summary'
      );

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(artifact.artifactId).toMatch(uuidRegex);
    });

    it('should generate a valid ISO8601 timestamp for generatedAt', () => {
      const artifact = builder.buildFinancialArtifact(
        createMockDeltaResult(),
        createMockAttributionResult(),
        createMockNormalizedDataset(),
        createMockAuditTrail(),
        'Summary'
      );

      const date = new Date(artifact.generatedAt);
      expect(date.toString()).not.toBe('Invalid Date');
      expect(artifact.generatedAt).toContain('T');
    });

    it('should produce an artifact that passes schema validation', () => {
      const artifact = builder.buildFinancialArtifact(
        createMockDeltaResult(),
        createMockAttributionResult(),
        createMockNormalizedDataset(),
        createMockAuditTrail(),
        'This decision would save $7,500 per year'
      );

      const result = FinancialArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(true);
    });
  });

  describe('buildInputManifest', () => {
    it('should build input manifest with correct checksums', () => {
      const normalizedDataset = createMockNormalizedDataset();
      const manifest = builder.buildInputManifest(normalizedDataset);

      expect(manifest.simulationChecksum).toBe('a'.repeat(64));
      expect(manifest.erpMetadataChecksum).toBe('b'.repeat(64));
      expect(manifest.costBaselineChecksum).toBe('c'.repeat(64));
    });

    it('should include calculation parameters', () => {
      const normalizedDataset = createMockNormalizedDataset();
      const manifest = builder.buildInputManifest(normalizedDataset);

      expect(manifest.calculationParameters.discountRate).toBe(0.1);
      expect(manifest.calculationParameters.baseCurrency).toBe('USD');
      expect(manifest.calculationParameters.timeHorizonMonths).toBe(12);
      expect(manifest.calculationParameters.riskToleranceLevel).toBe('MODERATE');
      expect(manifest.calculationParameters.confidenceLevels).toEqual([10, 50, 90]);
    });

    it('should use first decision sourceDecisionId as simulationId', () => {
      const normalizedDataset = createMockNormalizedDataset();
      const manifest = builder.buildInputManifest(normalizedDataset);

      expect(manifest.simulationId).toBe(normalizedDataset.decisions[0]!.sourceDecisionId);
    });

    it('should pass schema validation', () => {
      const normalizedDataset = createMockNormalizedDataset();
      const manifest = builder.buildInputManifest(normalizedDataset);

      const result = InputManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });
  });

  describe('buildFinancialSummary', () => {
    it('should calculate total investment from delta costs', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.totalInvestment).toBeDefined();
      expect(summary.totalInvestment.currency).toBe('USD');
    });

    it('should calculate total benefit from gross savings', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.totalBenefit).toBeDefined();
      expect(summary.totalBenefit.amount).toBe('12000.0000');
    });

    it('should calculate ROI correctly', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.roi).toBeDefined();
      expect(typeof summary.roi).toBe('number');
    });

    it('should include NPV and discount rate', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.npv).toBeDefined();
      expect(summary.discountRate).toBe(0.1);
    });

    it('should include confidence interval', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.confidenceInterval).toBeDefined();
      expect(summary.confidenceInterval.confidenceLevel).toBe(90);
      expect(summary.confidenceInterval.lowerBound).toBeDefined();
      expect(summary.confidenceInterval.upperBound).toBeDefined();
    });

    it('should pass schema validation', () => {
      const deltaResult = createMockDeltaResult();
      const summary = builder.buildFinancialSummary(deltaResult);

      const result = FinancialSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('should handle zero investment without NaN ROI', () => {
      const deltaResult = createMockDeltaResult();
      (deltaResult.deltas[0]!.grossDelta as { totalCosts: string }).totalCosts = '0.00';
      const summary = builder.buildFinancialSummary(deltaResult);

      expect(summary.roi).toBe(0);
      expect(isNaN(summary.roi)).toBe(false);
    });
  });

  describe('buildPeriodDetails', () => {
    it('should create period details for each month in horizon', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      expect(periods.length).toBe(12);
    });

    it('should have sequential period numbers', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      periods.forEach((period, index) => {
        expect(period.periodNumber).toBe(index + 1);
      });
    });

    it('should have valid period dates', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      periods.forEach(period => {
        expect(new Date(period.periodStart).toString()).not.toBe('Invalid Date');
        expect(new Date(period.periodEnd).toString()).not.toBe('Invalid Date');
      });
    });

    it('should calculate discount factors correctly', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      // Discount factor should decrease over time
      for (let i = 1; i < periods.length; i++) {
        expect(periods[i]!.discountFactor).toBeLessThan(periods[i - 1]!.discountFactor);
      }
    });

    it('should calculate cumulative net delta', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      // Cumulative net delta should increase over time for positive savings
      for (let i = 1; i < periods.length; i++) {
        const prevCumulative = parseFloat(periods[i - 1]!.cumulativeNetDelta.amount);
        const currCumulative = parseFloat(periods[i]!.cumulativeNetDelta.amount);
        expect(currCumulative).toBeGreaterThanOrEqual(prevCumulative);
      }
    });

    it('should pass schema validation for each period', () => {
      const deltaResult = createMockDeltaResult();
      const periods = builder.buildPeriodDetails(deltaResult);

      periods.forEach(period => {
        const result = PeriodDetailSchema.safeParse(period);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('buildAttributionRecords', () => {
    it('should build attribution records from attribution chains', () => {
      const attributionResult = createMockAttributionResult();
      const records = builder.buildAttributionRecords(attributionResult);

      expect(records.length).toBeGreaterThan(0);
    });

    it('should include primary attribution', () => {
      const attributionResult = createMockAttributionResult();
      const records = builder.buildAttributionRecords(attributionResult);

      const primaryRecord = records.find(r => r.costCenterId === 'CC-001');
      expect(primaryRecord).toBeDefined();
      expect(primaryRecord?.costCenterName).toBe('Engineering');
    });

    it('should include distributed attributions', () => {
      const attributionResult = createMockAttributionResult();
      const records = builder.buildAttributionRecords(attributionResult);

      const distributedRecord = records.find(r => r.costCenterId === 'CC-002');
      expect(distributedRecord).toBeDefined();
    });

    it('should convert allocation percentage to 0-1 range for distributed', () => {
      const attributionResult = createMockAttributionResult();
      const records = builder.buildAttributionRecords(attributionResult);

      const distributedRecord = records.find(r => r.costCenterId === 'CC-002');
      expect(distributedRecord?.allocationPercentage).toBe(0.25); // 25 / 100
    });

    it('should pass schema validation for each attribution record', () => {
      const attributionResult = createMockAttributionResult();
      const records = builder.buildAttributionRecords(attributionResult);

      records.forEach(record => {
        const result = AttributionRecordSchema.safeParse(record);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('buildSensitivityTable', () => {
    it('should create sensitivity factors', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      expect(table.factors.length).toBeGreaterThan(0);
    });

    it('should include discount rate sensitivity', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      const discountFactor = table.factors.find(f => f.factorName === 'Discount Rate');
      expect(discountFactor).toBeDefined();
      expect(discountFactor?.baseValue).toBe(0.1);
    });

    it('should include time horizon sensitivity', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      const horizonFactor = table.factors.find(f => f.factorName === 'Time Horizon');
      expect(horizonFactor).toBeDefined();
      expect(horizonFactor?.baseValue).toBe(12);
    });

    it('should include risk adjustment factor sensitivity', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      const riskFactor = table.factors.find(f => f.factorName === 'Risk Adjustment Factor');
      expect(riskFactor).toBeDefined();
    });

    it('should order tornado factors by impact magnitude', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      expect(table.tornadoOrder.length).toBe(table.factors.length);
      table.tornadoOrder.forEach(name => {
        const factor = table.factors.find(f => f.factorName === name);
        expect(factor).toBeDefined();
      });
    });

    it('should pass schema validation', () => {
      const deltaResult = createMockDeltaResult();
      const table = builder.buildSensitivityTable(deltaResult);

      const result = SensitivityTableSchema.safeParse(table);
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty deltas array', () => {
      const deltaResult = createMockDeltaResult();
      (deltaResult as { deltas: readonly unknown[] }).deltas = [];

      const summary = builder.buildFinancialSummary(deltaResult);
      expect(summary.paybackPeriodMonths).toBeNull();
      expect(summary.irr).toBeNull();
    });

    it('should handle empty attribution chains', () => {
      const attributionResult = createMockAttributionResult();
      (attributionResult as { attributionChains: readonly unknown[] }).attributionChains = [];

      const records = builder.buildAttributionRecords(attributionResult);
      expect(records.length).toBe(0);
    });

    it('should handle decisions with zero impact', () => {
      const deltaResult = createMockDeltaResult();
      (deltaResult.deltas[0]!.grossDelta as { totalSavings: string }).totalSavings = '0.00';
      (deltaResult.deltas[0]!.grossDelta as { netDelta: string }).netDelta = '0.00';
      (deltaResult.portfolioMetrics as { totalGrossSavings: string }).totalGrossSavings = '0.00';

      const summary = builder.buildFinancialSummary(deltaResult);
      expect(summary).toBeDefined();
    });

    it('should handle very large monetary amounts', () => {
      const deltaResult = createMockDeltaResult();
      (deltaResult.deltas[0]!.grossDelta as { totalSavings: string }).totalSavings = '999999999999.9999';
      (deltaResult.portfolioMetrics as { totalGrossSavings: string }).totalGrossSavings = '999999999999.9999';

      const summary = builder.buildFinancialSummary(deltaResult);
      expect(summary.totalBenefit.amount).toBeDefined();
    });

    it('should handle negative net delta (cost)', () => {
      const deltaResult = createMockDeltaResult();
      (deltaResult.deltas[0]!.grossDelta as { netDelta: string }).netDelta = '-5000.00';
      (deltaResult.portfolioMetrics as { totalPresentValue: string }).totalPresentValue = '-5000.00';

      const summary = builder.buildFinancialSummary(deltaResult);
      expect(parseFloat(summary.netBenefit.amount)).toBeLessThan(0);
    });
  });
});
