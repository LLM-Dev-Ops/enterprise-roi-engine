#!/usr/bin/env node
/**
 * Agentics CLI - Quantify Commands
 *
 * Entry point for the agentics quantify CLI commands.
 *
 * Usage:
 *   agentics quantify create --name "My Projection" --resources '[...]'
 *   agentics quantify compare --baseline proj-001 --comparison proj-002
 *   agentics quantify list
 *   agentics quantify inspect --id proj-001
 */

import {
  quantifyCreate,
  quantifyCompare,
  quantifyList,
  quantifyInspect,
} from './commands/quantify';

import type {
  QuantifyCreateInput,
  QuantifyCompareInput,
  QuantifyListInput,
  QuantifyInspectInput,
} from './types';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface ParsedArgs {
  command: string;
  subcommand: string;
  options: Map<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    subcommand: '',
    options: new Map(),
  };

  let i = 0;

  // Skip node and script path
  while (i < args.length) {
    const arg = args[i];
    if (!arg) break;
    if (arg.includes('node') || arg.endsWith('.js') || arg.endsWith('.ts')) {
      i++;
    } else {
      break;
    }
  }

  // Get command (e.g., "quantify")
  if (i < args.length) {
    const arg = args[i];
    if (arg && !arg.startsWith('-')) {
      result.command = arg;
      i++;
    }
  }

  // Get subcommand (e.g., "create")
  if (i < args.length) {
    const arg = args[i];
    if (arg && !arg.startsWith('-')) {
      result.subcommand = arg;
      i++;
    }
  }

  // Parse options
  while (i < args.length) {
    const arg = args[i];
    if (!arg) {
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        result.options.set(key, nextArg);
        i += 2;
      } else {
        result.options.set(key, true);
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.substring(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        result.options.set(key, nextArg);
        i += 2;
      } else {
        result.options.set(key, true);
        i++;
      }
    } else {
      i++;
    }
  }

  return result;
}

function getStringOption(options: Map<string, string | boolean>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = options.get(key);
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function getBoolOption(options: Map<string, string | boolean>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = options.get(key);
    if (value === true) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleQuantifyCreate(options: Map<string, string | boolean>): Promise<void> {
  const name = getStringOption(options, 'name');
  const description = getStringOption(options, 'description');
  const environment = getStringOption(options, 'environment', 'env');
  const resourcesJson = getStringOption(options, 'resources');
  const timeHorizonStr = getStringOption(options, 'time-horizon', 'horizon');
  const baselineId = getStringOption(options, 'baseline');
  const pricingSource = getStringOption(options, 'pricing-source');

  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  if (!resourcesJson) {
    console.error('Error: --resources is required (JSON array)');
    process.exit(1);
  }

  let resources;
  try {
    resources = JSON.parse(resourcesJson);
  } catch {
    console.error('Error: --resources must be valid JSON');
    process.exit(1);
  }

  // Build input with only defined properties
  const input: QuantifyCreateInput = {
    name,
    resources,
  };

  // Add optional properties only if defined
  const inputWithOptionals: Record<string, unknown> = { ...input };
  if (description) inputWithOptionals['description'] = description;
  if (environment === 'development' || environment === 'staging' || environment === 'production') {
    inputWithOptionals['target_environment'] = environment;
  }
  if (timeHorizonStr) inputWithOptionals['time_horizon_months'] = parseInt(timeHorizonStr, 10);
  if (baselineId) inputWithOptionals['baseline_id'] = baselineId;
  if (pricingSource) inputWithOptionals['pricing_source'] = pricingSource;

  const result = await quantifyCreate(inputWithOptionals as unknown as QuantifyCreateInput);

  console.log(JSON.stringify(result, null, 2));
}

async function handleQuantifyCompare(options: Map<string, string | boolean>): Promise<void> {
  const baselineId = getStringOption(options, 'baseline', 'b');
  const comparisonId = getStringOption(options, 'comparison', 'c');
  const environment = getStringOption(options, 'environment', 'env');
  const comparisonType = getStringOption(options, 'type');
  const noVariance = getBoolOption(options, 'no-variance');

  if (!baselineId) {
    console.error('Error: --baseline is required');
    process.exit(1);
  }

  if (!comparisonId) {
    console.error('Error: --comparison is required');
    process.exit(1);
  }

  // Build input with required properties
  const inputWithOptionals: Record<string, unknown> = {
    baseline_id: baselineId,
    comparison_id: comparisonId,
    include_variance_analysis: !noVariance,
  };

  // Add optional properties only if defined
  if (environment === 'development' || environment === 'staging' || environment === 'production') {
    inputWithOptionals['target_environment'] = environment;
  }
  if (comparisonType === 'cost' || comparisonType === 'resource' || comparisonType === 'full') {
    inputWithOptionals['comparison_type'] = comparisonType;
  }

  const result = await quantifyCompare(inputWithOptionals as unknown as QuantifyCompareInput);

  console.log(JSON.stringify(result, null, 2));
}

async function handleQuantifyList(options: Map<string, string | boolean>): Promise<void> {
  const status = getStringOption(options, 'status');
  const limitStr = getStringOption(options, 'limit');
  const offsetStr = getStringOption(options, 'offset');
  const nameContains = getStringOption(options, 'name');

  const inputWithOptionals: Record<string, unknown> = {};

  // Build filter if any filter options provided
  const filterOpts: Record<string, unknown> = {};
  if (status === 'active' || status === 'archived' || status === 'all') {
    filterOpts['status'] = status;
  }
  if (nameContains) {
    filterOpts['name_contains'] = nameContains;
  }
  if (Object.keys(filterOpts).length > 0) {
    inputWithOptionals['filter'] = filterOpts;
  }

  if (limitStr) inputWithOptionals['limit'] = parseInt(limitStr, 10);
  if (offsetStr) inputWithOptionals['offset'] = parseInt(offsetStr, 10);

  const result = await quantifyList(inputWithOptionals as QuantifyListInput);

  console.log(JSON.stringify(result, null, 2));
}

async function handleQuantifyInspect(options: Map<string, string | boolean>): Promise<void> {
  const projectionId = getStringOption(options, 'id', 'projection');
  const includeHistory = getBoolOption(options, 'history');
  const includeAssumptions = getBoolOption(options, 'assumptions');

  if (!projectionId) {
    console.error('Error: --id is required');
    process.exit(1);
  }

  const inputWithOptionals: Record<string, unknown> = {
    projection_id: projectionId,
  };

  if (includeHistory) inputWithOptionals['include_history'] = true;
  if (includeAssumptions) inputWithOptionals['include_assumptions'] = true;

  const result = await quantifyInspect(inputWithOptionals as unknown as QuantifyInspectInput);

  console.log(JSON.stringify(result, null, 2));
}

// ============================================================================
// Help Text
// ============================================================================

function showHelp(): void {
  console.log(`
Agentics Quantify CLI

USAGE:
  agentics quantify <subcommand> [options]

SUBCOMMANDS:
  create      Create a new cost/resource projection (includes synthesis)
  compare     Compare two projections (includes synthesis)
  list        List all projections (read-only, no synthesis)
  inspect     Inspect projection details (read-only, no synthesis)

EXAMPLES:
  # Create a projection
  agentics quantify create --name "Production Env" --resources '[{"resource_type":"compute-instance","quantity":10,"unit":"instances"}]'

  # Compare projections
  agentics quantify compare --baseline proj-001 --comparison proj-002

  # List projections
  agentics quantify list --status active --limit 10

  # Inspect a projection
  agentics quantify inspect --id proj-001 --history --assumptions

OPTIONS:
  create:
    --name            Projection name (required)
    --description     Projection description
    --resources       JSON array of resources (required)
    --environment     Target environment (development|staging|production)
    --time-horizon    Time horizon in months
    --baseline        Baseline ID for comparison
    --pricing-source  Pricing data source

  compare:
    --baseline, -b    Baseline projection ID (required)
    --comparison, -c  Comparison projection ID (required)
    --environment     Target environment
    --type            Comparison type (cost|resource|full)
    --no-variance     Skip variance analysis

  list:
    --status          Filter by status (active|archived|all)
    --limit           Maximum results
    --offset          Pagination offset
    --name            Filter by name contains

  inspect:
    --id              Projection ID (required)
    --history         Include version history
    --assumptions     Include assumptions

SYNTHESIS:
  The 'create' and 'compare' commands include executive synthesis
  Decision Packets containing:
  - Confidence intervals for projection accuracy
  - Data freshness timestamps
  - Flagged assumptions and methodology disclosure

  The 'list' and 'inspect' commands are read-only and do NOT
  include synthesis.
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.command !== 'quantify') {
    if (getBoolOption(parsed.options, 'help', 'h')) {
      showHelp();
      return;
    }
    console.error('Unknown command. Use "agentics quantify <subcommand>" or --help');
    process.exit(1);
  }

  if (getBoolOption(parsed.options, 'help', 'h')) {
    showHelp();
    return;
  }

  try {
    switch (parsed.subcommand) {
      case 'create':
        await handleQuantifyCreate(parsed.options);
        break;
      case 'compare':
        await handleQuantifyCompare(parsed.options);
        break;
      case 'list':
        await handleQuantifyList(parsed.options);
        break;
      case 'inspect':
        await handleQuantifyInspect(parsed.options);
        break;
      default:
        if (!parsed.subcommand) {
          console.error('Error: subcommand required. Use "agentics quantify <create|compare|list|inspect>"');
        } else {
          console.error(`Unknown subcommand: ${parsed.subcommand}`);
        }
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for programmatic use
export {
  quantifyCreate,
  quantifyCompare,
  quantifyList,
  quantifyInspect,
};

export type {
  QuantifyCreateInput,
  QuantifyCompareInput,
  QuantifyListInput,
  QuantifyInspectInput,
};
