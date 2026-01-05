/**
 * Event Emitter for Enterprise ROI Engine
 *
 * Provides event emission and handler registration capabilities.
 * Supports event chaining, async handlers, and error handling.
 *
 * Per SPARC specification requirements for observability and integration.
 */

import { BaseEvent, EventType } from './types';
import { EventStore } from './EventStore';

/**
 * Handler function type for processing events.
 * Handlers can be synchronous or asynchronous.
 *
 * @template T - The specific event type this handler processes
 */
export interface EventHandler<T extends BaseEvent = BaseEvent> {
  (event: T): void | Promise<void>;
}

/**
 * Options for handler registration
 */
export interface HandlerOptions {
  /**
   * Priority for handler execution order (lower executes first)
   * Default: 100
   */
  readonly priority?: number;

  /**
   * Whether to continue executing other handlers if this one throws
   * Default: true
   */
  readonly continueOnError?: boolean;

  /**
   * Optional name for debugging and logging purposes
   */
  readonly name?: string;
}

/**
 * Internal representation of a registered handler
 */
interface RegisteredHandler<T extends BaseEvent = BaseEvent> {
  readonly handler: EventHandler<T>;
  readonly options: Required<HandlerOptions>;
  readonly id: string;
}

/**
 * Result of emitting an event
 */
export interface EmitResult {
  readonly event: BaseEvent;
  readonly handlerCount: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly errors: ReadonlyArray<{ handlerName: string; error: Error }>;
  readonly durationMs: number;
}

/**
 * Options for event emission
 */
export interface EmitOptions {
  /**
   * Whether to wait for all handlers to complete before returning
   * Default: true
   */
  readonly waitForHandlers?: boolean;

  /**
   * Timeout in milliseconds for handler execution
   * Default: 30000 (30 seconds)
   */
  readonly timeout?: number;

  /**
   * Whether to persist the event to the store before emitting
   * Default: true
   */
  readonly persist?: boolean;
}

/**
 * Event emitter with support for typed event handlers, priorities,
 * and event chaining.
 */
export class EventEmitter {
  private readonly handlers: Map<string, RegisteredHandler[]> = new Map();
  private readonly wildcardHandlers: RegisteredHandler[] = [];
  private handlerIdCounter: number = 0;
  private readonly eventStore: EventStore | undefined;

  /**
   * Creates a new EventEmitter instance.
   *
   * @param eventStore - Optional event store for automatic persistence
   */
  constructor(eventStore?: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Registers a handler for a specific event type.
   *
   * @template T - The event type to handle
   * @param eventType - The event type to listen for
   * @param handler - The handler function
   * @param options - Optional handler configuration
   * @returns A function to unregister the handler
   */
  on<T extends BaseEvent>(
    eventType: EventType | string,
    handler: EventHandler<T>,
    options: HandlerOptions = {}
  ): () => void {
    const registeredHandler = this.createRegisteredHandler(handler, options);

    const handlers = this.handlers.get(eventType) || [];
    handlers.push(registeredHandler as RegisteredHandler<BaseEvent>);
    handlers.sort((a, b) => a.options.priority - b.options.priority);
    this.handlers.set(eventType, handlers);

    // Return unsubscribe function
    return () => this.off(eventType, registeredHandler.id);
  }

  /**
   * Registers a handler for all event types (wildcard).
   *
   * @param handler - The handler function
   * @param options - Optional handler configuration
   * @returns A function to unregister the handler
   */
  onAll(handler: EventHandler<BaseEvent>, options: HandlerOptions = {}): () => void {
    const registeredHandler = this.createRegisteredHandler(handler, options);
    this.wildcardHandlers.push(registeredHandler);
    this.wildcardHandlers.sort((a, b) => a.options.priority - b.options.priority);

    return () => this.offAll(registeredHandler.id);
  }

  /**
   * Registers a handler that will only be called once.
   *
   * @template T - The event type to handle
   * @param eventType - The event type to listen for
   * @param handler - The handler function
   * @param options - Optional handler configuration
   * @returns A function to unregister the handler (if not yet called)
   */
  once<T extends BaseEvent>(
    eventType: EventType | string,
    handler: EventHandler<T>,
    options: HandlerOptions = {}
  ): () => void {
    let unsubscribe: () => void;

    const wrappedHandler: EventHandler<T> = async (event: T) => {
      unsubscribe();
      await handler(event);
    };

    unsubscribe = this.on(eventType, wrappedHandler, options);
    return unsubscribe;
  }

  /**
   * Unregisters a specific handler by ID.
   *
   * @param eventType - The event type
   * @param handlerId - The handler ID to remove
   */
  off(eventType: EventType | string, handlerId: string): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.findIndex((h) => h.id === handlerId);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Unregisters a wildcard handler by ID.
   *
   * @param handlerId - The handler ID to remove
   */
  offAll(handlerId: string): void {
    const index = this.wildcardHandlers.findIndex((h) => h.id === handlerId);
    if (index !== -1) {
      this.wildcardHandlers.splice(index, 1);
    }
  }

  /**
   * Removes all handlers for a specific event type.
   *
   * @param eventType - The event type to clear handlers for
   */
  removeAllListeners(eventType?: EventType | string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
      this.wildcardHandlers.length = 0;
    }
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event to emit
   * @param options - Emission options
   * @returns Result of the emission including any errors
   */
  async emit(event: BaseEvent, options: EmitOptions = {}): Promise<EmitResult> {
    const startTime = Date.now();
    const { waitForHandlers = true, timeout = 30000, persist = true } = options;

    // Persist to event store if configured
    if (persist && this.eventStore) {
      this.eventStore.append(event);
    }

    // Collect all handlers for this event
    const typeHandlers = this.handlers.get(event.type) || [];
    const allHandlers = [...typeHandlers, ...this.wildcardHandlers];

    const errors: Array<{ handlerName: string; error: Error }> = [];
    let successCount = 0;

    // Execute handlers
    const executeHandlers = async (): Promise<void> => {
      for (const registeredHandler of allHandlers) {
        try {
          const handlerPromise = Promise.resolve(registeredHandler.handler(event));

          if (timeout > 0) {
            await Promise.race([
              handlerPromise,
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Handler '${registeredHandler.options.name}' timed out`)),
                  timeout
                )
              ),
            ]);
          } else {
            await handlerPromise;
          }

          successCount++;
        } catch (error) {
          const handlerError = error instanceof Error ? error : new Error(String(error));
          errors.push({
            handlerName: registeredHandler.options.name,
            error: handlerError,
          });

          if (!registeredHandler.options.continueOnError) {
            throw handlerError;
          }
        }
      }
    };

    if (waitForHandlers) {
      await executeHandlers();
    } else {
      // Fire and forget, but still track errors
      executeHandlers().catch(() => {
        // Errors are tracked in the errors array
      });
    }

    return {
      event,
      handlerCount: allHandlers.length,
      successCount,
      errorCount: errors.length,
      errors: Object.freeze(errors),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Emits multiple events in sequence, supporting event chaining.
   * Each event is emitted only after the previous event's handlers complete.
   *
   * @param events - Array of events to emit in order
   * @param options - Emission options applied to all events
   * @returns Array of results for each event
   */
  async emitChain(events: BaseEvent[], options: EmitOptions = {}): Promise<EmitResult[]> {
    const results: EmitResult[] = [];

    for (const event of events) {
      const result = await this.emit(event, options);
      results.push(result);

      // Stop chain if there were errors and continueOnError is false
      if (result.errorCount > 0 && !options.waitForHandlers) {
        break;
      }
    }

    return results;
  }

  /**
   * Emits multiple events in parallel.
   *
   * @param events - Array of events to emit concurrently
   * @param options - Emission options applied to all events
   * @returns Array of results for each event
   */
  async emitParallel(events: BaseEvent[], options: EmitOptions = {}): Promise<EmitResult[]> {
    return Promise.all(events.map((event) => this.emit(event, options)));
  }

  /**
   * Gets the count of registered handlers for an event type.
   *
   * @param eventType - The event type to check (optional, returns total if not specified)
   * @returns The handler count
   */
  listenerCount(eventType?: EventType | string): number {
    if (eventType) {
      return (this.handlers.get(eventType)?.length || 0) + this.wildcardHandlers.length;
    }

    let total = this.wildcardHandlers.length;
    for (const handlers of this.handlers.values()) {
      total += handlers.length;
    }
    return total;
  }

  /**
   * Gets all registered event types.
   *
   * @returns Array of event type strings
   */
  eventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Creates a registered handler with defaults applied.
   */
  private createRegisteredHandler<T extends BaseEvent>(
    handler: EventHandler<T>,
    options: HandlerOptions
  ): RegisteredHandler<T> {
    const id = `handler_${++this.handlerIdCounter}`;
    return {
      handler,
      options: {
        priority: options.priority ?? 100,
        continueOnError: options.continueOnError ?? true,
        name: options.name ?? id,
      },
      id,
    };
  }
}

/**
 * Creates a typed event emitter for a specific event type.
 * Provides stronger type safety for single-event-type scenarios.
 */
export class TypedEventEmitter<T extends BaseEvent> {
  private readonly emitter: EventEmitter;
  private readonly eventType: EventType;

  constructor(eventType: EventType, eventStore?: EventStore) {
    this.emitter = new EventEmitter(eventStore);
    this.eventType = eventType;
  }

  on(handler: EventHandler<T>, options?: HandlerOptions): () => void {
    return this.emitter.on<T>(this.eventType, handler, options);
  }

  once(handler: EventHandler<T>, options?: HandlerOptions): () => void {
    return this.emitter.once<T>(this.eventType, handler, options);
  }

  async emit(event: T, options?: EmitOptions): Promise<EmitResult> {
    if (event.type !== this.eventType) {
      throw new Error(`Event type mismatch: expected '${this.eventType}', got '${event.type}'`);
    }
    return this.emitter.emit(event, options);
  }

  listenerCount(): number {
    return this.emitter.listenerCount(this.eventType);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners(this.eventType);
  }
}

/**
 * Event bus that combines multiple event emitters for complex event routing.
 */
export class EventBus {
  private readonly emitters: Map<string, EventEmitter> = new Map();
  private readonly defaultEmitter: EventEmitter;

  constructor(eventStore?: EventStore) {
    this.defaultEmitter = new EventEmitter(eventStore);
  }

  /**
   * Gets or creates a namespaced emitter.
   *
   * @param namespace - The namespace for the emitter
   * @returns The event emitter for this namespace
   */
  namespace(namespace: string): EventEmitter {
    let emitter = this.emitters.get(namespace);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(namespace, emitter);
    }
    return emitter;
  }

  /**
   * Emits an event to the default emitter and all namespace emitters.
   *
   * @param event - The event to emit
   * @param options - Emission options
   * @returns Combined results from all emitters
   */
  async broadcast(event: BaseEvent, options?: EmitOptions): Promise<EmitResult[]> {
    const results: EmitResult[] = [];

    // Emit to default emitter
    results.push(await this.defaultEmitter.emit(event, options));

    // Emit to all namespace emitters
    for (const emitter of this.emitters.values()) {
      results.push(await emitter.emit(event, options));
    }

    return results;
  }

  /**
   * Registers a handler on the default emitter.
   */
  on<T extends BaseEvent>(
    eventType: EventType | string,
    handler: EventHandler<T>,
    options?: HandlerOptions
  ): () => void {
    return this.defaultEmitter.on(eventType, handler, options);
  }

  /**
   * Emits to the default emitter only.
   */
  async emit(event: BaseEvent, options?: EmitOptions): Promise<EmitResult> {
    return this.defaultEmitter.emit(event, options);
  }
}
