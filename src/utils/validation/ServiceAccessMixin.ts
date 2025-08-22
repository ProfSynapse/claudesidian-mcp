/**
 * Location: /src/utils/validation/ServiceAccessMixin.ts
 * Purpose: Standardize service access patterns and eliminate varied service integration approaches
 * 
 * This utility provides a consistent interface for accessing plugin services with
 * comprehensive error handling, health checks, caching, and retry logic to eliminate
 * the varied service access patterns across modes.
 * 
 * Used by: All modes for service access via standardized patterns
 * Integrates with: Plugin services, existing service integration patterns
 */

import { App } from 'obsidian';

/**
 * Service requirements interface for specifying needed services
 */
export interface ServiceRequirements {
  memoryService?: boolean;
  workspaceService?: boolean;
  embeddingService?: boolean;
  vectorStore?: boolean;
  customPromptStorage?: boolean;
  agentManager?: boolean;
  eventManager?: boolean;
  fileEventManager?: boolean;
  searchService?: boolean;
  usageStatsService?: boolean;
  cacheManager?: boolean;
}

/**
 * Service access configuration options
 */
export interface ServiceAccessOptions {
  /**
   * Use service caching (default: true)
   */
  useCache?: boolean;
  
  /**
   * Perform health checks on services (default: false)
   */
  healthCheck?: boolean;
  
  /**
   * Timeout for service access in milliseconds (default: 5000)
   */
  timeout?: number;
  
  /**
   * Number of retry attempts (default: 2)
   */
  retries?: number;
  
  /**
   * Fallback behavior on service failure
   */
  fallbackBehavior?: 'error' | 'warn' | 'silent';
}

/**
 * Service access result interface
 */
export interface ServiceAccessResult<T> {
  /**
   * Whether service access succeeded
   */
  success: boolean;
  
  /**
   * Retrieved services (if successful)
   */
  services?: T;
  
  /**
   * Error message (if failed)
   */
  error?: string;
  
  /**
   * Machine-readable error code
   */
  code?: string;
  
  /**
   * Additional error details
   */
  details?: any;
}

/**
 * Cached service entry
 */
interface CachedService {
  services: any;
  expiry: number;
  timestamp: number;
}

/**
 * Service instance type mapping
 */
type ServiceInstance = any; // Will be properly typed based on actual service interfaces

/**
 * Service map type helper
 */
type ServiceMap<T extends ServiceRequirements> = {
  [K in keyof T]: T[K] extends true ? ServiceInstance : never;
};

/**
 * ServiceAccessMixin - Standardized service integration patterns
 */
export class ServiceAccessMixin {
  private static readonly serviceCache = new Map<string, CachedService>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get required services with comprehensive error handling and caching
   * 
   * This is the primary method for accessing plugin services with consistent
   * error handling, caching, and health checks across all modes.
   * 
   * @param app Obsidian App instance
   * @param requirements Service requirements specification
   * @param options Service access configuration
   * @returns Promise resolving to service access result
   */
  static async getRequiredServices<TServices extends ServiceRequirements>(
    app: App,
    requirements: TServices,
    options: ServiceAccessOptions = {}
  ): Promise<ServiceAccessResult<ServiceMap<TServices>>> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(requirements);
    const opts: Required<ServiceAccessOptions> = {
      useCache: true,
      healthCheck: false,
      timeout: 5000,
      retries: 2,
      fallbackBehavior: 'error',
      ...options
    };

    try {
      // Check cache first (if enabled)
      if (opts.useCache) {
        const cachedResult = this.getCachedServices(cacheKey);
        if (cachedResult) {
          this.trackServiceAccess('cache-hit', startTime, true);
          return { success: true, services: cachedResult };
        }
      }

      // Get plugin with timeout and retry logic
      const plugin = await this.getPluginWithRetry(app, opts.timeout, opts.retries);
      if (!plugin?.services) {
        return {
          success: false,
          error: 'Plugin services not available. Plugin may not be properly initialized.',
          code: 'PLUGIN_NOT_INITIALIZED',
          details: { pluginFound: !!plugin }
        };
      }

      // Validate and collect services
      const serviceResult = await this.validateAndCollectServices(
        plugin.services, 
        requirements, 
        opts
      );

      if (!serviceResult.success) {
        this.trackServiceAccess('validation-failed', startTime, false);
        return serviceResult;
      }

      // Cache successful result
      if (opts.useCache && serviceResult.services) {
        this.cacheServices(cacheKey, serviceResult.services);
      }

      this.trackServiceAccess('success', startTime, true);
      return serviceResult;

    } catch (error) {
      this.trackServiceAccess('error', startTime, false);
      
      const errorMessage = `Service access failed: ${error instanceof Error ? error.message : String(error)}`;
      
      if (opts.fallbackBehavior === 'warn') {
        console.warn(errorMessage, error);
      } else if (opts.fallbackBehavior === 'error') {
        console.error(errorMessage, error);
      }
      
      return {
        success: false,
        error: errorMessage,
        code: 'SERVICE_ACCESS_ERROR',
        details: { error, requirements }
      };
    }
  }

  /**
   * Convenience method for memory-related services
   * 
   * @param app Obsidian App instance
   * @param options Service access options
   * @returns Promise resolving to memory services
   */
  static async getMemoryServices(
    app: App, 
    options?: ServiceAccessOptions
  ): Promise<ServiceAccessResult<{
    memoryService: any;
    workspaceService: any;
  }>> {
    return this.getRequiredServices(app, {
      memoryService: true,
      workspaceService: true
    }, options);
  }

  /**
   * Convenience method for search-related services
   * 
   * @param app Obsidian App instance
   * @param options Service access options
   * @returns Promise resolving to search services
   */
  static async getSearchServices(
    app: App, 
    options?: ServiceAccessOptions
  ): Promise<ServiceAccessResult<{
    embeddingService: any;
    vectorStore: any;
    searchService?: any;
  }>> {
    return this.getRequiredServices(app, {
      embeddingService: true,
      vectorStore: true,
      searchService: false // Optional
    }, options);
  }

  /**
   * Convenience method for prompt-related services
   * 
   * @param app Obsidian App instance
   * @param options Service access options
   * @returns Promise resolving to prompt services
   */
  static async getPromptServices(
    app: App, 
    options?: ServiceAccessOptions
  ): Promise<ServiceAccessResult<{
    customPromptStorage: any;
    agentManager?: any;
  }>> {
    return this.getRequiredServices(app, {
      customPromptStorage: true,
      agentManager: false // Optional
    }, options);
  }

  /**
   * Convenience method for all core services
   * 
   * @param app Obsidian App instance
   * @param options Service access options
   * @returns Promise resolving to core services
   */
  static async getAllCoreServices(
    app: App, 
    options?: ServiceAccessOptions
  ): Promise<ServiceAccessResult<{
    memoryService: any;
    workspaceService: any;
    embeddingService: any;
    vectorStore: any;
    eventManager: any;
  }>> {
    return this.getRequiredServices(app, {
      memoryService: true,
      workspaceService: true,
      embeddingService: true,
      vectorStore: true,
      eventManager: true
    }, options);
  }

  /**
   * Validate individual services with health checks
   * 
   * @param availableServices Available service instances from plugin
   * @param requirements Service requirements specification
   * @param options Service access options
   * @returns Promise resolving to validation result
   */
  private static async validateAndCollectServices<TServices extends ServiceRequirements>(
    availableServices: any,
    requirements: TServices,
    options: Required<ServiceAccessOptions>
  ): Promise<ServiceAccessResult<ServiceMap<TServices>>> {
    const services: any = {};
    const missingServices: string[] = [];
    const unhealthyServices: string[] = [];
    const healthCheckErrors: string[] = [];

    for (const [serviceName, isRequired] of Object.entries(requirements)) {
      if (!isRequired) continue;

      try {
        const service = availableServices[serviceName];
        
        if (!service) {
          if (isRequired) {
            missingServices.push(serviceName);
          }
          continue;
        }

        // Perform health check if requested and available
        if (options.healthCheck && typeof service.isHealthy === 'function') {
          try {
            const healthTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 3000)
            );
            
            const isHealthy = await Promise.race([
              service.isHealthy(),
              healthTimeout
            ]);

            if (!isHealthy) {
              if (isRequired) {
                unhealthyServices.push(serviceName);
              }
              continue;
            }
          } catch (healthError) {
            const errorMsg = `${serviceName} health check failed: ${healthError}`;
            healthCheckErrors.push(errorMsg);
            
            if (isRequired) {
              unhealthyServices.push(serviceName);
              continue;
            }
          }
        }

        services[serviceName] = service;

      } catch (error) {
        const errorMsg = `${serviceName} access failed: ${error}`;
        if (isRequired) {
          healthCheckErrors.push(errorMsg);
        }
      }
    }

    // Compile comprehensive error message
    const errorParts: string[] = [];
    if (missingServices.length > 0) {
      errorParts.push(`Missing required services: ${missingServices.join(', ')}`);
    }
    if (unhealthyServices.length > 0) {
      errorParts.push(`Unhealthy services: ${unhealthyServices.join(', ')}`);
    }
    if (healthCheckErrors.length > 0) {
      errorParts.push(`Service errors: ${healthCheckErrors.join('; ')}`);
    }

    if (errorParts.length > 0) {
      return {
        success: false,
        error: errorParts.join('. '),
        code: 'SERVICE_VALIDATION_FAILED',
        details: {
          missingServices,
          unhealthyServices,
          healthCheckErrors,
          availableServices: Object.keys(availableServices || {})
        }
      };
    }

    return { success: true, services };
  }

  /**
   * Get plugin with timeout and retry logic
   * 
   * @param app Obsidian App instance
   * @param timeout Timeout in milliseconds
   * @param retries Number of retry attempts
   * @returns Promise resolving to plugin instance
   */
  private static async getPluginWithRetry(app: App, timeout: number, retries: number): Promise<any> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const plugin = await Promise.race([
          Promise.resolve(app.plugins.getPlugin('claudesidian-mcp')),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Plugin access timeout')), timeout)
          )
        ]);
        
        if (plugin) {
          return plugin;
        }
        
        lastError = new Error('Plugin not found');
      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Generate cache key from service requirements
   * 
   * @param requirements Service requirements specification
   * @returns Cache key string
   */
  private static generateCacheKey(requirements: ServiceRequirements): string {
    return Object.keys(requirements)
      .filter(key => requirements[key as keyof ServiceRequirements])
      .sort()
      .join('-');
  }

  /**
   * Get cached services if available and not expired
   * 
   * @param cacheKey Cache key for the services
   * @returns Cached services or null if not available
   */
  private static getCachedServices(cacheKey: string): any | null {
    const cached = this.serviceCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return cached.services;
    }
    
    // Clean up expired cache
    this.serviceCache.delete(cacheKey);
    return null;
  }

  /**
   * Cache services for future use
   * 
   * @param cacheKey Cache key for the services
   * @param services Services to cache
   */
  private static cacheServices(cacheKey: string, services: any): void {
    this.serviceCache.set(cacheKey, {
      services,
      expiry: Date.now() + this.CACHE_DURATION,
      timestamp: Date.now()
    });
    
    // Periodic cache cleanup
    this.cleanupExpiredCache();
  }

  /**
   * Clean up expired cache entries
   */
  private static cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.serviceCache.entries()) {
      if (now >= cached.expiry) {
        this.serviceCache.delete(key);
      }
    }
  }

  /**
   * Track service access performance and outcomes
   * 
   * @param operation Type of operation being tracked
   * @param startTime Start time of the operation
   * @param success Whether the operation succeeded
   */
  private static trackServiceAccess(
    operation: string, 
    startTime: number, 
    success: boolean
  ): void {
    const duration = performance.now() - startTime;
    
    // Integration with existing monitoring system
    if (typeof (globalThis as any).CompatibilityMonitor !== 'undefined') {
      (globalThis as any).CompatibilityMonitor.trackValidation(
        'ServiceAccessMixin',
        operation,
        startTime,
        performance.now(),
        success
      );
    }

    // Debug logging for performance issues
    if (duration > 50) { // Log operations taking >50ms
      console.debug(`ServiceAccessMixin: ${operation} took ${duration.toFixed(2)}ms`, {
        success,
        duration,
        operation
      });
    }
  }

  /**
   * Clear service cache (useful for testing or plugin reload)
   */
  static clearCache(): void {
    this.serviceCache.clear();
  }

  /**
   * Get cache statistics for monitoring
   * 
   * @returns Cache statistics object
   */
  static getCacheStats(): {
    size: number;
    keys: string[];
    oldestEntry?: number;
    newestEntry?: number;
  } {
    const entries = Array.from(this.serviceCache.entries());
    const timestamps = entries.map(([_, cached]) => cached.timestamp);
    
    return {
      size: this.serviceCache.size,
      keys: entries.map(([key]) => key),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined
    };
  }
}