/**
 * Mock Data Generators for Ingestion Layer Tests
 * Provides factory functions to create valid mock data matching contract schemas.
 */

import {
  SimulationOutput,
  SimulationMetadata,
  SimulationScenario,
  DecisionNode,
  ResourceDelta,
  WorkflowTrace,
  WorkflowStep,
  SimulationConfidenceIntervals,
  ERPMetadata,
  EntityMapping,
  EntityType,
  GLAccount,
  CostCenter,
  CostBaseline,
  LaborRate,
  InfrastructureCost,
  LicenseCost,
  OverheadFactor,
  RiskWeightMatrix,
  ResourceType,
  DeltaDirection,
  AccountType,
  NaturalSign,
  FiscalPeriod,
} from '../../../../src/contracts';

// ============================================================================
// UUID Generator
// ============================================================================

let uuidCounter = 0;

export function generateUUID(): string {
  uuidCounter++;
  const hex = uuidCounter.toString(16).padStart(12, '0');
  return `00000000-0000-0000-0000-${hex}`;
}

export function resetUUIDCounter(): void {
  uuidCounter = 0;
}

// ============================================================================
// Timestamp Generators
// ============================================================================

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function getPastTimestamp(hoursAgo: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
}

export function getFutureTimestamp(hoursAhead: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hoursAhead);
  return date.toISOString();
}

export function getStaleTimestamp(): string {
  return getPastTimestamp(48); // 48 hours ago = stale
}

// ============================================================================
// Simulation Mock Data
// ============================================================================

export function createMockSimulationMetadata(
  overrides: Partial<SimulationMetadata> = {}
): SimulationMetadata {
  return {
    simulationId: generateUUID(),
    engineVersion: '1.0.0',
    timestamp: getCurrentTimestamp(),
    checksum: 'a'.repeat(64),
    ...overrides,
  };
}

export function createMockSimulationScenario(
  overrides: Partial<SimulationScenario> = {}
): SimulationScenario {
  return {
    name: 'Test Scenario',
    baselineId: generateUUID(),
    timeHorizonMonths: 12,
    confidenceLevel: 0.95,
    ...overrides,
  };
}

export function createMockDecisionNode(
  overrides: Partial<DecisionNode> = {}
): DecisionNode {
  return {
    nodeId: generateUUID(),
    parentId: null,
    decision: 'Test Decision',
    probability: 0.85,
    outcomeMetrics: { savings: 10000 },
    ...overrides,
  };
}

export function createMockResourceDelta(
  overrides: Partial<ResourceDelta> = {}
): ResourceDelta {
  return {
    period: 0,
    resourceType: ResourceType.FTE,
    quantity: 5.0,
    unit: 'headcount',
    direction: DeltaDirection.DECREASE,
    ...overrides,
  };
}

export function createMockWorkflowStep(
  overrides: Partial<WorkflowStep> = {}
): WorkflowStep {
  return {
    stepId: generateUUID(),
    stepName: 'Test Step',
    duration: 1000,
    resourcesConsumed: { cpu: 100 },
    ...overrides,
  };
}

export function createMockWorkflowTrace(
  overrides: Partial<WorkflowTrace> = {}
): WorkflowTrace {
  return {
    traceId: generateUUID(),
    workflowName: 'Test Workflow',
    steps: [createMockWorkflowStep()],
    totalDuration: 1000,
    ...overrides,
  };
}

export function createMockConfidenceIntervals(
  overrides: Partial<SimulationConfidenceIntervals> = {}
): SimulationConfidenceIntervals {
  return {
    metricName: 'ROI',
    p10: 0.05,
    p25: 0.10,
    p50: 0.15,
    p75: 0.20,
    p90: 0.25,
    ...overrides,
  };
}

export function createMockSimulationOutput(
  overrides: Partial<SimulationOutput> = {}
): SimulationOutput {
  return {
    metadata: createMockSimulationMetadata(),
    scenario: createMockSimulationScenario(),
    decisions: [createMockDecisionNode()],
    resourceDeltas: [createMockResourceDelta()],
    workflowTraces: [createMockWorkflowTrace()],
    confidenceIntervals: [createMockConfidenceIntervals()],
    ...overrides,
  };
}

// ============================================================================
// ERP Mock Data
// ============================================================================

export function createMockEntityMapping(
  overrides: Partial<EntityMapping> = {}
): EntityMapping {
  return {
    erpEntityId: `ENT-${generateUUID().slice(-8)}`,
    entityType: EntityType.COST_CENTER,
    displayName: 'Test Entity',
    parentId: null,
    attributes: { region: 'US' },
    ...overrides,
  };
}

export function createMockGLAccount(
  overrides: Partial<GLAccount> = {}
): GLAccount {
  return {
    accountId: `ACC-${generateUUID().slice(-8)}`,
    accountName: 'Test Account',
    accountType: AccountType.EXPENSE,
    naturalSign: NaturalSign.DEBIT,
    currency: 'USD',
    isActive: true,
    ...overrides,
  };
}

export function createMockCostCenter(
  overrides: Partial<CostCenter> = {}
): CostCenter {
  return {
    costCenterId: `CC-${generateUUID().slice(-8)}`,
    name: 'Test Cost Center',
    parentCostCenterId: null,
    hierarchyLevel: 0,
    acceptsDirectCharges: true,
    currency: 'USD',
    isActive: true,
    ...overrides,
  };
}

export function createMockFiscalPeriod(
  overrides: Partial<FiscalPeriod> = {}
): FiscalPeriod {
  return {
    year: 2024,
    period: 1,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2024-01-31T23:59:59.999Z',
    ...overrides,
  };
}

export function createMockERPMetadata(
  overrides: Partial<ERPMetadata> = {}
): ERPMetadata {
  return {
    erpSystem: 'SAP',
    erpVersion: '1.0.0',
    extractTimestamp: getCurrentTimestamp(),
    entities: [createMockEntityMapping()],
    chartOfAccounts: [createMockGLAccount()],
    costCenters: [createMockCostCenter()],
    fiscalCalendar: [createMockFiscalPeriod()],
    reportingCurrency: 'USD',
    ...overrides,
  };
}

// ============================================================================
// Cost Baseline Mock Data
// ============================================================================

export function createMockLaborRate(
  overrides: Partial<LaborRate> = {}
): LaborRate {
  return {
    roleId: `ROLE-${generateUUID().slice(-8)}`,
    roleName: 'Software Engineer',
    fullyLoadedRate: '150.0000',
    currency: 'USD',
    effectiveDate: getCurrentTimestamp(),
    ...overrides,
  };
}

export function createMockInfrastructureCost(
  overrides: Partial<InfrastructureCost> = {}
): InfrastructureCost {
  return {
    resourceType: 'compute-standard',
    unitCost: '0.1000',
    unit: 'per-hour',
    currency: 'USD',
    effectiveDate: getCurrentTimestamp(),
    ...overrides,
  };
}

export function createMockLicenseCost(
  overrides: Partial<LicenseCost> = {}
): LicenseCost {
  return {
    licenseType: 'enterprise',
    vendorName: 'Test Vendor',
    annualCost: '10000.0000',
    perUserCost: '100.0000',
    currency: 'USD',
    effectiveDate: getCurrentTimestamp(),
    ...overrides,
  };
}

export function createMockOverheadFactor(
  overrides: Partial<OverheadFactor> = {}
): OverheadFactor {
  return {
    costCenterId: `CC-${generateUUID().slice(-8)}`,
    directRate: 0.20,
    indirectRate: 0.15,
    sharedServicesRate: 0.10,
    effectiveDate: getCurrentTimestamp(),
    ...overrides,
  };
}

export function createMockRiskWeightMatrix(
  overrides: Partial<RiskWeightMatrix> = {}
): RiskWeightMatrix {
  return {
    categoryId: `CAT-${generateUUID().slice(-8)}`,
    categoryName: 'Test Category',
    baseWeight: 1.0,
    volatilityMultiplier: 0.5,
    confidenceDecayRate: 0.3,
    maxWeight: 2.0,
    ...overrides,
  };
}

export function createMockCostBaseline(
  overrides: Partial<CostBaseline> = {}
): CostBaseline {
  return {
    baselineId: generateUUID(),
    snapshotTimestamp: getCurrentTimestamp(),
    costModelVersion: '1.0.0',
    laborRates: [createMockLaborRate()],
    infrastructureCosts: [createMockInfrastructureCost()],
    licenseCosts: [createMockLicenseCost()],
    overheadFactors: [createMockOverheadFactor()],
    riskWeights: [createMockRiskWeightMatrix()],
    discountRate: 0.10,
    baselinePeriod: 'FY2024',
    ...overrides,
  };
}

// ============================================================================
// Invalid Data Generators (for error testing)
// ============================================================================

export function createInvalidSimulationOutput(): unknown {
  return {
    metadata: {
      simulationId: 'not-a-uuid',
      engineVersion: 'invalid',
      timestamp: 'not-a-date',
      checksum: 'too-short',
    },
    scenario: {},
    decisions: [],
    resourceDeltas: [],
    workflowTraces: [],
    confidenceIntervals: [],
  };
}

export function createInvalidERPMetadata(): unknown {
  return {
    erpSystem: '',
    erpVersion: '',
    extractTimestamp: 'invalid-date',
    entities: [{ erpEntityId: '' }],
    chartOfAccounts: [],
    costCenters: [],
    fiscalCalendar: [],
    reportingCurrency: 'INVALID',
  };
}

export function createInvalidCostBaseline(): unknown {
  return {
    baselineId: 'not-a-uuid',
    snapshotTimestamp: 'invalid',
    costModelVersion: '',
    laborRates: [],
    infrastructureCosts: [],
    licenseCosts: [],
    overheadFactors: [],
    riskWeights: [],
    discountRate: 2.0, // Invalid: > 1
    baselinePeriod: '',
  };
}

// ============================================================================
// Partial/Missing Field Data Generators
// ============================================================================

export function createSimulationOutputMissingFields(): unknown {
  return {
    metadata: createMockSimulationMetadata(),
    // Missing scenario, decisions, resourceDeltas, etc.
  };
}

export function createERPMetadataMissingFields(): unknown {
  return {
    erpSystem: 'SAP',
    // Missing other required fields
  };
}

export function createCostBaselineMissingFields(): unknown {
  return {
    baselineId: generateUUID(),
    // Missing other required fields
  };
}

// ============================================================================
// Edge Case Data Generators
// ============================================================================

export function createEmptyArraysSimulationOutput(): SimulationOutput {
  return createMockSimulationOutput({
    decisions: [],
    resourceDeltas: [],
    workflowTraces: [],
    confidenceIntervals: [],
  });
}

export function createEmptyArraysERPMetadata(): ERPMetadata {
  return createMockERPMetadata({
    entities: [],
    chartOfAccounts: [],
    costCenters: [],
    fiscalCalendar: [],
  });
}

export function createEmptyArraysCostBaseline(): CostBaseline {
  return createMockCostBaseline({
    laborRates: [],
    infrastructureCosts: [],
    licenseCosts: [],
    overheadFactors: [],
    riskWeights: [],
  });
}

// ============================================================================
// Mock Endpoint Factories
// ============================================================================

export interface MockSimulationEndpoint {
  fetchSimulationOutput: jest.Mock<Promise<unknown>>;
}

export interface MockERPSurfaceEndpoint {
  fetchERPMetadata: jest.Mock<Promise<unknown>>;
}

export interface MockCostOpsEndpoint {
  fetchCostBaseline: jest.Mock<Promise<unknown>>;
}

export function createMockSimulationEndpoint(
  data?: unknown
): MockSimulationEndpoint {
  return {
    fetchSimulationOutput: jest.fn().mockResolvedValue(
      data ?? createMockSimulationOutput()
    ),
  };
}

export function createMockSimulationEndpointWithError(
  error: Error
): MockSimulationEndpoint {
  return {
    fetchSimulationOutput: jest.fn().mockRejectedValue(error),
  };
}

export function createMockERPSurfaceEndpoint(
  data?: unknown
): MockERPSurfaceEndpoint {
  return {
    fetchERPMetadata: jest.fn().mockResolvedValue(
      data ?? createMockERPMetadata()
    ),
  };
}

export function createMockERPSurfaceEndpointWithError(
  error: Error
): MockERPSurfaceEndpoint {
  return {
    fetchERPMetadata: jest.fn().mockRejectedValue(error),
  };
}

export function createMockCostOpsEndpoint(
  data?: unknown
): MockCostOpsEndpoint {
  return {
    fetchCostBaseline: jest.fn().mockResolvedValue(
      data ?? createMockCostBaseline()
    ),
  };
}

export function createMockCostOpsEndpointWithError(
  error: Error
): MockCostOpsEndpoint {
  return {
    fetchCostBaseline: jest.fn().mockRejectedValue(error),
  };
}
