/**
 * EventBus - Centralized event system for chat components
 * Location: /src/events/EventBus.ts
 *
 * Purpose: Replace 4-layer delegation chains with direct pub-sub pattern.
 * Eliminates tight coupling between components while maintaining type safety.
 *
 * Benefits:
 * - No delegation chains (Service → View → Display → Bubble)
 * - Components subscribe directly to events they care about
 * - Type-safe event payloads via ChatEvents.ts
 * - Wildcard listeners for debugging/logging
 * - Synchronous and asynchronous emission support
 *
 * Usage:
 * ```typescript
 * // Subscribe to event
 * const unsubscribe = eventBus.on('branch.finalized', (event) => {
 *   console.log('Branch finalized:', event.branchId);
 * });
 *
 * // Emit event (async)
 * await eventBus.emit('branch.finalized', {
 *   messageId: '123',
 *   branchId: 'branch_456',
 *   branch: branchData,
 *   message: messageData,
 *   finalStatus: 'complete'
 * });
 *
 * // Unsubscribe
 * unsubscribe();
 * ```
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>;

export class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private wildcardListeners: Set<EventHandler<{ event: string; data: any }>> = new Set();

  /**
   * Subscribe to an event
   * @param event Event name (e.g., 'branch.finalized')
   * @param handler Callback function to handle event data
   * @returns Unsubscribe function
   */
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to all events (wildcard listener)
   * Useful for debugging and logging
   * @param handler Callback receiving {event, data} for all events
   * @returns Unsubscribe function
   */
  onAll(handler: EventHandler<{ event: string; data: any }>): () => void {
    this.wildcardListeners.add(handler);

    // Return unsubscribe function
    return () => this.wildcardListeners.delete(handler);
  }

  /**
   * Unsubscribe from an event
   * @param event Event name
   * @param handler Handler to remove
   */
  off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      // Clean up empty listener sets
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event asynchronously
   * Handlers are called sequentially with error handling
   * @param event Event name
   * @param data Event payload
   */
  async emit<T = any>(event: string, data: T): Promise<void> {
    // Call specific listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`[EventBus] Error in handler for event '${event}':`, error);
        }
      }
    }

    // Call wildcard listeners
    for (const handler of this.wildcardListeners) {
      try {
        await handler({ event, data });
      } catch (error) {
        console.error(`[EventBus] Error in wildcard handler for event '${event}':`, error);
      }
    }
  }

  /**
   * Emit an event synchronously
   * Handlers are called immediately (no await)
   * Use for time-critical events where async overhead is unacceptable
   * @param event Event name
   * @param data Event payload
   */
  emitSync<T = any>(event: string, data: T): void {
    // Call specific listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(data);
          // If handler returns a Promise, catch rejections but don't wait
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`[EventBus] Error in async handler for event '${event}':`, error);
            });
          }
        } catch (error) {
          console.error(`[EventBus] Error in handler for event '${event}':`, error);
        }
      }
    }

    // Call wildcard listeners
    for (const handler of this.wildcardListeners) {
      try {
        const result = handler({ event, data });
        if (result instanceof Promise) {
          result.catch(error => {
            console.error(`[EventBus] Error in wildcard handler for event '${event}':`, error);
          });
        }
      } catch (error) {
        console.error(`[EventBus] Error in wildcard handler for event '${event}':`, error);
      }
    }
  }

  /**
   * Clear all event listeners
   * Useful for cleanup during testing or component unmounting
   */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  /**
   * Get count of listeners for an event (for debugging)
   * @param event Event name (optional - returns total if omitted)
   * @returns Number of listeners
   */
  getListenerCount(event?: string): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    // Total count across all events + wildcards
    let total = this.wildcardListeners.size;
    for (const handlers of this.listeners.values()) {
      total += handlers.size;
    }
    return total;
  }
}

/**
 * Singleton instance for global event bus
 * Import and use this instance throughout the application
 */
export const eventBus = new EventBus();
