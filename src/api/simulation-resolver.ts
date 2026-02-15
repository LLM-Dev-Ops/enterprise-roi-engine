/**
 * Simulation Resolver
 * Fetches simulation data from ruvector-service and generates sensible defaults
 * for erpMetadata and costBaseline when using the lightweight sim_ref intake.
 */

import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import type { SimulationOutput } from '../contracts/simulation';
import type { ERPMetadata } from '../contracts/erp';
import { EntityType } from '../contracts/erp';
import type { CostBaseline } from '../contracts/costops';
import { AccountType, NaturalSign, ResourceType, DeltaDirection } from '../contracts/common';
import type { DecisionNode, ResourceDelta } from '../contracts/simulation';
import type { LightweightROIRequest } from './types';

const RUVECTOR_SERVICE_BASE = 'https://ruvvector-service-1062287243982.us-central1.run.app';

export interface ResolvedSimulationData {
  readonly simulation: SimulationOutput;
  readonly erpMetadata: ERPMetadata;
  readonly costBaseline: CostBaseline;
}

/**
 * Maps time_horizon string to months for calculation config.
 */
export function resolveTimeHorizonMonths(timeHorizon?: string): number {
  switch (timeHorizon) {
    case 'quarterly': return 3;
    case 'annual':
    case '1y': return 12;
    case '3-year':
    case '3y': return 36;
    case '5-year':
    case '5y': return 60;
    default: return 12;
  }
}

/**
 * Fetches simulation data from ruvector-service and generates default
 * erpMetadata and costBaseline stubs.
 */
export async function resolveSimulationData(
  request: LightweightROIRequest
): Promise<ResolvedSimulationData> {
  const simulationId = request.sim_ref.id;
  const currency = request.currency ?? 'USD';
  const timeHorizonMonths = resolveTimeHorizonMonths(request.time_horizon);

  // Use inline simulation_data if provided, otherwise fetch from ruvector
  const simulation = (request.simulation_data && typeof request.simulation_data === 'object')
    ? resolveInlineSimulation(request.simulation_data, simulationId)
    : await fetchSimulation(simulationId);

  // Generate fiscal calendar covering the simulation's time horizon
  const simHorizon = simulation.scenario.timeHorizonMonths;
  const calendarYears = Math.ceil(Math.max(simHorizon, timeHorizonMonths) / 12) + 1;
  const erpMetadata = generateDefaultERPMetadata(currency, calendarYears);
  const costBaseline = generateDefaultCostBaseline(
    simulation.scenario.baselineId,
    currency,
    timeHorizonMonths
  );

  return { simulation, erpMetadata, costBaseline };
}

/**
 * Resolves inline simulation data into a SimulationOutput.
 * Handles three formats:
 * 1. Already a valid SimulationOutput → use directly
 * 2. CLI simulation record (metadata.synthesis_data.financial_model) → extract and synthesize
 * 3. Other upstream format → normalize with defaults
 */
function resolveInlineSimulation(data: Record<string, unknown>, simulationId: string): SimulationOutput {
  // The inline payload may wrap the simulation in a data envelope
  const unwrapped = ('data' in data && typeof data['data'] === 'object' && data['data'] !== null)
    ? data['data'] as Record<string, unknown>
    : data;

  if (isSimulationOutput(unwrapped)) {
    return unwrapped as unknown as SimulationOutput;
  }

  // Check for CLI simulation record format: metadata.synthesis_data.financial_model
  const cliSimulation = buildSimulationFromCLIRecord(unwrapped as Record<string, unknown>, simulationId);
  if (cliSimulation) {
    return cliSimulation;
  }

  return normalizeUpstreamSimulation(unwrapped, simulationId);
}

/**
 * Attempts to build a SimulationOutput from a CLI simulation record.
 * The CLI stores simulations locally with financial data nested at
 * metadata.synthesis_data.financial_model. Returns null if the data
 * is not in CLI record format.
 */
function buildSimulationFromCLIRecord(
  data: Record<string, unknown>,
  simulationId: string
): SimulationOutput | null {
  const metadata = data['metadata'] as Record<string, unknown> | undefined;
  if (!metadata || typeof metadata !== 'object') return null;

  const synthesisData = metadata['synthesis_data'] as Record<string, unknown> | undefined;
  if (!synthesisData || typeof synthesisData !== 'object') return null;

  const financialModel = synthesisData['financial_model'] as Record<string, unknown> | undefined;
  if (!financialModel || typeof financialModel !== 'object') return null;

  // We have a CLI simulation record with financial data — extract it
  const scenario = synthesisData['scenario'] as Record<string, unknown> | undefined;
  const phases = synthesisData['phases'] as unknown[] | undefined;
  const routing = synthesisData['routing'] as Record<string, unknown> | undefined;

  const now = new Date().toISOString();
  const checksum = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const scenarioName = (typeof data['name'] === 'string' ? data['name'] : null)
    ?? (scenario && typeof scenario['name'] === 'string' ? scenario['name'] : `Simulation ${simulationId}`);
  const category = routing && typeof routing['category'] === 'string'
    ? routing['category'] : 'general';

  // Build decisions from cost_breakdown (investment) and savings_breakdown (savings)
  const decisions: DecisionNode[] = [];
  const resourceDeltas: ResourceDelta[] = [];

  const costBreakdown = financialModel['cost_breakdown'] as Record<string, number> | undefined;
  const savingsBreakdown = financialModel['savings_breakdown'] as Record<string, number> | undefined;
  const yearByYear = financialModel['year_by_year'] as Array<Record<string, number>> | undefined;

  const totalInvestment = typeof financialModel['total_investment'] === 'number'
    ? financialModel['total_investment'] : 0;
  const roiMonths = typeof financialModel['roi_months'] === 'number'
    ? financialModel['roi_months'] : 12;

  // Create decisions from cost breakdown items (investment costs)
  if (costBreakdown && typeof costBreakdown === 'object') {
    for (const [costType, amount] of Object.entries(costBreakdown)) {
      if (typeof amount !== 'number') continue;
      const nodeId = uuidv4();
      const label = costType.replace(/_/g, ' ');

      decisions.push({
        nodeId,
        parentId: null,
        decision: `${category} investment: ${label}`,
        probability: routing && typeof routing['confidence'] === 'number'
          ? routing['confidence'] : 0.85,
        outcomeMetrics: {
          investment_amount: amount,
          category_weight: totalInvestment > 0 ? amount / totalInvestment : 0,
        },
      });

      // Distribute cost across periods (year_by_year or evenly across roiMonths)
      const periods = yearByYear ? yearByYear.length * 12 : Math.max(roiMonths, 12);
      const perPeriodAmount = amount / periods;
      for (let p = 0; p < periods; p++) {
        resourceDeltas.push({
          period: p,
          resourceType: costType === 'talent' ? ResourceType.FTE
            : costType === 'licensing' ? ResourceType.LICENSE
            : costType === 'infrastructure' ? ResourceType.COMPUTE
            : ResourceType.CUSTOM,
          quantity: perPeriodAmount,
          unit: 'currency',
          direction: DeltaDirection.INCREASE,
        });
      }
    }
  }

  // Create decisions from savings breakdown items
  if (savingsBreakdown && typeof savingsBreakdown === 'object') {
    for (const [savingsType, amount] of Object.entries(savingsBreakdown)) {
      if (typeof amount !== 'number') continue;
      const nodeId = uuidv4();
      const label = savingsType.replace(/_/g, ' ');

      decisions.push({
        nodeId,
        parentId: null,
        decision: `${category} savings: ${label}`,
        probability: routing && typeof routing['confidence'] === 'number'
          ? routing['confidence'] : 0.85,
        outcomeMetrics: {
          savings_amount: amount,
          annual_savings: amount,
        },
      });

      const periods = yearByYear ? yearByYear.length * 12 : Math.max(roiMonths, 12);
      const perPeriodAmount = amount / periods;
      for (let p = 0; p < periods; p++) {
        resourceDeltas.push({
          period: p,
          resourceType: savingsType.includes('labor') ? ResourceType.FTE
            : savingsType.includes('infrastructure') ? ResourceType.COMPUTE
            : ResourceType.CUSTOM,
          quantity: perPeriodAmount,
          unit: 'currency',
          direction: DeltaDirection.DECREASE,
        });
      }
    }
  }

  // If we didn't extract any decisions, create a single aggregate decision
  if (decisions.length === 0) {
    const totalSavings = savingsBreakdown
      ? Object.values(savingsBreakdown).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      : 0;

    decisions.push({
      nodeId: uuidv4(),
      parentId: null,
      decision: `${category} initiative: ${scenarioName}`,
      probability: routing && typeof routing['confidence'] === 'number'
        ? routing['confidence'] : 0.85,
      outcomeMetrics: {
        total_investment: totalInvestment,
        total_savings: totalSavings,
        roi_months: roiMonths,
      },
    });

    // Add aggregate resource deltas
    if (totalInvestment > 0) {
      resourceDeltas.push({
        period: 0,
        resourceType: ResourceType.CUSTOM,
        quantity: totalInvestment,
        unit: 'currency',
        direction: DeltaDirection.INCREASE,
      });
    }
    if (totalSavings > 0) {
      resourceDeltas.push({
        period: 0,
        resourceType: ResourceType.CUSTOM,
        quantity: totalSavings,
        unit: 'currency',
        direction: DeltaDirection.DECREASE,
      });
    }
  }

  // Determine time horizon from year_by_year or roi_months
  const timeHorizonMonths = yearByYear ? yearByYear.length * 12 : Math.max(roiMonths, 12);

  // Build confidence intervals from financial model
  const npv5yr = typeof financialModel['npv_5yr'] === 'number' ? financialModel['npv_5yr'] : 0;
  const totalSavings = savingsBreakdown
    ? Object.values(savingsBreakdown).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
    : 0;

  return {
    metadata: {
      simulationId: typeof data['id'] === 'string' ? data['id'] : simulationId,
      engineVersion: '1.0.0-cli',
      timestamp: typeof data['created_at'] === 'string' ? data['created_at'] : now,
      checksum,
    },
    scenario: {
      name: scenarioName,
      baselineId: uuidv4(),
      timeHorizonMonths,
      confidenceLevel: routing && typeof routing['confidence'] === 'number'
        ? routing['confidence'] : 0.9,
    },
    decisions,
    resourceDeltas,
    workflowTraces: buildWorkflowTracesFromPhases(phases),
    confidenceIntervals: [{
      metricName: 'net_savings',
      p10: totalSavings * 0.6,
      p25: totalSavings * 0.75,
      p50: totalSavings * 0.9,
      p75: totalSavings * 1.0,
      p90: totalSavings * 1.1,
    }, {
      metricName: 'npv',
      p10: npv5yr * 0.7,
      p25: npv5yr * 0.8,
      p50: npv5yr * 0.9,
      p75: npv5yr * 1.0,
      p90: npv5yr * 1.1,
    }],
  };
}

/**
 * Builds workflow traces from CLI synthesis phases.
 */
function buildWorkflowTracesFromPhases(
  phases: unknown[] | undefined
): SimulationOutput['workflowTraces'] {
  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    return [{
      traceId: uuidv4(),
      workflowName: 'cli-synthesis',
      steps: [{
        stepId: uuidv4(),
        stepName: 'cli-synthesis',
        duration: 0,
        resourcesConsumed: {},
      }],
      totalDuration: 0,
    }];
  }

  return [{
    traceId: uuidv4(),
    workflowName: 'cli-synthesis',
    steps: phases.map((phase, index) => {
      const p = phase as Record<string, unknown>;
      return {
        stepId: uuidv4(),
        stepName: typeof p['name'] === 'string' ? p['name'] : `phase-${index + 1}`,
        duration: 0,
        resourcesConsumed: {},
      };
    }),
    totalDuration: 0,
  }];
}

/**
 * Fetches simulation output from ruvector-service.
 */
async function fetchSimulation(simulationId: string): Promise<SimulationOutput> {
  const url = `${RUVECTOR_SERVICE_BASE}/v1/simulations/${encodeURIComponent(simulationId)}`;

  const responseBody = await httpGet(url);

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new SimulationResolverError(
      'PARSE_ERROR',
      `Failed to parse simulation response from ruvector-service for ${simulationId}`
    );
  }

  // The upstream response may wrap the simulation in a data envelope
  const data = (typeof parsed === 'object' && parsed !== null && 'data' in parsed)
    ? (parsed as Record<string, unknown>)['data']
    : parsed;

  // If the upstream doesn't return the exact SimulationOutput shape,
  // we normalize it into the expected format
  if (isSimulationOutput(data)) {
    return data as SimulationOutput;
  }

  // Build a SimulationOutput from whatever the upstream returns
  return normalizeUpstreamSimulation(data, simulationId);
}

function isSimulationOutput(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj['metadata'] === 'object' &&
    typeof obj['scenario'] === 'object' &&
    Array.isArray(obj['decisions']) &&
    Array.isArray(obj['resourceDeltas']) &&
    Array.isArray(obj['workflowTraces']) &&
    Array.isArray(obj['confidenceIntervals'])
  );
}

/**
 * Normalizes upstream simulation data into the expected SimulationOutput shape.
 * Fills in missing fields with sensible defaults.
 */
function normalizeUpstreamSimulation(data: unknown, simulationId: string): SimulationOutput {
  const obj = (typeof data === 'object' && data !== null) ? data as Record<string, unknown> : {};

  const now = new Date().toISOString();
  const baselineId = uuidv4();
  const checksum = createHash('sha256').update(JSON.stringify(obj)).digest('hex');

  const metadata = (typeof obj['metadata'] === 'object' && obj['metadata'] !== null)
    ? obj['metadata'] as Record<string, unknown>
    : {};

  const scenario = (typeof obj['scenario'] === 'object' && obj['scenario'] !== null)
    ? obj['scenario'] as Record<string, unknown>
    : {};

  return {
    metadata: {
      simulationId: (typeof metadata['simulationId'] === 'string' ? metadata['simulationId'] : uuidv4()) as string,
      engineVersion: (typeof metadata['engineVersion'] === 'string' ? metadata['engineVersion'] : '1.0.0') as string,
      timestamp: (typeof metadata['timestamp'] === 'string' ? metadata['timestamp'] : now) as string,
      checksum: (typeof metadata['checksum'] === 'string' ? metadata['checksum'] : checksum) as string,
    },
    scenario: {
      name: (typeof scenario['name'] === 'string' ? scenario['name'] : `Simulation ${simulationId}`) as string,
      baselineId: (typeof scenario['baselineId'] === 'string' ? scenario['baselineId'] : baselineId) as string,
      timeHorizonMonths: (typeof scenario['timeHorizonMonths'] === 'number' ? scenario['timeHorizonMonths'] : 12) as number,
      confidenceLevel: (typeof scenario['confidenceLevel'] === 'number' ? scenario['confidenceLevel'] : 0.9) as number,
    },
    decisions: Array.isArray(obj['decisions']) ? obj['decisions'] as SimulationOutput['decisions'] : [],
    resourceDeltas: Array.isArray(obj['resourceDeltas']) ? obj['resourceDeltas'] as SimulationOutput['resourceDeltas'] : [],
    workflowTraces: Array.isArray(obj['workflowTraces']) ? obj['workflowTraces'] as SimulationOutput['workflowTraces'] : [],
    confidenceIntervals: Array.isArray(obj['confidenceIntervals'])
      ? obj['confidenceIntervals'] as SimulationOutput['confidenceIntervals']
      : [{
          metricName: 'net_savings',
          p10: 0,
          p25: 0,
          p50: 0,
          p75: 0,
          p90: 0,
        }],
  };
}

/**
 * Generates a default ERPMetadata stub for lightweight requests.
 * @param years Number of years of fiscal calendar to generate (default 7, covering 5yr projections).
 */
function generateDefaultERPMetadata(currency: string, years: number = 7): ERPMetadata {
  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  // Generate fiscal calendar periods covering currentYear through currentYear + years
  const fiscalCalendar: Array<{ year: number; period: number; startDate: string; endDate: string }> = [];
  for (let y = 0; y < years; y++) {
    const year = currentYear + y;
    for (let month = 1; month <= 12; month++) {
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      fiscalCalendar.push({
        year,
        period: month,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    }
  }

  return {
    erpSystem: 'default',
    erpVersion: '1.0.0',
    extractTimestamp: now,
    entities: [
      {
        erpEntityId: 'DEFAULT-CC',
        entityType: EntityType.COST_CENTER,
        displayName: 'Default Cost Center',
        parentId: null,
        attributes: {},
      },
    ],
    chartOfAccounts: [
      {
        accountId: 'DEFAULT-EXPENSE',
        accountName: 'Operating Expenses',
        accountType: AccountType.EXPENSE,
        naturalSign: NaturalSign.DEBIT,
        currency,
        isActive: true,
      },
      {
        accountId: 'DEFAULT-REVENUE',
        accountName: 'Revenue - Savings',
        accountType: AccountType.REVENUE,
        naturalSign: NaturalSign.CREDIT,
        currency,
        isActive: true,
      },
    ],
    costCenters: [
      {
        costCenterId: 'DEFAULT',
        name: 'Default Cost Center',
        parentCostCenterId: null,
        hierarchyLevel: 0,
        acceptsDirectCharges: true,
        currency,
        isActive: true,
      },
    ],
    fiscalCalendar,
    reportingCurrency: currency,
  };
}

/**
 * Generates a default CostBaseline stub for lightweight requests.
 */
function generateDefaultCostBaseline(
  baselineId: string,
  currency: string,
  _timeHorizonMonths: number
): CostBaseline {
  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  return {
    baselineId,
    snapshotTimestamp: now,
    costModelVersion: '1.0.0',
    laborRates: [
      {
        roleId: 'ENGINEER',
        roleName: 'Software Engineer',
        fullyLoadedRate: '125.0000',
        currency,
        effectiveDate: now,
      },
      {
        roleId: 'SENIOR_ENGINEER',
        roleName: 'Senior Software Engineer',
        fullyLoadedRate: '175.0000',
        currency,
        effectiveDate: now,
      },
      {
        roleId: 'MANAGER',
        roleName: 'Engineering Manager',
        fullyLoadedRate: '200.0000',
        currency,
        effectiveDate: now,
      },
    ],
    infrastructureCosts: [
      {
        resourceType: 'COMPUTE',
        unitCost: '0.0500',
        unit: 'per-hour',
        currency,
        effectiveDate: now,
      },
      {
        resourceType: 'STORAGE',
        unitCost: '0.0230',
        unit: 'per-GB-month',
        currency,
        effectiveDate: now,
      },
    ],
    licenseCosts: [
      {
        licenseType: 'PLATFORM',
        vendorName: 'Enterprise Platform',
        annualCost: '50000.0000',
        perUserCost: '500.0000',
        currency,
        effectiveDate: now,
      },
    ],
    overheadFactors: [
      {
        costCenterId: 'DEFAULT',
        directRate: 0.7,
        indirectRate: 0.2,
        sharedServicesRate: 0.1,
        effectiveDate: now,
      },
    ],
    riskWeights: [
      {
        categoryId: 'OPERATIONAL',
        categoryName: 'Operational Risk',
        baseWeight: 1.0,
        volatilityMultiplier: 0.5,
        confidenceDecayRate: 0.3,
        maxWeight: 2.5,
      },
      {
        categoryId: 'TECHNOLOGY',
        categoryName: 'Technology Risk',
        baseWeight: 1.2,
        volatilityMultiplier: 0.6,
        confidenceDecayRate: 0.25,
        maxWeight: 3.0,
      },
    ],
    discountRate: 0.1,
    baselinePeriod: `FY${currentYear}`,
  };
}

/**
 * Makes an HTTPS GET request and returns the response body as a string.
 */
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new SimulationResolverError(
          'FETCH_ERROR',
          `ruvector-service returned HTTP ${res.statusCode} for ${url}`
        ));
        res.resume();
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });

    req.on('error', (err) => {
      reject(new SimulationResolverError(
        'NETWORK_ERROR',
        `Failed to connect to ruvector-service: ${err.message}`
      ));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new SimulationResolverError(
        'TIMEOUT',
        `Request to ruvector-service timed out for ${url}`
      ));
    });
  });
}

export class SimulationResolverError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SimulationResolverError';
    this.code = code;
  }
}
