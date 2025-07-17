/**
 * Interface for managing initialization state across the plugin
 * Follows Single Responsibility Principle - only manages initialization state
 * Follows Interface Segregation Principle - focused interface for state management
 */

export interface InitializationResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  timestamp: number;
}

export interface InitializationState {
  isInitializing: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  startTime?: number;
  endTime?: number;
  error?: Error;
}

export interface IInitializationStateManager {
  /**
   * Ensures a component is initialized exactly once
   * Uses mutex pattern to prevent race conditions
   */
  ensureInitialized<T>(
    key: string, 
    initializer: () => Promise<T>,
    timeout?: number
  ): Promise<InitializationResult<T>>;

  /**
   * Check if a component is already initialized
   */
  isInitialized(key: string): boolean;

  /**
   * Check if a component is currently initializing
   */
  isInitializing(key: string): boolean;

  /**
   * Get the current state of a component
   */
  getState(key: string): InitializationState;

  /**
   * Reset initialization state (for testing/recovery)
   */
  reset(key: string): void;

  /**
   * Get all initialization states (for debugging)
   */
  getAllStates(): Record<string, InitializationState>;

  /**
   * Wait for a component to be initialized
   */
  waitForInitialization<T>(key: string, timeout?: number): Promise<InitializationResult<T>>;
}