/**
 * API Route Definitions
 * Framework-agnostic route definitions for the Enterprise ROI Engine API.
 * Can be adapted to Express, Fastify, Koa, or any other HTTP framework.
 */

import {
  ROIEngineRequest,
  ValidationRequest,
  ErrorResponse,
  HTTPStatus,
  APIErrorCode,
} from './types';

import {
  handleCalculateROI,
  handleValidateInput,
  handleHealthCheck,
  handleGetArtifact,
  HandlerContext,
} from './handlers';

import {
  extractCorrelationId,
  validateContentType,
  errorHandler,
  ErrorContext,
  CORRELATION_ID_HEADER,
} from './middleware';

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * HTTP method types.
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/**
 * Route definition interface.
 */
export interface RouteDefinition {
  /**
   * HTTP method.
   */
  readonly method: HTTPMethod;

  /**
   * Route path pattern (using :param syntax for path parameters).
   */
  readonly path: string;

  /**
   * Route description for documentation.
   */
  readonly description: string;

  /**
   * Operation ID for OpenAPI.
   */
  readonly operationId: string;

  /**
   * Tags for grouping in documentation.
   */
  readonly tags: readonly string[];

  /**
   * Whether the route requires authentication.
   */
  readonly authenticated: boolean;

  /**
   * Request content type.
   */
  readonly requestContentType?: string;

  /**
   * Response content type.
   */
  readonly responseContentType: string;
}

/**
 * All route definitions for the API.
 */
export const ROUTE_DEFINITIONS: readonly RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/v1/calculate',
    description: 'Calculate ROI based on simulation, ERP, and cost baseline inputs',
    operationId: 'calculateROI',
    tags: ['Calculation'],
    authenticated: false,
    requestContentType: 'application/json',
    responseContentType: 'application/json',
  },
  {
    method: 'POST',
    path: '/api/v1/validate',
    description: 'Validate inputs without performing calculation',
    operationId: 'validateInputs',
    tags: ['Validation'],
    authenticated: false,
    requestContentType: 'application/json',
    responseContentType: 'application/json',
  },
  {
    method: 'GET',
    path: '/api/v1/health',
    description: 'Check API health status',
    operationId: 'healthCheck',
    tags: ['Health'],
    authenticated: false,
    responseContentType: 'application/json',
  },
  {
    method: 'GET',
    path: '/api/v1/artifacts/:id',
    description: 'Retrieve an artifact bundle by ID',
    operationId: 'getArtifact',
    tags: ['Artifacts'],
    authenticated: false,
    responseContentType: 'application/json',
  },
];

// ============================================================================
// Route Handler Types
// ============================================================================

/**
 * Generic request interface for framework adaptation.
 */
export interface GenericRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | undefined>;
  readonly body?: unknown;
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
}

/**
 * Generic response interface for framework adaptation.
 */
export interface GenericResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Route handler function type.
 */
export type RouteHandler = (
  request: GenericRequest,
  context: HandlerContext
) => Promise<GenericResponse>;

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Creates a response object.
 */
function createResponse(
  status: number,
  body: unknown,
  correlationId: string
): GenericResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      [CORRELATION_ID_HEADER]: correlationId,
    },
    body,
  };
}

/**
 * Handler for POST /api/v1/calculate
 */
export async function calculateHandler(
  request: GenericRequest,
  context: HandlerContext
): Promise<GenericResponse> {
  const correlationId = extractCorrelationId(request.headers as Record<string, string>);

  try {
    // Validate content type
    const contentTypeResult = validateContentType(request.headers['content-type']);
    if (!contentTypeResult.success) {
      return createResponse(
        contentTypeResult.httpStatus ?? HTTPStatus.BAD_REQUEST,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: contentTypeResult.error,
        } as ErrorResponse,
        correlationId
      );
    }

    // Parse and execute
    const roiRequest = request.body as ROIEngineRequest;
    const response = await handleCalculateROI(
      { ...roiRequest, correlationId },
      context
    );

    const status = response.status === 'SUCCESS'
      ? HTTPStatus.OK
      : HTTPStatus.INTERNAL_SERVER_ERROR;

    return createResponse(status, response, correlationId);
  } catch (error) {
    const errorContext: ErrorContext = {
      correlationId,
      path: request.path,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    const { response, httpStatus } = errorHandler(error, errorContext);
    return createResponse(httpStatus, response, correlationId);
  }
}

/**
 * Handler for POST /api/v1/validate
 */
export async function validateHandler(
  request: GenericRequest,
  context: HandlerContext
): Promise<GenericResponse> {
  const correlationId = extractCorrelationId(request.headers as Record<string, string>);

  try {
    // Validate content type
    const contentTypeResult = validateContentType(request.headers['content-type']);
    if (!contentTypeResult.success) {
      return createResponse(
        contentTypeResult.httpStatus ?? HTTPStatus.BAD_REQUEST,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: contentTypeResult.error,
        } as ErrorResponse,
        correlationId
      );
    }

    const validationRequest = request.body as ValidationRequest;
    const response = await handleValidateInput(
      { ...validationRequest, correlationId },
      context
    );

    return createResponse(HTTPStatus.OK, response, correlationId);
  } catch (error) {
    const errorContext: ErrorContext = {
      correlationId,
      path: request.path,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    const { response, httpStatus } = errorHandler(error, errorContext);
    return createResponse(httpStatus, response, correlationId);
  }
}

/**
 * Handler for GET /api/v1/health
 */
export async function healthHandler(
  request: GenericRequest,
  context: HandlerContext
): Promise<GenericResponse> {
  const correlationId = extractCorrelationId(request.headers as Record<string, string>);

  try {
    const response = handleHealthCheck(context);
    return createResponse(HTTPStatus.OK, response, correlationId);
  } catch (error) {
    const errorContext: ErrorContext = {
      correlationId,
      path: request.path,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    const { response, httpStatus } = errorHandler(error, errorContext);
    return createResponse(httpStatus, response, correlationId);
  }
}

/**
 * Handler for GET /api/v1/artifacts/:id
 */
export async function getArtifactHandler(
  request: GenericRequest,
  context: HandlerContext
): Promise<GenericResponse> {
  const correlationId = extractCorrelationId(request.headers as Record<string, string>);

  try {
    const artifactId = request.params?.['id'];

    if (!artifactId) {
      return createResponse(
        HTTPStatus.BAD_REQUEST,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: {
            code: APIErrorCode.MISSING_REQUIRED_FIELD,
            message: 'Artifact ID is required',
          },
        } as ErrorResponse,
        correlationId
      );
    }

    const artifact = await handleGetArtifact(artifactId, context);

    if (!artifact) {
      return createResponse(
        HTTPStatus.NOT_FOUND,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: {
            code: APIErrorCode.ARTIFACT_NOT_FOUND,
            message: `Artifact not found: ${artifactId}`,
          },
        } as ErrorResponse,
        correlationId
      );
    }

    return createResponse(HTTPStatus.OK, artifact, correlationId);
  } catch (error) {
    const errorContext: ErrorContext = {
      correlationId,
      path: request.path,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    const { response, httpStatus } = errorHandler(error, errorContext);
    return createResponse(httpStatus, response, correlationId);
  }
}

// ============================================================================
// Router Class
// ============================================================================

/**
 * Framework-agnostic router for the API.
 */
export class Router {
  private readonly context: HandlerContext;
  private readonly handlers: Map<string, RouteHandler>;

  constructor(context: HandlerContext) {
    this.context = context;
    this.handlers = new Map();

    // Register handlers
    this.handlers.set('POST /api/v1/calculate', calculateHandler);
    this.handlers.set('POST /api/v1/validate', validateHandler);
    this.handlers.set('GET /api/v1/health', healthHandler);
    this.handlers.set('GET /api/v1/artifacts/:id', getArtifactHandler);
  }

  /**
   * Routes a request to the appropriate handler.
   */
  async route(request: GenericRequest): Promise<GenericResponse> {
    // Find matching route
    const routeKey = this.findRoute(request.method, request.path);

    if (!routeKey) {
      const correlationId = extractCorrelationId(request.headers as Record<string, string>);
      return createResponse(
        HTTPStatus.NOT_FOUND,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: {
            code: APIErrorCode.RESOURCE_NOT_FOUND,
            message: `Route not found: ${request.method} ${request.path}`,
          },
        } as ErrorResponse,
        correlationId
      );
    }

    const handler = this.handlers.get(routeKey);
    if (!handler) {
      const correlationId = extractCorrelationId(request.headers as Record<string, string>);
      return createResponse(
        HTTPStatus.INTERNAL_SERVER_ERROR,
        {
          correlationId,
          timestamp: new Date().toISOString(),
          apiVersion: 'v1',
          error: {
            code: APIErrorCode.INTERNAL_ERROR,
            message: 'Handler not found for route',
          },
        } as ErrorResponse,
        correlationId
      );
    }

    // Extract path parameters
    const params = this.extractPathParams(routeKey, request.path);
    const enrichedRequest = {
      ...request,
      params: { ...request.params, ...params },
    };

    return handler(enrichedRequest, this.context);
  }

  /**
   * Finds a matching route key for the given method and path.
   */
  private findRoute(method: string, path: string): string | null {
    // Exact match first
    const exactKey = `${method} ${path}`;
    if (this.handlers.has(exactKey)) {
      return exactKey;
    }

    // Pattern matching for parameterized routes
    for (const key of this.handlers.keys()) {
      const [routeMethod, routePath] = key.split(' ');
      if (routeMethod !== method) continue;

      if (routePath && this.matchPath(routePath, path)) {
        return key;
      }
    }

    return null;
  }

  /**
   * Matches a path pattern against a request path.
   */
  private matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      // Skip if either part is undefined
      if (patternPart === undefined || pathPart === undefined) {
        return false;
      }

      // Parameter match
      if (patternPart.startsWith(':')) {
        continue;
      }

      // Exact match required
      if (patternPart !== pathPart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extracts path parameters from a URL.
   */
  private extractPathParams(
    pattern: string,
    path: string
  ): Record<string, string> {
    const params: Record<string, string> = {};
    const patternPath = pattern.split(' ')[1];
    if (!patternPath) {
      return params;
    }
    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart !== undefined && pathPart !== undefined && patternPart.startsWith(':')) {
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      }
    }

    return params;
  }

  /**
   * Gets all registered route definitions.
   */
  getRouteDefinitions(): readonly RouteDefinition[] {
    return ROUTE_DEFINITIONS;
  }
}

/**
 * Creates a new router instance.
 */
export function createRouter(context: HandlerContext): Router {
  return new Router(context);
}
