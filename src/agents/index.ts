/**
 * Agents Module
 *
 * Exports all agent implementations for the enterprise-roi-engine.
 *
 * Agents in this module adhere to the Agentics Constitution:
 * - Stateless execution
 * - Deterministic behavior
 * - Persistence via ruvector-service only
 * - Emit exactly ONE DecisionEvent per invocation
 *
 * PERFORMANCE BUDGETS (Per Strategic Hardening Requirements):
 * - MAX_TOKENS: 2500 (output size constraint)
 * - MAX_LATENCY_MS: 5000 (5 second execution budget)
 *
 * ROLE RULES:
 * - Agent MAY: Model ROI, Compare scenarios, Estimate risk-adjusted value
 * - Agent MUST NOT: Recommend final decisions, Trigger deployments
 *
 * DECISIONEVENT RULES:
 * - Emits: roi_estimate_signal, value_tradeoff_signal, economic_risk_signal
 */

// Enterprise Strategy Agent
export {
  EnterpriseStrategyAgent,
  EnterpriseStrategyAgentConfig,
  createEnterpriseStrategyAgent,
  // Performance Budget Constants
  MAX_TOKENS,
  MAX_LATENCY_MS,
} from './EnterpriseStrategyAgent';

// ruvector-service Client
export {
  RuvectorClient,
  RuvectorClientConfig,
  PersistenceResponse,
  RetrievalResponse,
  createRuvectorClient,
  // Strategic Signal Types
  StrategicSignal,
  StrategicSignalType,
} from './ruvector-client';
