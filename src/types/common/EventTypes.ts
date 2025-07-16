/**
 * Event System Types
 * Extracted from types.ts for better organization
 */

/**
 * Event data structure
 */
export interface EventData<T = any> {
  eventName: string;
  data: T;
}

/**
 * Event subscriber function type
 */
export interface EventSubscriber<T = any> {
  (data: T): void;
}