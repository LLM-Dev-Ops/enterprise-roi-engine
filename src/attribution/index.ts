/**
 * Attribution Layer Exports
 * Provides cost attribution, benefit distribution, risk weighting,
 * and overhead allocation for enterprise ROI calculations.
 */

// Core attributors
export { CostAttributor, PeriodAdjustment } from './CostAttributor';
export { BenefitAttributor, ValidationResult as BenefitValidationResult } from './BenefitAttributor';
export { RiskAttributor, RiskAttribution, RiskStatistics } from './RiskAttributor';
export { OverheadAllocator, OverheadBreakdown } from './OverheadAllocator';

// Orchestration
export {
  AttributionOrchestrator,
  AttributionConfig,
  ValidationResult as CostCenterValidationResult,
} from './AttributionOrchestrator';
