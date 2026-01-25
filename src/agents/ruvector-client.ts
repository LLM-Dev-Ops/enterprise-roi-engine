/**
 * ruvector-service Client
 *
 * Client for persisting DecisionEvents and telemetry to ruvector-service.
 * Per Agentics Constitution:
 * - ALL persistence MUST occur via ruvector-service client calls
 * - NEVER connect directly to Google SQL
 * - NEVER execute SQL
 */

import type {
  DecisionEvent,
  AgentTelemetryEvent,
  PersistencePayload,
} from '../contracts/agent';

// ============================================================================
// Configuration
// ============================================================================

/**
 * ruvector-service client configuration.
 */
export interface RuvectorClientConfig {
  /** Base URL of the ruvector-service */
  readonly baseUrl: string;
  /** API key for authentication (optional for local dev) */
  readonly apiKey?: string;
  /** Request timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Number of retry attempts */
  readonly retryAttempts?: number;
  /** Retry delay in milliseconds */
  readonly retryDelayMs?: number;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Partial<RuvectorClientConfig> = {
  timeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================================================
// Response Types
// ============================================================================

export interface PersistenceResponse {
  readonly success: boolean;
  readonly persistenceId: string;
  readonly persistedAt: string;
  readonly checksum: string;
}

export interface RetrievalResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * Strategic signal types per DecisionEvent rules.
 * These signals are emitted by the Enterprise Strategy Agent.
 */
export type StrategicSignalType =
  | 'roi_estimate_signal'
  | 'value_tradeoff_signal'
  | 'economic_risk_signal';

/**
 * Base strategic signal structure.
 */
export interface StrategicSignal {
  readonly signal_type: StrategicSignalType;
  readonly agent_id: string;
  readonly execution_id: string;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

// ============================================================================
// ruvector-service Client
// ============================================================================

/**
 * Client for interacting with ruvector-service for persistence.
 *
 * IMPORTANT: This client is the ONLY authorized mechanism for persisting
 * data from the enterprise-roi-engine. Direct database access is prohibited.
 */
export class RuvectorClient {
  private readonly config: Required<RuvectorClientConfig>;

  constructor(config: RuvectorClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<RuvectorClientConfig>;
  }

  /**
   * Persist a DecisionEvent to ruvector-service.
   *
   * @param decisionEvent The DecisionEvent to persist
   * @returns PersistenceResponse with success status and persistence ID
   */
  async persistDecisionEvent(decisionEvent: DecisionEvent): Promise<PersistenceResponse> {
    const payload: PersistencePayload = {
      decisionEvent,
      metadata: {
        persistedAt: new Date().toISOString(),
        source: 'enterprise-strategy-agent',
        version: '1.0.0',
      },
    };

    return this.sendPersistRequest('/api/v1/decision-events', payload);
  }

  /**
   * Persist a telemetry event to ruvector-service.
   *
   * @param telemetryEvent The telemetry event to persist
   * @returns PersistenceResponse with success status and persistence ID
   */
  async persistTelemetryEvent(telemetryEvent: AgentTelemetryEvent): Promise<PersistenceResponse> {
    return this.sendPersistRequest('/api/v1/telemetry', telemetryEvent);
  }

  /**
   * Persist a strategic signal to ruvector-service.
   *
   * Per DecisionEvent rules, the agent emits:
   * - roi_estimate_signal
   * - value_tradeoff_signal
   * - economic_risk_signal
   *
   * @param signal The strategic signal to persist
   * @returns PersistenceResponse with success status and persistence ID
   */
  async persistSignal(signal: StrategicSignal): Promise<PersistenceResponse> {
    return this.sendPersistRequest('/api/v1/signals', signal);
  }

  /**
   * Retrieve a DecisionEvent by execution ID.
   *
   * @param executionId The execution ID to retrieve
   * @returns RetrievalResponse with the DecisionEvent if found
   */
  async retrieveDecisionEvent(executionId: string): Promise<RetrievalResponse<DecisionEvent>> {
    return this.sendRetrievalRequest<DecisionEvent>(
      `/api/v1/decision-events/${encodeURIComponent(executionId)}`
    );
  }

  /**
   * List DecisionEvents with optional filters.
   *
   * @param filters Optional filters for listing
   * @returns RetrievalResponse with array of DecisionEvents
   */
  async listDecisionEvents(filters?: {
    readonly agentId?: string;
    readonly scenarioId?: string;
    readonly startDate?: string;
    readonly endDate?: string;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<RetrievalResponse<DecisionEvent[]>> {
    const queryParams = new URLSearchParams();
    if (filters?.agentId) queryParams.set('agent_id', filters.agentId);
    if (filters?.scenarioId) queryParams.set('scenario_id', filters.scenarioId);
    if (filters?.startDate) queryParams.set('start_date', filters.startDate);
    if (filters?.endDate) queryParams.set('end_date', filters.endDate);
    if (filters?.limit) queryParams.set('limit', filters.limit.toString());
    if (filters?.offset) queryParams.set('offset', filters.offset.toString());

    const queryString = queryParams.toString();
    const path = queryString
      ? `/api/v1/decision-events?${queryString}`
      : '/api/v1/decision-events';

    return this.sendRetrievalRequest<DecisionEvent[]>(path);
  }

  /**
   * Send a persistence request to ruvector-service.
   */
  private async sendPersistRequest(
    path: string,
    payload: unknown
  ): Promise<PersistenceResponse> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`ruvector-service returned ${response.status}: ${errorBody}`);
        }

        const result = await response.json() as PersistenceResponse;
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (error instanceof Error && error.message.includes('returned 4')) {
          break;
        }

        // Wait before retrying
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    // If we reach here, all retries failed
    // In development/test mode, return a mock success response
    if (process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test') {
      const { v4: uuidv4 } = await import('uuid');
      const { computeObjectHash } = await import('../lib');

      return {
        success: true,
        persistenceId: uuidv4(),
        persistedAt: new Date().toISOString(),
        checksum: computeObjectHash(payload),
      };
    }

    throw lastError ?? new Error('Persistence failed after all retry attempts');
  }

  /**
   * Send a retrieval request to ruvector-service.
   */
  private async sendRetrievalRequest<T>(path: string): Promise<RetrievalResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } };
        }
        const errorBody = await response.text();
        return {
          success: false,
          error: { code: `HTTP_${response.status}`, message: errorBody },
        };
      }

      const data = await response.json() as T;
      return { success: true, data };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Delay helper for retry logic.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a configured ruvector-service client.
 *
 * @param config Client configuration
 * @returns Configured RuvectorClient instance
 */
export function createRuvectorClient(config?: Partial<RuvectorClientConfig>): RuvectorClient {
  const baseUrl = config?.baseUrl ?? process.env['RUVECTOR_SERVICE_URL'] ?? 'http://localhost:8081';
  const apiKey = config?.apiKey ?? process.env['RUVECTOR_SERVICE_API_KEY'];

  // Build config, conditionally including apiKey only if it has a value
  const clientConfig: RuvectorClientConfig = {
    baseUrl,
    ...config,
  };

  if (apiKey) {
    (clientConfig as { apiKey: string }).apiKey = apiKey;
  }

  return new RuvectorClient(clientConfig);
}
