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
 */

// Enterprise Strategy Agent
export {
  EnterpriseStrategyAgent,
  EnterpriseStrategyAgentConfig,
  createEnterpriseStrategyAgent,
} from './EnterpriseStrategyAgent';

// ruvector-service Client
export {
  RuvectorClient,
  RuvectorClientConfig,
  PersistenceResponse,
  RetrievalResponse,
  createRuvectorClient,
} from './ruvector-client';
