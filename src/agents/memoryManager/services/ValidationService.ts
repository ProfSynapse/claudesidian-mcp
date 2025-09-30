/**
 * Location: /src/agents/memoryManager/services/ValidationService.ts
 * Purpose: Consolidated validation service combining all validation logic from memory manager modes
 * 
 * This file consolidates:
 * - ServiceIntegration.ts (service access and validation)
 * - All parameter validators from various modes
 * - Error handling and retry logic
 * - Service status monitoring and diagnostics
 * 
 * Used by: All consolidated memory manager modes for service access and validation
 */

import { App } from 'obsidian';
import { MemoryService } from "./MemoryService";
import { WorkspaceService } from "../../../services/WorkspaceService";
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Service availability status
 */
export interface ServiceStatus {
  available: boolean;
  initialized: boolean;
  lastError?: string;
  lastCheck: number;
  retryCount: number;
}

/**
 * Service integration configuration
 */
export interface ServiceIntegrationConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  enableHealthCheck: boolean;
  fallbackBehavior: 'fail' | 'warn' | 'silent';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Service access result with detailed error information
 */
export interface ServiceAccessResult<T> {
  success: boolean;
  service: T | null;
  error?: string;
  status: ServiceStatus;
  diagnostics?: {
    pluginFound: boolean;
    serviceContainerAvailable: boolean;
    serviceFound: boolean;
    methodUsed: string;
    duration: number;
  };
}

/**
 * Plugin interface for service access
 */
export interface ClaudesidianPlugin {
  services?: {
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  };
  serviceContainer?: {
    getIfReady<T>(serviceName: string): T | null;
  };
  getService?<T>(serviceName: string): Promise<T>;
}

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  value: any;
  requirement: string;
}

/**
 * Consolidated validation service for memory manager operations
 */
export class ValidationService {
  private static readonly DEFAULT_CONFIG: ServiceIntegrationConfig = {
    maxRetries: 3,
    retryDelayMs: 500,
    timeoutMs: 5000,
    enableHealthCheck: true,
    fallbackBehavior: 'warn',
    logLevel: 'warn'
  };

  private app: App;
  private config: ServiceIntegrationConfig;
  private serviceStatuses: Map<string, ServiceStatus> = new Map();

  constructor(app: App, config: Partial<ServiceIntegrationConfig> = {}) {
    this.app = app;
    this.config = { ...ValidationService.DEFAULT_CONFIG, ...config };
  }

  /**
   * Get memory service with robust error handling and retry logic
   */
  async getMemoryService(): Promise<ServiceAccessResult<MemoryService>> {
    return this.getService<MemoryService>('memoryService', 'MemoryService');
  }

  /**
   * Get workspace service with robust error handling and retry logic
   */
  async getWorkspaceService(): Promise<ServiceAccessResult<WorkspaceService>> {
    return this.getService<WorkspaceService>('workspaceService', 'WorkspaceService');
  }

  /**
   * Get memory service synchronously (for immediate availability checks)
   */
  getMemoryServiceSync(): ServiceAccessResult<MemoryService> {
    return this.getServiceSync<MemoryService>('memoryService', 'MemoryService');
  }

  /**
   * Get workspace service synchronously (for immediate availability checks)
   */
  getWorkspaceServiceSync(): ServiceAccessResult<WorkspaceService> {
    return this.getServiceSync<WorkspaceService>('workspaceService', 'WorkspaceService');
  }

  /**
   * Validate session creation parameters
   */
  validateSessionCreationParams(params: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Session name validation
    if (params.name && typeof params.name !== 'string') {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'Session name must be a string if provided'
      });
    }

    // Session goal validation
    if (params.sessionGoal && typeof params.sessionGoal !== 'string') {
      errors.push({
        field: 'sessionGoal',
        value: params.sessionGoal,
        requirement: 'Session goal must be a string if provided'
      });
    }

    // Tags validation
    if (params.tags && (!Array.isArray(params.tags) || !params.tags.every((tag: any) => typeof tag === 'string'))) {
      errors.push({
        field: 'tags',
        value: params.tags,
        requirement: 'Tags must be an array of strings if provided'
      });
    }

    return errors;
  }

  /**
   * Validate state creation parameters
   */
  validateStateCreationParams(params: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!params.name) {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'State name is required and must be a descriptive, non-empty string'
      });
    }

    if (!params.conversationContext) {
      errors.push({
        field: 'conversationContext',
        value: params.conversationContext,
        requirement: 'Conversation context is required. Provide a summary of what was happening when you decided to save this state'
      });
    }

    if (!params.activeTask) {
      errors.push({
        field: 'activeTask',
        value: params.activeTask,
        requirement: 'Active task description is required. Be specific about the current task you were working on'
      });
    }

    if (!params.activeFiles || !Array.isArray(params.activeFiles) || params.activeFiles.length === 0) {
      errors.push({
        field: 'activeFiles',
        value: params.activeFiles,
        requirement: 'Active files list is required. Specify which files were being edited or referenced'
      });
    }

    if (!params.nextSteps || !Array.isArray(params.nextSteps) || params.nextSteps.length === 0) {
      errors.push({
        field: 'nextSteps',
        value: params.nextSteps,
        requirement: 'Next steps are required. Provide specific actionable steps for when you resume'
      });
    }

    if (!params.reasoning) {
      errors.push({
        field: 'reasoning',
        value: params.reasoning,
        requirement: 'Reasoning for saving state is required. Explain why you are saving the state at this point'
      });
    }

    return errors;
  }

  /**
   * Validate workspace creation parameters
   */
  validateWorkspaceCreationParams(params: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!params.name) {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'Workspace name is required and must be a non-empty string'
      });
    }

    if (!params.rootFolder) {
      errors.push({
        field: 'rootFolder',
        value: params.rootFolder,
        requirement: 'Root folder path is required for workspace organization'
      });
    }

    if (!params.purpose) {
      errors.push({
        field: 'purpose',
        value: params.purpose,
        requirement: 'Workspace purpose is required. Provide a clear description of what this workspace is for'
      });
    }

    if (!params.currentGoal) {
      errors.push({
        field: 'currentGoal',
        value: params.currentGoal,
        requirement: 'Current goal is required. Specify what you are trying to accomplish right now'
      });
    }

    if (!params.workflows || !Array.isArray(params.workflows) || params.workflows.length === 0) {
      errors.push({
        field: 'workflows',
        value: params.workflows,
        requirement: 'At least one workflow is required. Provide workflows with name, when to use, and steps'
      });
    }


    return errors;
  }

  /**
   * Core service access method with comprehensive error handling
   */
  private async getService<T>(serviceName: string, displayName: string): Promise<ServiceAccessResult<T>> {
    const startTime = Date.now();
    const status = this.getServiceStatus(serviceName);
    
    // If service was recently checked and failed, return cached failure
    if (!status.available && (Date.now() - status.lastCheck) < this.config.retryDelayMs) {
      this.log('debug', `[ValidationService] Using cached failure for ${displayName}`);
      return this.createResult<T>(false, null, status.lastError || 'Service unavailable', status, {
        pluginFound: false,
        serviceContainerAvailable: false,
        serviceFound: false,
        methodUsed: 'cached',
        duration: Date.now() - startTime
      });
    }

    let attempts = 0;
    let lastError = '';

    while (attempts <= this.config.maxRetries) {
      try {
        attempts++;
        this.log('debug', `[ValidationService] Attempting to get ${displayName} (attempt ${attempts}/${this.config.maxRetries + 1})`);

        const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as ClaudesidianPlugin;
        if (!plugin) {
          lastError = `Plugin 'claudesidian-mcp' not found`;
          this.log('error', `[ValidationService] ${lastError}`);
          
          if (attempts <= this.config.maxRetries) {
            await this.delay(this.config.retryDelayMs);
            continue;
          }
          break;
        }

        const diagnostics = {
          pluginFound: true,
          serviceContainerAvailable: false,
          serviceFound: false,
          methodUsed: '',
          duration: 0
        };

        // Try ServiceContainer first (preferred method)
        if (plugin.serviceContainer) {
          this.log('debug', `[ValidationService] Trying ServiceContainer for ${displayName}`);
          diagnostics.serviceContainerAvailable = true;
          diagnostics.methodUsed = 'serviceContainer';

          const service = plugin.serviceContainer.getIfReady<T>(serviceName);
          if (service) {
            this.log('debug', `[ValidationService] Successfully got ${displayName} via ServiceContainer`);
            diagnostics.serviceFound = true;
            diagnostics.duration = Date.now() - startTime;
            
            const successStatus = this.updateServiceStatus(serviceName, true, undefined);
            return this.createResult<T>(true, service, undefined, successStatus, diagnostics);
          }
        }

        // Try async getService method
        if (plugin.getService) {
          this.log('debug', `[ValidationService] Trying async getService for ${displayName}`);
          diagnostics.methodUsed = diagnostics.methodUsed ? `${diagnostics.methodUsed}+async` : 'async';

          try {
            const service = await this.withTimeout(plugin.getService<T>(serviceName), this.config.timeoutMs);
            if (service) {
              this.log('debug', `[ValidationService] Successfully got ${displayName} via async method`);
              diagnostics.serviceFound = true;
              diagnostics.duration = Date.now() - startTime;
              
              const successStatus = this.updateServiceStatus(serviceName, true, undefined);
              return this.createResult<T>(true, service, undefined, successStatus, diagnostics);
            }
          } catch (asyncError) {
            this.log('warn', `[ValidationService] Async service access failed for ${displayName}:`, asyncError);
            lastError = getErrorMessage(asyncError);
          }
        }

        // Try direct services access (fallback)
        if (plugin.services && plugin.services[serviceName as keyof typeof plugin.services]) {
          this.log('debug', `[ValidationService] Trying direct services access for ${displayName}`);
          diagnostics.methodUsed = diagnostics.methodUsed ? `${diagnostics.methodUsed}+direct` : 'direct';

          const service = plugin.services[serviceName as keyof typeof plugin.services] as T;
          if (service) {
            this.log('debug', `[ValidationService] Successfully got ${displayName} via direct access`);
            diagnostics.serviceFound = true;
            diagnostics.duration = Date.now() - startTime;
            
            const successStatus = this.updateServiceStatus(serviceName, true, undefined);
            return this.createResult<T>(true, service, undefined, successStatus, diagnostics);
          }
        }

        lastError = `${displayName} not available through any access method`;
        this.log('warn', `[ValidationService] ${lastError} (attempt ${attempts})`);

        if (attempts <= this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs);
        }

      } catch (error) {
        lastError = getErrorMessage(error);
        this.log('error', `[ValidationService] Error accessing ${displayName} (attempt ${attempts}):`, error);
        
        if (attempts <= this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // All attempts failed
    const failureStatus = this.updateServiceStatus(serviceName, false, lastError);
    const diagnostics = {
      pluginFound: false,
      serviceContainerAvailable: false,
      serviceFound: false,
      methodUsed: 'failed',
      duration: Date.now() - startTime
    };

    this.handleServiceFailure(displayName, lastError, attempts);
    return this.createResult<T>(false, null, lastError, failureStatus, diagnostics);
  }

  /**
   * Synchronous service access for immediate availability checks
   */
  private getServiceSync<T>(serviceName: string, displayName: string): ServiceAccessResult<T> {
    const startTime = Date.now();
    
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as ClaudesidianPlugin;
      if (!plugin) {
        const error = `Plugin 'claudesidian-mcp' not found`;
        const status = this.updateServiceStatus(serviceName, false, error);
        return this.createResult<T>(false, null, error, status, {
          pluginFound: false,
          serviceContainerAvailable: false,
          serviceFound: false,
          methodUsed: 'sync',
          duration: Date.now() - startTime
        });
      }

      const diagnostics = {
        pluginFound: true,
        serviceContainerAvailable: !!plugin.serviceContainer,
        serviceFound: false,
        methodUsed: 'sync',
        duration: 0
      };

      // Try ServiceContainer first
      if (plugin.serviceContainer) {
        const service = plugin.serviceContainer.getIfReady<T>(serviceName);
        if (service) {
          diagnostics.serviceFound = true;
          diagnostics.duration = Date.now() - startTime;
          const status = this.updateServiceStatus(serviceName, true, undefined);
          return this.createResult<T>(true, service, undefined, status, diagnostics);
        }
      }

      // Try direct access
      if (plugin.services && plugin.services[serviceName as keyof typeof plugin.services]) {
        const service = plugin.services[serviceName as keyof typeof plugin.services] as T;
        if (service) {
          diagnostics.serviceFound = true;
          diagnostics.methodUsed = 'direct';
          diagnostics.duration = Date.now() - startTime;
          const status = this.updateServiceStatus(serviceName, true, undefined);
          return this.createResult<T>(true, service, undefined, status, diagnostics);
        }
      }

      const error = `${displayName} not available synchronously`;
      const status = this.updateServiceStatus(serviceName, false, error);
      return this.createResult<T>(false, null, error, status, diagnostics);

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const status = this.updateServiceStatus(serviceName, false, errorMessage);
      return this.createResult<T>(false, null, errorMessage, status, {
        pluginFound: false,
        serviceContainerAvailable: false,
        serviceFound: false,
        methodUsed: 'sync-failed',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Get or create service status tracking
   */
  private getServiceStatus(serviceName: string): ServiceStatus {
    if (!this.serviceStatuses.has(serviceName)) {
      this.serviceStatuses.set(serviceName, {
        available: false,
        initialized: false,
        lastCheck: 0,
        retryCount: 0
      });
    }
    return this.serviceStatuses.get(serviceName)!;
  }

  /**
   * Update service status tracking
   */
  private updateServiceStatus(serviceName: string, available: boolean, error?: string): ServiceStatus {
    const status = this.getServiceStatus(serviceName);
    
    status.available = available;
    status.initialized = available;
    status.lastError = error;
    status.lastCheck = Date.now();
    
    if (available) {
      status.retryCount = 0;
    } else {
      status.retryCount++;
    }

    this.serviceStatuses.set(serviceName, status);
    return status;
  }

  /**
   * Create standardized service access result
   */
  private createResult<T>(
    success: boolean,
    service: T | null,
    error?: string,
    status?: ServiceStatus,
    diagnostics?: any
  ): ServiceAccessResult<T> {
    return {
      success,
      service,
      error,
      status: status || {
        available: success,
        initialized: success,
        lastError: error,
        lastCheck: Date.now(),
        retryCount: 0
      },
      diagnostics
    };
  }

  /**
   * Handle service failure with appropriate logging and fallback behavior
   */
  private handleServiceFailure(serviceName: string, error: string, attempts: number): void {
    const message = `${serviceName} unavailable after ${attempts} attempts: ${error}`;
    
    switch (this.config.fallbackBehavior) {
      case 'fail':
        this.log('error', `[ValidationService] CRITICAL: ${message}`);
        break;
      case 'warn':
        this.log('warn', `[ValidationService] WARNING: ${message} - operations will be limited`);
        break;
      case 'silent':
        this.log('debug', `[ValidationService] ${message}`);
        break;
    }
  }

  /**
   * Timeout wrapper for promises
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configurable logging
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= configLevel) {
      console[level](message, ...args);
    }
  }

  /**
   * Reset service status (for testing or manual intervention)
   */
  resetServiceStatus(serviceName?: string): void {
    if (serviceName) {
      this.serviceStatuses.delete(serviceName);
    } else {
      this.serviceStatuses.clear();
    }
  }

  /**
   * Get comprehensive service diagnostics
   */
  getDiagnostics(): Record<string, ServiceStatus> {
    const diagnostics: Record<string, ServiceStatus> = {};
    
    for (const [serviceName, status] of this.serviceStatuses.entries()) {
      diagnostics[serviceName] = { ...status };
    }
    
    return diagnostics;
  }
}

/**
 * Default service integration instance factory
 * Creates a standard service integration with recommended settings
 */
export function createServiceIntegration(app: App, config?: Partial<ServiceIntegrationConfig>): ValidationService {
  return new ValidationService(app, {
    maxRetries: 2,
    retryDelayMs: 300,
    timeoutMs: 3000,
    enableHealthCheck: true,
    fallbackBehavior: 'warn',
    logLevel: 'warn',
    ...config
  });
}