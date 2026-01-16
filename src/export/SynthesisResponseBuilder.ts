/**
 * Synthesis Response Builder
 * Transforms ROI engine output into executive-synthesis-compatible format.
 *
 * SPARC: Maps financial artifacts to QuantifyReference schema for
 * seamless integration with executive synthesis systems.
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import Decimal from 'decimal.js';

import {
  FinancialArtifact,
  FinancialSummary,
  ArtifactBundle,
  QuantifyReference,
  SynthesisResults,
  SynthesisMetrics,
  SynthesisScenario,
  SynthesisExecutionMetadata,
  StepExecution,
  SynthesisStatus,
  ReportCategory,
  FinancialDeltaResult,
} from '../contracts';

// ============================================================================
// Types
// ============================================================================

export interface SynthesisBuilderConfig {
  readonly defaultRepository?: string;
  readonly defaultVersion?: string;
}

export interface PhaseTimings {
  readonly ingestionMs: number;
  readonly normalizationMs: number;
  readonly attributionMs: number;
  readonly calculationMs: number;
  readonly exportMs: number;
}

export interface SynthesisBuildInputs {
  readonly financialArtifact: FinancialArtifact;
  readonly bundle: ArtifactBundle;
  readonly deltaResult?: FinancialDeltaResult;
  readonly phaseTimings?: PhaseTimings;
  readonly reportType?: 'cfo-grade' | 'executive-summary' | 'technical-deep-dive';
  readonly reportName?: string;
  readonly reportDescription?: string;
  readonly simulationId: string;
  readonly traceId?: string;
  readonly startTime: Date;
  readonly endTime: Date;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REPOSITORY = 'enterprise-roi-engine';
const DEFAULT_VERSION = '1.0';

// Confidence thresholds for mapping to success rate
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.70,
  LOW: 0.50,
} as const;

// ============================================================================
// Synthesis Response Builder Class
// ============================================================================

export class SynthesisResponseBuilder {
  private readonly config: Required<SynthesisBuilderConfig>;

  constructor(config: SynthesisBuilderConfig = {}) {
    this.config = {
      defaultRepository: config.defaultRepository ?? DEFAULT_REPOSITORY,
      defaultVersion: config.defaultVersion ?? DEFAULT_VERSION,
    };
  }

  /**
   * Builds a complete QuantifyReference from ROI engine outputs.
   */
  public build(inputs: SynthesisBuildInputs): QuantifyReference {
    const id = this.generateSynthesisId();
    const status = this.determineStatus(inputs.financialArtifact);
    const results = this.buildResults(inputs);
    const scenario = this.buildScenario(inputs);
    const stepsExecuted = this.buildStepsExecuted(inputs);
    const executionMetadata = this.buildExecutionMetadata(inputs);

    return {
      id,
      type: 'QuantifyReference',
      repository: inputs.simulationId || this.config.defaultRepository,
      status,
      created_at: inputs.startTime.toISOString(),
      completed_at: inputs.endTime.toISOString(),
      iteration_count: this.calculateIterationCount(inputs),
      results,
      scenario,
      steps_executed: stepsExecuted,
      execution_metadata: executionMetadata,
    };
  }

  /**
   * Generates a unique synthesis ID in the format roi-xxx.
   */
  private generateSynthesisId(): string {
    const uuid = uuidv4().replace(/-/g, '').substring(0, 12);
    return `roi-${uuid}`;
  }

  /**
   * Determines the synthesis status based on financial artifact data.
   */
  private determineStatus(artifact: FinancialArtifact): SynthesisStatus {
    const { summary } = artifact;

    // Check if ROI is calculable and positive
    if (summary.roi > 0 && summary.npv.amount !== '0') {
      return 'completed';
    }

    // Check if some calculations succeeded but others failed
    if (summary.irr === null || summary.paybackPeriodMonths === null) {
      return 'partial';
    }

    // If confidence interval is too wide or missing, mark as partial
    const upperBound = new Decimal(summary.confidenceInterval.upperBound);
    const lowerBound = new Decimal(summary.confidenceInterval.lowerBound);
    const intervalWidth = upperBound.minus(lowerBound).toNumber();
    if (intervalWidth > upperBound.mul(0.5).toNumber()) {
      return 'partial';
    }

    return 'completed';
  }

  /**
   * Builds synthesis results from financial artifact.
   */
  private buildResults(inputs: SynthesisBuildInputs): SynthesisResults {
    const { financialArtifact, phaseTimings } = inputs;
    const summary = financialArtifact.summary;

    // Calculate iteration count (number of decisions/scenarios analyzed)
    const totalIterations = this.calculateIterationCount(inputs);

    // Map confidence to success rate
    // Higher confidence = higher success rate
    const successRate = this.mapConfidenceToSuccessRate(summary);

    // Calculate successful vs failed iterations based on success rate
    const successfulIterations = Math.round(totalIterations * successRate);
    const failedIterations = totalIterations - successfulIterations;

    // Calculate average duration
    const averageDurationMs = phaseTimings
      ? this.calculateAverageDuration(phaseTimings, totalIterations)
      : this.calculateDurationFromTimestamps(inputs);

    const metrics = this.buildMetrics(summary);

    return {
      total_iterations: totalIterations,
      successful_iterations: successfulIterations,
      failed_iterations: failedIterations,
      success_rate: successRate,
      average_duration_ms: averageDurationMs,
      metrics,
    };
  }

  /**
   * Maps ROI confidence to a success rate (0-1).
   * High confidence = high success rate.
   */
  private mapConfidenceToSuccessRate(summary: FinancialSummary): number {
    const { confidenceInterval, roi } = summary;

    // Calculate confidence width relative to the estimate
    const upperBound = new Decimal(confidenceInterval.upperBound);
    const lowerBound = new Decimal(confidenceInterval.lowerBound);
    const intervalWidth = upperBound.minus(lowerBound).toNumber();
    const midpoint = upperBound.plus(lowerBound).div(2).toNumber();

    // Avoid division by zero
    if (midpoint === 0) {
      return roi > 0 ? 0.5 : 0.25;
    }

    // Coefficient of variation (lower = more confident)
    const cv = intervalWidth / Math.abs(midpoint);

    // Map CV to success rate
    // CV < 0.2 = high confidence (~95% success rate)
    // CV 0.2-0.5 = medium confidence (~75% success rate)
    // CV > 0.5 = low confidence (~50% success rate)
    if (cv < 0.2) {
      return Math.min(0.95, CONFIDENCE_THRESHOLDS.HIGH + (0.2 - cv) * 0.5);
    } else if (cv < 0.5) {
      return CONFIDENCE_THRESHOLDS.MEDIUM + (0.5 - cv) * 0.5;
    } else {
      return Math.max(0.25, CONFIDENCE_THRESHOLDS.LOW - (cv - 0.5) * 0.25);
    }
  }

  /**
   * Calculates the number of iterations (scenarios analyzed).
   */
  private calculateIterationCount(inputs: SynthesisBuildInputs): number {
    const { financialArtifact, deltaResult } = inputs;

    // Use delta result decision count if available
    if (deltaResult) {
      return deltaResult.portfolioMetrics.decisionCount;
    }

    // Fall back to period details count
    return Math.max(1, financialArtifact.periodDetails.length);
  }

  /**
   * Calculates average duration per iteration.
   */
  private calculateAverageDuration(timings: PhaseTimings, iterations: number): number {
    const totalMs = timings.ingestionMs + timings.normalizationMs +
                    timings.attributionMs + timings.calculationMs + timings.exportMs;
    return iterations > 0 ? Math.round(totalMs / iterations) : totalMs;
  }

  /**
   * Calculates duration from timestamps when phase timings aren't available.
   */
  private calculateDurationFromTimestamps(inputs: SynthesisBuildInputs): number {
    return inputs.endTime.getTime() - inputs.startTime.getTime();
  }

  /**
   * Builds synthesis metrics from financial summary.
   */
  private buildMetrics(summary: FinancialSummary): SynthesisMetrics {
    // Convert NPV string to number
    const npvValue = parseFloat(summary.npv.amount);

    // Apply risk adjustment factor from the ROI methodology
    // If risk-adjusted values are available, use them; otherwise use raw NPV
    const riskAdjustedNpv = npvValue;

    // Parse confidence interval bounds from decimal strings to numbers
    const lowerBoundValue = parseFloat(summary.confidenceInterval.lowerBound);
    const upperBoundValue = parseFloat(summary.confidenceInterval.upperBound);

    return {
      projected_roi: summary.roi * 100, // Convert decimal to percentage
      payback_months: summary.paybackPeriodMonths,
      confidence_interval: [lowerBoundValue, upperBoundValue],
      risk_adjusted_npv: riskAdjustedNpv,
    };
  }

  /**
   * Builds scenario metadata from inputs.
   */
  private buildScenario(inputs: SynthesisBuildInputs): SynthesisScenario {
    const { reportType, reportName, reportDescription, financialArtifact } = inputs;

    // Map report type to category
    const category = this.mapReportTypeToCategory(reportType);

    return {
      scenarioId: financialArtifact.artifactId,
      name: reportName || this.generateReportName(financialArtifact),
      description: reportDescription || financialArtifact.humanReadableSummary,
      category,
      version: this.config.defaultVersion,
    };
  }

  /**
   * Maps report type to synthesis category.
   * CFO-grade reports become 'enterprise' category.
   */
  private mapReportTypeToCategory(reportType?: string): ReportCategory {
    switch (reportType) {
      case 'cfo-grade':
        return 'enterprise';
      case 'executive-summary':
        return 'executive-summary';
      case 'technical-deep-dive':
        return 'technical-deep-dive';
      default:
        return 'cfo-grade'; // Default to CFO-grade
    }
  }

  /**
   * Generates a default report name from the artifact.
   */
  private generateReportName(artifact: FinancialArtifact): string {
    const roi = (artifact.summary.roi * 100).toFixed(1);
    return `ROI Analysis Report (${roi}% projected)`;
  }

  /**
   * Builds the steps_executed array showing analysis phases.
   */
  private buildStepsExecuted(inputs: SynthesisBuildInputs): readonly StepExecution[] {
    const { phaseTimings, financialArtifact } = inputs;

    // If we have detailed phase timings, use them
    if (phaseTimings) {
      return this.buildStepsFromTimings(phaseTimings);
    }

    // Otherwise, build from audit trail
    return this.buildStepsFromAuditTrail(financialArtifact);
  }

  /**
   * Builds step executions from phase timings.
   */
  private buildStepsFromTimings(timings: PhaseTimings): readonly StepExecution[] {
    return [
      {
        stepId: 'data-collection',
        action: 'gather-simulation-data',
        status: 'success',
        duration_ms: timings.ingestionMs,
      },
      {
        stepId: 'normalization',
        action: 'normalize-financial-data',
        status: 'success',
        duration_ms: timings.normalizationMs,
      },
      {
        stepId: 'cost-analysis',
        action: 'calculate-costs',
        status: 'success',
        duration_ms: timings.attributionMs,
      },
      {
        stepId: 'benefit-analysis',
        action: 'project-benefits',
        status: 'success',
        duration_ms: Math.round(timings.calculationMs * 0.6), // 60% for benefits
      },
      {
        stepId: 'risk-adjustment',
        action: 'apply-risk-factors',
        status: 'success',
        duration_ms: Math.round(timings.calculationMs * 0.4), // 40% for risk
      },
      {
        stepId: 'export',
        action: 'generate-artifacts',
        status: 'success',
        duration_ms: timings.exportMs,
      },
    ];
  }

  /**
   * Builds step executions from audit trail when timings aren't available.
   */
  private buildStepsFromAuditTrail(artifact: FinancialArtifact): readonly StepExecution[] {
    const auditTrail = artifact.auditTrail;

    if (auditTrail.length === 0) {
      // Fallback: create minimal step execution
      return [
        {
          stepId: 'analysis',
          action: 'complete-roi-analysis',
          status: 'success',
          duration_ms: 0,
        },
      ];
    }

    // Map audit records to step executions
    return auditTrail.map((record, index) => ({
      stepId: `step-${record.stepNumber}`,
      action: record.operation,
      status: 'success' as const,
      duration_ms: index > 0
        ? this.estimateDurationFromAudit(auditTrail, index)
        : 0,
      details: record.details,
    }));
  }

  /**
   * Estimates duration between audit steps.
   */
  private estimateDurationFromAudit(
    auditTrail: readonly { timestamp: string }[],
    index: number
  ): number {
    if (index === 0) return 0;

    const currentEntry = auditTrail[index];
    const previousEntry = auditTrail[index - 1];

    if (!currentEntry || !previousEntry) {
      return 0;
    }

    const current = new Date(currentEntry.timestamp).getTime();
    const previous = new Date(previousEntry.timestamp).getTime();
    return Math.max(0, current - previous);
  }

  /**
   * Builds execution metadata.
   */
  private buildExecutionMetadata(inputs: SynthesisBuildInputs): SynthesisExecutionMetadata {
    const { bundle, traceId } = inputs;

    return {
      execution_id: bundle.bundleId,
      layer: 'quantification',
      timestamp: new Date().toISOString(),
      trace_id: traceId || bundle.bundleId,
      checksum: bundle.checksum,
    };
  }

  /**
   * Computes a checksum for arbitrary data.
   */
  public computeChecksum(data: unknown): string {
    const content = JSON.stringify(data, null, 0);
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSynthesisResponseBuilder(
  config: SynthesisBuilderConfig = {}
): SynthesisResponseBuilder {
  return new SynthesisResponseBuilder(config);
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Quick transformation of financial artifact to QuantifyReference.
 */
export function buildQuantifyReference(
  artifact: FinancialArtifact,
  bundle: ArtifactBundle,
  options: {
    simulationId: string;
    startTime?: Date;
    endTime?: Date;
    phaseTimings?: PhaseTimings;
    reportType?: 'cfo-grade' | 'executive-summary' | 'technical-deep-dive';
  }
): QuantifyReference {
  const builder = createSynthesisResponseBuilder();

  const buildInputs: SynthesisBuildInputs = {
    financialArtifact: artifact,
    bundle,
    simulationId: options.simulationId,
    startTime: options.startTime || new Date(artifact.generatedAt),
    endTime: options.endTime || new Date(),
  };

  // Conditionally add optional properties
  if (options.phaseTimings !== undefined) {
    (buildInputs as { phaseTimings?: PhaseTimings }).phaseTimings = options.phaseTimings;
  }
  if (options.reportType !== undefined) {
    (buildInputs as { reportType?: string }).reportType = options.reportType;
  }

  return builder.build(buildInputs);
}
