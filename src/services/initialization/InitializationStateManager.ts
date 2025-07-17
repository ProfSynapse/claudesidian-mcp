/**
 * InitializationStateManager - Manages initialization state with mutex protection
 * Follows Single Responsibility Principle - only manages initialization state
 * Follows DRY principle - centralized state management
 * Implements Boy Scout Rule - cleaner mutex-based initialization
 */

import { 
  IInitializationStateManager, 
  InitializationResult, 
  InitializationState 
} from './interfaces/IInitializationStateManager';

export class InitializationStateManager implements IInitializationStateManager {
  private readonly states = new Map<string, InitializationState>();
  private readonly mutexes = new Map<string, Promise<any>>();
  private readonly results = new Map<string, InitializationResult<any>>();
  private readonly defaultTimeout = 120000; // 120 seconds - increased for HNSW initialization

  /**
   * Ensures a component is initialized exactly once using mutex pattern
   */
  async ensureInitialized<T>(
    key: string, 
    initializer: () => Promise<T>,
    timeout = this.defaultTimeout
  ): Promise<InitializationResult<T>> {
    // Check if already completed
    const existingResult = this.results.get(key);
    if (existingResult && existingResult.success) {
      return existingResult as InitializationResult<T>;
    }

    // Check if already in progress
    const existingMutex = this.mutexes.get(key);
    if (existingMutex) {
      return this.waitForInitialization<T>(key, timeout);
    }

    // Start initialization
    const initializationPromise = this.performInitialization(key, initializer, timeout);
    this.mutexes.set(key, initializationPromise);

    try {
      const result = await initializationPromise;
      return result;
    } finally {
      // Clean up mutex after completion
      this.mutexes.delete(key);
    }
  }

  /**
   * Performs the actual initialization with proper state tracking
   */
  private async performInitialization<T>(
    key: string,
    initializer: () => Promise<T>,
    timeout: number
  ): Promise<InitializationResult<T>> {
    const startTime = Date.now();
    
    // Set initial state
    this.states.set(key, {
      isInitializing: true,
      isCompleted: false,
      isFailed: false,
      startTime
    });

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Initialization timeout for ${key} after ${timeout}ms`)), timeout);
      });

      // Race between initialization and timeout
      const result = await Promise.race([
        initializer(),
        timeoutPromise
      ]);

      const endTime = Date.now();
      const finalResult: InitializationResult<T> = {
        success: true,
        result,
        timestamp: endTime
      };

      // Update state
      this.states.set(key, {
        isInitializing: false,
        isCompleted: true,
        isFailed: false,
        startTime,
        endTime
      });

      this.results.set(key, finalResult);
      return finalResult;

    } catch (error) {
      const endTime = Date.now();
      const finalResult: InitializationResult<T> = {
        success: false,
        error: error as Error,
        timestamp: endTime
      };

      // Update state
      this.states.set(key, {
        isInitializing: false,
        isCompleted: false,
        isFailed: true,
        startTime,
        endTime,
        error: error as Error
      });

      this.results.set(key, finalResult);
      return finalResult;
    }
  }

  /**
   * Check if a component is already initialized
   */
  isInitialized(key: string): boolean {
    const state = this.states.get(key);
    return state?.isCompleted ?? false;
  }

  /**
   * Check if a component is currently initializing
   */
  isInitializing(key: string): boolean {
    const state = this.states.get(key);
    return state?.isInitializing ?? false;
  }

  /**
   * Get the current state of a component
   */
  getState(key: string): InitializationState {
    return this.states.get(key) ?? {
      isInitializing: false,
      isCompleted: false,
      isFailed: false
    };
  }

  /**
   * Reset initialization state (for testing/recovery)
   */
  reset(key: string): void {
    this.states.delete(key);
    this.mutexes.delete(key);
    this.results.delete(key);
  }

  /**
   * Get all initialization states (for debugging)
   */
  getAllStates(): Record<string, InitializationState> {
    const states: Record<string, InitializationState> = {};
    for (const [key, state] of this.states) {
      states[key] = { ...state };
    }
    return states;
  }

  /**
   * Wait for a component to be initialized
   */
  async waitForInitialization<T>(
    key: string, 
    timeout = this.defaultTimeout
  ): Promise<InitializationResult<T>> {
    const existingResult = this.results.get(key);
    if (existingResult) {
      return existingResult as InitializationResult<T>;
    }

    const existingMutex = this.mutexes.get(key);
    if (existingMutex) {
      try {
        await existingMutex;
        const result = this.results.get(key);
        if (result) {
          return result as InitializationResult<T>;
        }
      } catch (error) {
        // Mutex failed, return the error result
        const result = this.results.get(key);
        if (result) {
          return result as InitializationResult<T>;
        }
      }
    }

    // Wait with timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const result = this.results.get(key);
      if (result) {
        return result as InitializationResult<T>;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for ${key} to initialize`);
  }
}