import { EventTypes, TypedEventEmitter } from "../types";

/**
 * A type-safe event emitter implementation.
 * Allows components to subscribe to and emit events with type checking
 * based on the provided EventTypes interface.
 *
 * This emitter is central to the decoupled architecture, enabling communication
 * between different parts of the plugin (Core, BCPs, Chat, MCP) without
 * direct dependencies.
 */
export class EventEmitter<T extends EventTypes = EventTypes> implements TypedEventEmitter<T> {
  // Using a Map to store handlers for each event type.
  // The key is the event name (string), and the value is a Set of handler functions.
  // Using a Set ensures that the same handler isn't added multiple times for the same event.
  private handlers: Map<keyof T, Set<(data: any) => void>> = new Map();

  /**
   * Emits an event with the specified name and data.
   * All registered handlers for this event name will be called with the data.
   * @template K The specific event name (must be a key of T).
   * @param event The name of the event to emit.
   * @param data The data payload for the event.
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      // Iterate over a copy of the Set to avoid issues if a handler modifies the Set during iteration.
      [...eventHandlers].forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
          // Optionally, emit an 'error' event or implement more robust error handling.
        }
      });
    }
  }

  /**
   * Registers an event handler for the specified event name.
   * The handler will be called every time the event is emitted.
   * @template K The specific event name (must be a key of T).
   * @param event The name of the event to listen for.
   * @param handler The function to call when the event is emitted.
   */
  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  /**
   * Unregisters an event handler for the specified event name.
   * Removes the specific handler function from the list of listeners for that event.
   * @template K The specific event name (must be a key of T).
   * @param event The name of the event to stop listening to.
   * @param handler The specific handler function to remove.
   */
  off<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
      // If no handlers remain for this event, remove the event entry from the map.
      if (eventHandlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Registers an event handler that will be called only once for the specified event name.
   * After the handler is called the first time, it is automatically unregistered.
   * @template K The specific event name (must be a key of T).
   * @param event The name of the event to listen for.
   * @param handler The function to call once when the event is emitted.
   */
  once<K extends keyof T>(event: K, handler: (data: T[K]) => void): void {
    // Create a wrapper function that calls the original handler and then removes itself.
    const onceWrapper = (data: T[K]) => {
      try {
        handler(data);
      } finally {
        // Ensure the handler is removed even if it throws an error.
        this.off(event, onceWrapper);
      }
    };
    // Register the wrapper function using 'on'.
    this.on(event, onceWrapper);
  }

  /**
   * Removes all event handlers for a specific event, or all handlers if no event is specified.
   * Use with caution, as this can disrupt communication patterns.
   * @param event Optional. The name of the event for which to remove all handlers.
   *              If omitted, all handlers for all events will be removed.
   */
  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Gets the number of listeners registered for a specific event.
   * @param event The name of the event.
   * @returns The number of listeners for the event.
   */
  listenerCount<K extends keyof T>(event: K): number {
    return this.handlers.get(event)?.size || 0;
  }
}

// Optional: Export a singleton instance if needed throughout the app
// export const globalEventEmitter = new EventEmitter<CoreEventTypes & ChatEventTypes & MCPEventTypes>();
