/**
 * Normalization Layer Exports
 * Provides data normalization capabilities for the enterprise-roi-engine.
 */

// Entity normalization
export {
  EntityNormalizer,
  CostCenterNode,
  EntityCostCenterMapping,
  CanonicalEntityId,
} from './EntityNormalizer';

// Unit harmonization
export {
  UnitHarmonizer,
  ExchangeRate,
  TimeUnit,
  QuantityUnit,
  CurrencyConversionResult,
  TimeConversionResult,
  QuantityConversionResult,
} from './UnitHarmonizer';

// Temporal alignment
export {
  TemporalAligner,
  FiscalCalendarConfig,
  FiscalPeriodType,
  FiscalPeriodMapping,
  AlignedTimeHorizon,
  PeriodAdjustmentFactor,
  TimeHorizonValidation,
} from './TemporalAligner';

// Decision normalization
export {
  DecisionNormalizer,
  DecisionNormalizerConfig,
  RawDecisionInput,
  DecisionTypeMapping,
  NormalizationResult,
} from './DecisionNormalizer';

// Orchestration
export {
  NormalizationOrchestrator,
  NormalizationOrchestratorConfig,
  NormalizationOrchestratorResult,
  NormalizationSummary,
  DeduplicationStrategy,
} from './NormalizationOrchestrator';
