/**
 * Enterprise Strategy Agent Unit Tests
 *
 * Tests for the Enterprise Strategy Agent implementation.
 * Verifies:
 * - Input validation
 * - Deterministic behavior
 * - DecisionEvent emission
 * - Confidence calculation
 * - ROI and NPV calculations
 */

import { v4 as uuidv4 } from 'uuid';

import {
  EnterpriseStrategyAgent,
  createEnterpriseStrategyAgent,
} from '../../../src/agents/EnterpriseStrategyAgent';

import {
  StrategyDecisionSubtype,
  ConfidenceLevel,
  ENTERPRISE_STRATEGY_AGENT_ID,
  ENTERPRISE_STRATEGY_AGENT_VERSION,
  DECISION_TYPE,
  EnterpriseStrategyInput,
} from '../../../src/contracts/agent';

import { RuvectorClient } from '../../../src/agents/ruvector-client';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockRuvectorClient(): RuvectorClient {
  return {
    persistDecisionEvent: jest.fn().mockResolvedValue({
      success: true,
      persistenceId: uuidv4(),
      persistedAt: new Date().toISOString(),
      checksum: 'mock-checksum-64-characters-long-for-sha256-hash-validation00',
    }),
    persistTelemetryEvent: jest.fn().mockResolvedValue({
      success: true,
      persistenceId: uuidv4(),
      persistedAt: new Date().toISOString(),
      checksum: 'mock-checksum-64-characters-long-for-sha256-hash-validation00',
    }),
    retrieveDecisionEvent: jest.fn().mockResolvedValue({ success: false }),
    listDecisionEvents: jest.fn().mockResolvedValue({ success: true, data: [] }),
  } as unknown as RuvectorClient;
}

function createValidInput(overrides: Partial<EnterpriseStrategyInput> = {}): EnterpriseStrategyInput {
  const now = new Date().toISOString();
  const currency = 'USD';

  return {
    requestId: uuidv4(),
    analysisType: StrategyDecisionSubtype.ROI_MODEL,
    scenarioId: 'test-scenario-001',
    scenarioName: 'Test Scenario',
    costSignals: [
      {
        signalId: uuidv4(),
        signalType: 'infrastructure',
        amount: { amount: '50000.0000', currency, asOfDate: now },
        periodicity: 'one-time',
        category: 'setup',
        source: 'test',
        timestamp: now,
      },
      {
        signalId: uuidv4(),
        signalType: 'labor',
        amount: { amount: '10000.0000', currency, asOfDate: now },
        periodicity: 'monthly',
        category: 'operations',
        source: 'test',
        timestamp: now,
      },
    ],
    performanceSignals: [
      {
        signalId: uuidv4(),
        metricType: 'latency',
        value: 150,
        unit: 'ms',
        baseline: 300,
        target: 100,
        source: 'test',
        timestamp: now,
      },
    ],
    adoptionSignals: [
      {
        signalId: uuidv4(),
        adoptionType: 'user_count',
        currentValue: 100,
        projectedValue: 500,
        growthRate: 0.15,
        timeHorizonMonths: 36,
        source: 'test',
        timestamp: now,
      },
    ],
    riskIndicators: [
      {
        indicatorId: uuidv4(),
        riskType: 'operational',
        probability: 0.15,
        impact: 'moderate',
        mitigationCost: { amount: '10000.0000', currency, asOfDate: now },
        description: 'Test risk',
        source: 'test',
        timestamp: now,
      },
    ],
    timeHorizonMonths: 36,
    discountRate: 0.08,
    baseCurrency: currency,
    ...overrides,
  };
}

// ============================================================================
// Agent Creation Tests
// ============================================================================

describe('EnterpriseStrategyAgent', () => {
  describe('creation', () => {
    it('should create agent with default configuration', () => {
      const agent = createEnterpriseStrategyAgent();
      expect(agent).toBeInstanceOf(EnterpriseStrategyAgent);
    });

    it('should create agent with custom configuration', () => {
      const mockClient = createMockRuvectorClient();
      const agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
        defaultTimeHorizonMonths: 24,
        defaultDiscountRate: 0.10,
        defaultBaseCurrency: 'EUR',
      });
      expect(agent).toBeInstanceOf(EnterpriseStrategyAgent);
    });
  });

  // ============================================================================
  // Execution Tests
  // ============================================================================

  describe('execute', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: true,
      });
    });

    it('should execute successfully with valid input', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result).toBeDefined();
      expect(result.agent_id).toBe(ENTERPRISE_STRATEGY_AGENT_ID);
      expect(result.agent_version).toBe(ENTERPRISE_STRATEGY_AGENT_VERSION);
      expect(result.decision_type).toBe(DECISION_TYPE);
    });

    it('should emit exactly one DecisionEvent', async () => {
      const input = createValidInput();
      await agent.execute(input);

      expect(mockClient.persistDecisionEvent).toHaveBeenCalledTimes(1);
    });

    it('should include correct execution reference', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.execution_ref.execution_id).toBeDefined();
      expect(result.execution_ref.correlation_id).toBe(input.requestId);
    });

    it('should include valid timestamp', async () => {
      const input = createValidInput();
      const beforeExecution = new Date().toISOString();
      const result = await agent.execute(input);
      const afterExecution = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= beforeExecution).toBe(true);
      expect(result.timestamp <= afterExecution).toBe(true);
    });

    it('should compute valid inputs hash', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.inputs_hash).toBeDefined();
      expect(result.inputs_hash.length).toBe(64); // SHA256 hex length
    });

    it('should compute valid event checksum', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.event_checksum).toBeDefined();
      expect(result.event_checksum.length).toBe(64);
    });

    it('should emit telemetry when enabled', async () => {
      const input = createValidInput();
      await agent.execute(input);

      expect(mockClient.persistTelemetryEvent).toHaveBeenCalledTimes(1);
    });

    it('should not emit telemetry when disabled', async () => {
      const noTelemetryAgent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });

      const input = createValidInput();
      await noTelemetryAgent.execute(input);

      expect(mockClient.persistTelemetryEvent).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Determinism Tests
  // ============================================================================

  describe('deterministic behavior', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should produce same inputs_hash for identical inputs', async () => {
      // Use a fixed UUID for deterministic testing
      const fixedRequestId = '12345678-1234-1234-1234-123456789012';
      const input = createValidInput({ requestId: fixedRequestId });

      const result1 = await agent.execute({ ...input });
      const result2 = await agent.execute({ ...input });

      expect(result1.inputs_hash).toBe(result2.inputs_hash);
    });

    it('should produce same ROI metrics for identical inputs', async () => {
      const input = createValidInput();

      const result1 = await agent.execute({ ...input });
      const result2 = await agent.execute({ ...input });

      expect(result1.outputs.strategicValue.roiMetrics.netROI)
        .toBe(result2.outputs.strategicValue.roiMetrics.netROI);
      expect(result1.outputs.strategicValue.npvMetrics.profitabilityIndex)
        .toBe(result2.outputs.strategicValue.npvMetrics.profitabilityIndex);
    });
  });

  // ============================================================================
  // Input Validation Tests
  // ============================================================================

  describe('input validation', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should reject input with invalid requestId', async () => {
      const input = createValidInput({ requestId: 'not-a-uuid' });

      await expect(agent.execute(input)).rejects.toMatchObject({
        mode: 'INVALID_INPUT',
        code: 'INPUT_VALIDATION_FAILED',
      });
    });

    it('should reject input with no signals', async () => {
      const input = createValidInput({
        costSignals: [],
        performanceSignals: [],
      });

      await expect(agent.execute(input)).rejects.toMatchObject({
        mode: 'MISSING_SIGNALS',
        code: 'MISSING_SIGNALS',
      });
    });

    it('should reject input with invalid time horizon', async () => {
      const input = createValidInput({ timeHorizonMonths: 0 });

      await expect(agent.execute(input)).rejects.toMatchObject({
        mode: 'INVALID_INPUT',
        code: 'INPUT_VALIDATION_FAILED',
      });
    });

    it('should reject input with invalid discount rate', async () => {
      const input = createValidInput({ discountRate: 1.5 });

      await expect(agent.execute(input)).rejects.toMatchObject({
        mode: 'INVALID_INPUT',
        code: 'INPUT_VALIDATION_FAILED',
      });
    });

    it('should reject input with invalid currency code', async () => {
      const input = createValidInput({ baseCurrency: 'INVALID' });

      await expect(agent.execute(input)).rejects.toMatchObject({
        mode: 'INVALID_INPUT',
        code: 'INPUT_VALIDATION_FAILED',
      });
    });
  });

  // ============================================================================
  // Strategic Value Calculation Tests
  // ============================================================================

  describe('strategic value calculation', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should calculate total investment correctly', async () => {
      const now = new Date().toISOString();
      const input = createValidInput({
        costSignals: [
          {
            signalId: uuidv4(),
            signalType: 'infrastructure',
            amount: { amount: '100000.0000', currency: 'USD', asOfDate: now },
            periodicity: 'one-time',
            category: 'setup',
            source: 'test',
            timestamp: now,
          },
        ],
        timeHorizonMonths: 12,
      });

      const result = await agent.execute(input);

      // Amount format may vary - check numeric value instead
      expect(parseFloat(result.outputs.strategicValue.totalInvestment.amount)).toBeCloseTo(100000, 2);
      expect(result.outputs.strategicValue.totalInvestment.currency).toBe('USD');
    });

    it('should aggregate monthly costs over time horizon', async () => {
      const now = new Date().toISOString();
      const input = createValidInput({
        costSignals: [
          {
            signalId: uuidv4(),
            signalType: 'labor',
            amount: { amount: '1000.0000', currency: 'USD', asOfDate: now },
            periodicity: 'monthly',
            category: 'operations',
            source: 'test',
            timestamp: now,
          },
        ],
        timeHorizonMonths: 12,
      });

      const result = await agent.execute(input);

      // $1,000/month * 12 months = $12,000 - check numeric value
      expect(parseFloat(result.outputs.strategicValue.totalInvestment.amount)).toBeCloseTo(12000, 2);
    });

    it('should calculate ROI metrics', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.outputs.strategicValue.roiMetrics).toMatchObject({
        grossROI: expect.any(Number),
        netROI: expect.any(Number),
        annualizedROI: expect.any(Number),
        roi_p10: expect.any(Number),
        roi_p50: expect.any(Number),
        roi_p90: expect.any(Number),
        methodology: 'deterministic_financial_model',
      });
    });

    it('should calculate NPV metrics', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      // irr and paybackPeriodMonths may be null if not calculable
      expect(result.outputs.strategicValue.npvMetrics).toMatchObject({
        npv: expect.objectContaining({
          amount: expect.any(String),
          currency: 'USD',
        }),
        profitabilityIndex: expect.any(Number),
      });
    });

    it('should calculate risk-adjusted return', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.outputs.strategicValue.riskAdjustedReturn).toMatchObject({
        amount: expect.any(String),
        currency: 'USD',
      });
    });

    it('should calculate confidence interval', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.outputs.strategicValue.confidenceInterval).toMatchObject({
        confidenceLevel: 90,
        lowerBound: expect.any(String),
        upperBound: expect.any(String),
        margin: expect.any(String),
      });
    });
  });

  // ============================================================================
  // Confidence Calculation Tests
  // ============================================================================

  describe('confidence calculation', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should assign high confidence with sufficient data', async () => {
      const now = new Date().toISOString();
      const input = createValidInput({
        costSignals: [
          { signalId: uuidv4(), signalType: 'labor', amount: { amount: '1000.0000', currency: 'USD', asOfDate: now }, periodicity: 'monthly', category: 'ops', source: 'test', timestamp: now },
          { signalId: uuidv4(), signalType: 'infrastructure', amount: { amount: '2000.0000', currency: 'USD', asOfDate: now }, periodicity: 'monthly', category: 'infra', source: 'test', timestamp: now },
          { signalId: uuidv4(), signalType: 'license', amount: { amount: '500.0000', currency: 'USD', asOfDate: now }, periodicity: 'monthly', category: 'sw', source: 'test', timestamp: now },
        ],
        performanceSignals: [
          { signalId: uuidv4(), metricType: 'latency', value: 100, unit: 'ms', baseline: 200, target: 50, source: 'test', timestamp: now },
          { signalId: uuidv4(), metricType: 'throughput', value: 5000, unit: 'req/s', baseline: 2000, target: 10000, source: 'test', timestamp: now },
        ],
        riskIndicators: [
          { indicatorId: uuidv4(), riskType: 'operational', probability: 0.1, impact: 'minor', mitigationCost: { amount: '1000.0000', currency: 'USD', asOfDate: now }, description: 'Low risk', source: 'test', timestamp: now },
        ],
        timeHorizonMonths: 24, // Short horizon = higher confidence
      });

      const result = await agent.execute(input);

      expect(result.confidence.level).toBe(ConfidenceLevel.HIGH);
      expect(result.confidence.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should assign lower confidence with limited data', async () => {
      const now = new Date().toISOString();
      const input = createValidInput({
        costSignals: [
          { signalId: uuidv4(), signalType: 'labor', amount: { amount: '1000.0000', currency: 'USD', asOfDate: now }, periodicity: 'monthly', category: 'ops', source: 'test', timestamp: now },
        ],
        performanceSignals: [],
        riskIndicators: [],
        timeHorizonMonths: 60, // Long horizon = lower confidence
      });

      const result = await agent.execute(input);

      expect([ConfidenceLevel.LOW, ConfidenceLevel.MEDIUM]).toContain(result.confidence.level);
      expect(result.confidence.score).toBeLessThan(0.8);
    });

    it('should include confidence factors', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.confidence.factors).toBeDefined();
      expect(Array.isArray(result.confidence.factors)).toBe(true);
    });
  });

  // ============================================================================
  // Constraints and Assumptions Tests
  // ============================================================================

  describe('constraints and assumptions', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should include scenario bounds in constraints', async () => {
      const input = createValidInput({
        timeHorizonMonths: 24,
        discountRate: 0.10,
        baseCurrency: 'EUR',
      });

      const result = await agent.execute(input);

      expect(result.constraints_applied.scenario_bounds).toEqual({
        time_horizon_months: 24,
        discount_rate: 0.10,
        currency: 'EUR',
      });
    });

    it('should include assumptions from input', async () => {
      const input = createValidInput({
        customAssumptions: ['Custom assumption 1', 'Custom assumption 2'],
      });

      const result = await agent.execute(input);

      expect(result.constraints_applied.assumptions).toContain('Custom assumption 1');
      expect(result.constraints_applied.assumptions).toContain('Custom assumption 2');
    });

    it('should include standard assumptions', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.constraints_applied.assumptions.length).toBeGreaterThan(0);
      expect(result.constraints_applied.assumptions.some(a => a.includes('Time horizon'))).toBe(true);
    });

    it('should include scope constraints', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.constraints_applied.scope.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Output Structure Tests
  // ============================================================================

  describe('output structure', () => {
    let mockClient: RuvectorClient;
    let agent: EnterpriseStrategyAgent;

    beforeEach(() => {
      mockClient = createMockRuvectorClient();
      agent = createEnterpriseStrategyAgent({
        ruvectorClient: mockClient,
        emitTelemetry: false,
      });
    });

    it('should include executive summary', async () => {
      const input = createValidInput({
        scenarioName: 'Cloud Migration Project',
      });

      const result = await agent.execute(input);

      expect(result.outputs.executiveSummary).toBeDefined();
      expect(result.outputs.executiveSummary.length).toBeGreaterThan(0);
      expect(result.outputs.executiveSummary).toContain('Cloud Migration Project');
    });

    it('should include all required output fields', async () => {
      const input = createValidInput();
      const result = await agent.execute(input);

      expect(result.outputs.outputId).toBeDefined();
      expect(result.outputs.requestId).toBe(input.requestId);
      expect(result.outputs.scenarioId).toBe(input.scenarioId);
      expect(result.outputs.analysisType).toBe(input.analysisType);
      expect(result.outputs.strategicValue).toBeDefined();
      expect(result.outputs.assumptionsApplied).toBeDefined();
      expect(result.outputs.constraintsApplied).toBeDefined();
      expect(result.outputs.generatedAt).toBeDefined();
    });

    it('should include scenario comparison when comparison scenario is specified', async () => {
      const input = createValidInput({
        comparisonScenarioId: 'comparison-scenario-001',
      });

      const result = await agent.execute(input);

      expect(result.outputs.scenarioComparison).toBeDefined();
      expect(result.outputs.scenarioComparison?.baselineScenarioId).toBe(input.scenarioId);
      expect(result.outputs.scenarioComparison?.comparisonScenarioId).toBe(input.comparisonScenarioId);
    });

    it('should not include scenario comparison when no comparison scenario', async () => {
      // Create input without comparisonScenarioId (omit rather than set to undefined)
      const input = createValidInput({});

      const result = await agent.execute(input);

      expect(result.outputs.scenarioComparison).toBeUndefined();
    });
  });
});
