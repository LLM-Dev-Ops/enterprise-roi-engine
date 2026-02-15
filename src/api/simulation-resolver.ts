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
import { AccountType, NaturalSign } from '../contracts/common';
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

  const erpMetadata = generateDefaultERPMetadata(currency);
  const costBaseline = generateDefaultCostBaseline(
    simulation.scenario.baselineId,
    currency,
    timeHorizonMonths
  );

  return { simulation, erpMetadata, costBaseline };
}

/**
 * Resolves inline simulation data into a SimulationOutput.
 * Uses the data directly if it already matches the expected shape,
 * otherwise normalizes it (same logic as the ruvector fetch path).
 */
function resolveInlineSimulation(data: Record<string, unknown>, simulationId: string): SimulationOutput {
  // The inline payload may wrap the simulation in a data envelope
  const unwrapped = ('data' in data && typeof data['data'] === 'object' && data['data'] !== null)
    ? data['data']
    : data;

  if (isSimulationOutput(unwrapped)) {
    return unwrapped as SimulationOutput;
  }

  return normalizeUpstreamSimulation(unwrapped, simulationId);
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
 */
function generateDefaultERPMetadata(currency: string): ERPMetadata {
  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();

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
    fiscalCalendar: [
      {
        year: currentYear,
        period: 1,
        startDate: `${currentYear}-01-01T00:00:00.000Z`,
        endDate: `${currentYear}-01-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 2,
        startDate: `${currentYear}-02-01T00:00:00.000Z`,
        endDate: `${currentYear}-02-28T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 3,
        startDate: `${currentYear}-03-01T00:00:00.000Z`,
        endDate: `${currentYear}-03-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 4,
        startDate: `${currentYear}-04-01T00:00:00.000Z`,
        endDate: `${currentYear}-04-30T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 5,
        startDate: `${currentYear}-05-01T00:00:00.000Z`,
        endDate: `${currentYear}-05-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 6,
        startDate: `${currentYear}-06-01T00:00:00.000Z`,
        endDate: `${currentYear}-06-30T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 7,
        startDate: `${currentYear}-07-01T00:00:00.000Z`,
        endDate: `${currentYear}-07-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 8,
        startDate: `${currentYear}-08-01T00:00:00.000Z`,
        endDate: `${currentYear}-08-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 9,
        startDate: `${currentYear}-09-01T00:00:00.000Z`,
        endDate: `${currentYear}-09-30T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 10,
        startDate: `${currentYear}-10-01T00:00:00.000Z`,
        endDate: `${currentYear}-10-31T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 11,
        startDate: `${currentYear}-11-01T00:00:00.000Z`,
        endDate: `${currentYear}-11-30T23:59:59.999Z`,
      },
      {
        year: currentYear,
        period: 12,
        startDate: `${currentYear}-12-01T00:00:00.000Z`,
        endDate: `${currentYear}-12-31T23:59:59.999Z`,
      },
    ],
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
