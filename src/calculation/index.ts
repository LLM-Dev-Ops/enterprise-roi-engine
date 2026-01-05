/**
 * Calculation Layer Exports
 * Central export point for all financial calculation modules.
 *
 * This layer provides:
 * - ROI calculation with multiple methodologies
 * - NPV calculation with configurable discount rates
 * - Payback period analysis (simple and discounted)
 * - Sensitivity analysis with tornado diagrams
 * - Confidence interval generation
 * - Full orchestration of financial calculations
 *
 * All calculations use decimal.js for precision - no floating point for currency.
 * All functions are deterministic: same inputs = same outputs.
 */

// ROI Calculator
export {
  ROICalculator,
  ROIMethodology,
  ROICalculationConfig,
  ROIResult,
  DeltaInput,
  calculateGrossDelta,
  calculateSimpleROI,
  calculateAnnualizedROI,
  calculateROI,
  calculateGrossDeltaFromChain,
  aggregateGrossDeltas,
} from './ROICalculator';

// NPV Engine
export {
  NPVEngine,
  NPVConfig,
  NPVResult,
  CashFlow,
  PeriodPresentValue,
  calculateMonthlyRate,
  calculateEffectiveMonthlyRate,
  calculateDiscountFactor,
  calculatePresentValue,
  calculateNPV,
  calculatePeriodPresentValues,
  calculateTimeAdjustedDelta,
  calculateSinglePeriodNPV,
  calculateCumulativeNPV,
} from './NPVEngine';

// Payback Analyzer
export {
  PaybackAnalyzer,
  PaybackConfig,
  PaybackResult,
  PaybackAnalysis,
  PaybackPeriodDetail,
  calculateSimplePaybackPeriod,
  calculateDiscountedPaybackPeriod,
  calculatePaybackPeriod,
  analyzePayback,
  calculateInterpolatedPaybackPeriod,
  generateUniformCashFlows,
} from './PaybackAnalyzer';

// Sensitivity Engine
export {
  SensitivityEngine,
  SensitivityFactorConfig,
  SensitivityFactorType,
  SensitivityAnalysisConfig,
  calculateElasticity,
  calculateNPVWithDiscountRate,
  applyCashFlowMultiplier,
  filterCashFlowsByHorizon,
  analyzeSingleFactor,
  performSensitivityAnalysis,
  generateStandardFactors,
  calculateDiscountRateSensitivityCurve,
} from './SensitivityEngine';

// Confidence Calculator
export {
  ConfidenceCalculator,
  ConfidenceConfig,
  RiskWeightConfig,
  Z_SCORES,
  STANDARD_CONFIDENCE_LEVELS,
  calculateUncertaintyFactor,
  calculateMargin,
  calculateIntervalBounds,
  generateConfidenceIntervals,
  calculateRiskComponents,
  calculateRiskFactor,
  calculateRiskAdjustedDelta,
} from './ConfidenceCalculator';

// Calculation Orchestrator
export {
  CalculationOrchestrator,
  CalculationOrchestratorConfig,
  calculateFinancialDeltas,
} from './CalculationOrchestrator';
