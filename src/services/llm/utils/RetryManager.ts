/**
 * Retry Manager
 * Handles retry logic with exponential backoff and circuit breaker patterns
 * Based on patterns from existing retry utilities
 */

import { createLogger } from './Logger';

const logger = createLogger('RetryManager');

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export class RetryManager {
  private static instance: RetryManager;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationName?: string
  ): Promise<T> {
    const finalConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      exponentialBase: 2,
      jitter: true,
      retryCondition: this.defaultRetryCondition,
      ...config
    };

    let lastError: any;
    
    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info(`Operation succeeded on attempt ${attempt}`, {
            operation: operationName,
            attempts: attempt
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        logger.warn(`Operation failed on attempt ${attempt}`, {
          operation: operationName,
          attempt,
          maxAttempts: finalConfig.maxAttempts,
          error: error instanceof Error ? error.message : String(error)
        });

        // Check if we should retry
        if (attempt === finalConfig.maxAttempts || !finalConfig.retryCondition!(error)) {
          break;
        }

        // Call retry callback
        if (finalConfig.onRetry) {
          finalConfig.onRetry(attempt, error);
        }

        // Wait before next attempt
        const delay = this.calculateDelay(attempt, finalConfig);
        await this.sleep(delay);
      }
    }

    logger.error(`Operation failed after ${finalConfig.maxAttempts} attempts`, {
      operation: operationName,
      finalError: lastError instanceof Error ? lastError.message : String(lastError)
    });

    throw lastError;
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitName: string,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    let circuitBreaker = this.circuitBreakers.get(circuitName);
    
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 120000,
        ...config
      });
      this.circuitBreakers.set(circuitName, circuitBreaker);
    }

    return circuitBreaker.execute(operation);
  }

  /**
   * Execute operation with both retry and circuit breaker
   */
  async withRetryAndCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitName: string,
    retryConfig: Partial<RetryConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    return this.withCircuitBreaker(
      () => this.withRetry(operation, retryConfig, circuitName),
      circuitName,
      circuitConfig
    );
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(circuitName: string): CircuitState | null {
    const circuit = this.circuitBreakers.get(circuitName);
    return circuit ? circuit.getState() : null;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(circuitName: string): void {
    const circuit = this.circuitBreakers.get(circuitName);
    if (circuit) {
      circuit.reset();
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitStats(circuitName: string): any {
    const circuit = this.circuitBreakers.get(circuitName);
    return circuit ? circuit.getStats() : null;
  }

  // Private helper methods

  private defaultRetryCondition(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx status codes
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    
    if (error.status === 429) { // Rate limiting
      return true;
    }
    
    return false;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.exponentialBase, attempt - 1);
    
    // Apply maximum delay
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private totalRequests = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker moved to half-open state');
      } else {
        throw new Error('Circuit breaker is open - operation not allowed');
      }
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): any {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate: this.totalRequests > 0 ? this.failureCount / this.totalRequests : 0,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    logger.info('Circuit breaker manually reset');
  }

  private onSuccess(): void {
    this.successCount++;
    
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failureCount = 0;
      logger.info('Circuit breaker closed after successful half-open test');
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      this.state = 'open';
      logger.warn('Circuit breaker opened after half-open failure');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }
}

/**
 * Convenience functions for common retry patterns
 */
export class RetryPatterns {
  private static retryManager = RetryManager.getInstance();

  /**
   * API call with standard retry
   */
  static async apiCall<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.retryManager.withRetry(operation, {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryCondition: (error) => {
        // Retry on network errors and 5xx, but not on 4xx (except 429)
        return error.status >= 500 || error.status === 429 || !error.status;
      }
    }, operationName);
  }

  /**
   * Database operation with retry
   */
  static async databaseOperation<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.retryManager.withRetry(operation, {
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 5000,
      retryCondition: (error) => {
        // Retry on connection errors and timeouts
        return error.code === 'ECONNRESET' || 
               error.code === 'ETIMEDOUT' || 
               error.message?.includes('connection');
      }
    }, operationName);
  }

  /**
   * File operation with retry
   */
  static async fileOperation<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.retryManager.withRetry(operation, {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      jitter: false, // File operations don't need jitter
      retryCondition: (error) => {
        // Retry on file system errors but not permission errors
        return error.code === 'EBUSY' || 
               error.code === 'EMFILE' || 
               error.code === 'ENFILE';
      }
    }, operationName);
  }
}

/**
 * Global retry manager instance
 */
export const retryManager = RetryManager.getInstance();