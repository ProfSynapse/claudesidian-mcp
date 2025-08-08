/**
 * Location: src/database/services/monitoring/HealthMonitor.ts
 * 
 * Summary: Consolidated health monitoring service that provides comprehensive
 * system health monitoring, collection validation, lifecycle management, and
 * automated recovery capabilities. Consolidates functionality from
 * CollectionHealthMonitor, CollectionValidator, and related services.
 * 
 * Used by: Database layer, VectorStore, and services requiring health monitoring
 * Dependencies: IVectorStore, CollectionService, various health monitoring components
 */

import { Plugin } from 'obsidian';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { CollectionService, ValidationResult, RecoveryResult, RecoveryStrategy } from '../core/CollectionService';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface SystemHealthStatus {
  healthy: boolean;
  timestamp: number;
  components: ComponentHealth[];
  overall: {
    criticalErrors: number;
    warnings: number;
    healthyComponents: number;
    totalComponents: number;
  };
  recommendations: string[];
  uptime: number;
}

export interface ComponentHealth {
  name: string;
  type: string;
  healthy: boolean;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  lastCheck: number;
  metrics: Record<string, any>;
  issues: string[];
  uptime: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
  alerts: {
    enabled: boolean;
    criticalThreshold: number;
    warningThreshold: number;
  };
  autoRecovery: {
    enabled: boolean;
    maxAttempts: number;
    backoffMultiplier: number;
  };
}

export interface MonitoringStats {
  totalChecks: number;
  failedChecks: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  averageCheckTime: number;
  uptime: number;
  startTime: number;
}

/**
 * Health Monitor Service
 * 
 * Provides comprehensive system health monitoring including:
 * - Collection health monitoring and validation
 * - Component lifecycle management
 * - Automated recovery and self-healing
 * - Performance metrics and alerting
 * - System diagnostics and reporting
 */
export class HealthMonitor {
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  
  // Health status tracking
  private componentHealth = new Map<string, ComponentHealth>();
  private lastSystemCheck = 0;
  
  // Monitoring statistics
  private stats: MonitoringStats = {
    totalChecks: 0,
    failedChecks: 0,
    recoveryAttempts: 0,
    successfulRecoveries: 0,
    averageCheckTime: 0,
    uptime: 0,
    startTime: Date.now()
  };

  // Configuration
  private config: HealthCheckConfig = {
    enabled: true,
    interval: 60000, // 1 minute
    timeout: 10000,  // 10 seconds
    retries: 3,
    alerts: {
      enabled: true,
      criticalThreshold: 2,   // 2 critical errors trigger alert
      warningThreshold: 5     // 5 warnings trigger alert
    },
    autoRecovery: {
      enabled: true,
      maxAttempts: 3,
      backoffMultiplier: 2
    }
  };

  constructor(
    private plugin: Plugin,
    private vectorStore: IVectorStore,
    private collectionService: CollectionService
  ) {}

  // =============================================================================
  // MONITORING LIFECYCLE
  // =============================================================================

  /**
   * Start health monitoring system
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('[HealthMonitor] Monitoring already active');
      return;
    }

    console.log('[HealthMonitor] Starting system health monitoring');
    this.isMonitoring = true;
    this.startTime = Date.now();

    try {
      // Perform initial system health check
      await this.performInitialHealthCheck();

      // Start periodic monitoring if enabled
      if (this.config.enabled) {
        this.schedulePeriodicChecks();
      }

      console.log('[HealthMonitor] System health monitoring started successfully');
    } catch (error) {
      this.isMonitoring = false;
      console.error('[HealthMonitor] Failed to start monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop health monitoring system
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[HealthMonitor] Stopping system health monitoring');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('[HealthMonitor] Health monitoring stopped');
  }

  /**
   * Configure health monitoring settings
   */
  configure(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart monitoring with new configuration if currently active
    if (this.isMonitoring) {
      this.schedulePeriodicChecks();
    }
  }

  // =============================================================================
  // HEALTH CHECKING OPERATIONS
  // =============================================================================

  /**
   * Perform comprehensive system health check
   */
  async performSystemHealthCheck(): Promise<SystemHealthStatus> {
    const checkStartTime = Date.now();
    this.stats.totalChecks++;

    console.log('[HealthMonitor] Performing system health check');

    const components: ComponentHealth[] = [];
    let criticalErrors = 0;
    let warnings = 0;
    let healthyComponents = 0;
    const recommendations: string[] = [];

    try {
      // 1. Check vector store health
      const vectorStoreHealth = await this.checkVectorStoreHealth();
      components.push(vectorStoreHealth);
      
      if (vectorStoreHealth.status === 'error') criticalErrors++;
      else if (vectorStoreHealth.status === 'warning') warnings++;
      else if (vectorStoreHealth.status === 'healthy') healthyComponents++;

      // 2. Check collection health
      const collectionHealth = await this.checkCollectionHealth();
      components.push(...collectionHealth);
      
      for (const comp of collectionHealth) {
        if (comp.status === 'error') criticalErrors++;
        else if (comp.status === 'warning') warnings++;
        else if (comp.status === 'healthy') healthyComponents++;
      }

      // 3. Check memory and resource usage
      const resourceHealth = await this.checkResourceHealth();
      components.push(resourceHealth);
      
      if (resourceHealth.status === 'error') criticalErrors++;
      else if (resourceHealth.status === 'warning') warnings++;
      else if (resourceHealth.status === 'healthy') healthyComponents++;

      // 4. Generate system recommendations
      recommendations.push(...this.generateSystemRecommendations(components));

      // 5. Update statistics
      const checkTime = Date.now() - checkStartTime;
      this.updateCheckStatistics(checkTime, criticalErrors > 0);

      const systemHealth: SystemHealthStatus = {
        healthy: criticalErrors === 0,
        timestamp: Date.now(),
        components,
        overall: {
          criticalErrors,
          warnings,
          healthyComponents,
          totalComponents: components.length
        },
        recommendations,
        uptime: Date.now() - this.startTime
      };

      this.lastSystemCheck = Date.now();
      
      // Trigger alerts or recovery if needed
      if (criticalErrors > 0) {
        await this.handleCriticalErrors(components.filter(c => c.status === 'error'));
      }

      return systemHealth;

    } catch (error) {
      this.stats.failedChecks++;
      console.error('[HealthMonitor] System health check failed:', error);
      
      throw new Error(`System health check failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check specific component health
   */
  async checkComponentHealth(componentName: string): Promise<ComponentHealth | null> {
    try {
      switch (componentName.toLowerCase()) {
        case 'vectorstore':
          return await this.checkVectorStoreHealth();
        
        case 'collections':
          const collectionHealthResults = await this.checkCollectionHealth();
          // Return aggregate result for all collections
          return this.aggregateCollectionHealth(collectionHealthResults);
        
        case 'resources':
          return await this.checkResourceHealth();
        
        default:
          console.warn(`[HealthMonitor] Unknown component: ${componentName}`);
          return null;
      }
    } catch (error) {
      console.error(`[HealthMonitor] Failed to check component ${componentName}:`, error);
      return null;
    }
  }

  // =============================================================================
  // SPECIFIC HEALTH CHECKS
  // =============================================================================

  /**
   * Check vector store health
   */
  private async checkVectorStoreHealth(): Promise<ComponentHealth> {
    const checkStartTime = Date.now();
    const component: ComponentHealth = {
      name: 'VectorStore',
      type: 'database',
      healthy: true,
      status: 'healthy',
      lastCheck: checkStartTime,
      metrics: {},
      issues: [],
      uptime: Date.now() - this.startTime
    };

    try {
      // Test basic vector store operations
      const collections = await this.vectorStore.listCollections();
      component.metrics.collectionCount = collections.length;

      // Test query capability
      if (collections.length > 0) {
        const testCollection = collections[0];
        const queryResult = await this.vectorStore.query(testCollection, {
          queryTexts: ['health check'],
          nResults: 1
        });
        
        if (queryResult) {
          component.metrics.queryResponseTime = Date.now() - checkStartTime;
        }
      }

      // Check for any issues
      if (collections.length === 0) {
        component.status = 'warning';
        component.issues.push('No collections found in vector store');
      }

    } catch (error) {
      component.healthy = false;
      component.status = 'error';
      component.issues.push(`Vector store error: ${getErrorMessage(error)}`);
    }

    component.metrics.totalCheckTime = Date.now() - checkStartTime;
    this.componentHealth.set('vectorstore', component);
    
    return component;
  }

  /**
   * Check all collection health
   */
  private async checkCollectionHealth(): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];
    
    try {
      const collections = await this.vectorStore.listCollections();
      
      for (const collectionName of collections) {
        const checkStartTime = Date.now();
        const component: ComponentHealth = {
          name: collectionName,
          type: 'collection',
          healthy: true,
          status: 'healthy',
          lastCheck: checkStartTime,
          metrics: {},
          issues: [],
          uptime: Date.now() - this.startTime
        };

        try {
          // Use CollectionService for validation
          const validation = await this.collectionService.validateCollection(collectionName);
          
          component.healthy = validation.valid;
          component.status = validation.valid ? 'healthy' : 'error';
          component.issues = validation.issues;
          component.metrics.itemCount = validation.itemCount || 0;

          // If validation failed, attempt recovery if enabled
          if (!validation.valid && this.config.autoRecovery.enabled) {
            console.log(`[HealthMonitor] Attempting recovery for collection: ${collectionName}`);
            await this.attemptCollectionRecovery(collectionName, component);
          }

        } catch (error) {
          component.healthy = false;
          component.status = 'error';
          component.issues.push(`Collection check failed: ${getErrorMessage(error)}`);
        }

        component.metrics.totalCheckTime = Date.now() - checkStartTime;
        this.componentHealth.set(`collection_${collectionName}`, component);
        components.push(component);
      }

    } catch (error) {
      console.error('[HealthMonitor] Failed to check collection health:', error);
      
      // Create error component for collection system
      const errorComponent: ComponentHealth = {
        name: 'Collections',
        type: 'collection_system',
        healthy: false,
        status: 'error',
        lastCheck: Date.now(),
        metrics: {},
        issues: [`Collection system error: ${getErrorMessage(error)}`],
        uptime: Date.now() - this.startTime
      };
      
      components.push(errorComponent);
    }

    return components;
  }

  /**
   * Check system resource health
   */
  private async checkResourceHealth(): Promise<ComponentHealth> {
    const component: ComponentHealth = {
      name: 'Resources',
      type: 'system',
      healthy: true,
      status: 'healthy',
      lastCheck: Date.now(),
      metrics: {},
      issues: [],
      uptime: Date.now() - this.startTime
    };

    try {
      // Check memory usage if available
      if ((performance as any).memory) {
        const memInfo = (performance as any).memory;
        component.metrics.memoryUsedMB = memInfo.usedJSHeapSize / (1024 * 1024);
        component.metrics.memoryLimitMB = memInfo.jsHeapSizeLimit / (1024 * 1024);
        component.metrics.memoryUsagePercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;

        // Check for high memory usage
        if (component.metrics.memoryUsagePercent > 85) {
          component.status = 'warning';
          component.issues.push(`High memory usage: ${component.metrics.memoryUsagePercent.toFixed(1)}%`);
        }
      }

      // Check response times
      component.metrics.averageResponseTime = this.stats.averageCheckTime;
      if (this.stats.averageCheckTime > 5000) {
        component.status = 'warning';
        component.issues.push(`Slow response times: ${this.stats.averageCheckTime}ms`);
      }

    } catch (error) {
      component.healthy = false;
      component.status = 'error';
      component.issues.push(`Resource check failed: ${getErrorMessage(error)}`);
    }

    this.componentHealth.set('resources', component);
    return component;
  }

  // =============================================================================
  // RECOVERY AND SELF-HEALING
  // =============================================================================

  /**
   * Attempt to recover a collection
   */
  private async attemptCollectionRecovery(
    collectionName: string,
    component: ComponentHealth
  ): Promise<void> {
    this.stats.recoveryAttempts++;

    try {
      const recoveryResult = await this.collectionService.recoverCollection(
        collectionName,
        'soft'
      );

      if (recoveryResult.success) {
        this.stats.successfulRecoveries++;
        component.status = 'healthy';
        component.healthy = true;
        component.issues = [];
        console.log(`[HealthMonitor] Successfully recovered collection: ${collectionName}`);
      } else {
        component.issues.push(`Recovery failed: ${recoveryResult.errors.join(', ')}`);
      }

    } catch (error) {
      component.issues.push(`Recovery error: ${getErrorMessage(error)}`);
      console.error(`[HealthMonitor] Recovery failed for ${collectionName}:`, error);
    }
  }

  /**
   * Handle critical system errors
   */
  private async handleCriticalErrors(errorComponents: ComponentHealth[]): Promise<void> {
    console.error(`[HealthMonitor] Handling ${errorComponents.length} critical errors`);

    for (const component of errorComponents) {
      console.error(`[HealthMonitor] Critical error in ${component.name}:`, component.issues);

      // Attempt component-specific recovery
      if (component.type === 'collection' && this.config.autoRecovery.enabled) {
        await this.attemptCollectionRecovery(component.name, component);
      }
    }

    // Trigger alerts if enabled
    if (this.config.alerts.enabled && errorComponents.length >= this.config.alerts.criticalThreshold) {
      this.triggerAlert('critical', `${errorComponents.length} critical system errors detected`);
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async performInitialHealthCheck(): Promise<void> {
    console.log('[HealthMonitor] Performing initial system health check');
    
    try {
      const healthStatus = await this.performSystemHealthCheck();
      
      if (healthStatus.healthy) {
        console.log('[HealthMonitor] Initial health check passed');
      } else {
        console.warn(`[HealthMonitor] Initial health check found issues: ${healthStatus.overall.criticalErrors} critical, ${healthStatus.overall.warnings} warnings`);
      }
    } catch (error) {
      console.error('[HealthMonitor] Initial health check failed:', error);
      throw error;
    }
  }

  private schedulePeriodicChecks(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      if (!this.isMonitoring) return;

      try {
        await this.performSystemHealthCheck();
      } catch (error) {
        console.error('[HealthMonitor] Periodic health check failed:', error);
      }
    }, this.config.interval);
  }

  private updateCheckStatistics(checkTime: number, failed: boolean): void {
    if (failed) {
      this.stats.failedChecks++;
    }

    // Update average check time
    const totalTime = this.stats.averageCheckTime * (this.stats.totalChecks - 1) + checkTime;
    this.stats.averageCheckTime = totalTime / this.stats.totalChecks;
    
    // Update uptime
    this.stats.uptime = Date.now() - this.startTime;
  }

  private generateSystemRecommendations(components: ComponentHealth[]): string[] {
    const recommendations: string[] = [];
    
    const errorComponents = components.filter(c => c.status === 'error');
    const warningComponents = components.filter(c => c.status === 'warning');

    if (errorComponents.length > 0) {
      recommendations.push(`Address ${errorComponents.length} critical errors immediately`);
    }

    if (warningComponents.length > 0) {
      recommendations.push(`Monitor ${warningComponents.length} components with warnings`);
    }

    // Memory recommendations
    const resourceComponent = components.find(c => c.name === 'Resources');
    if (resourceComponent?.metrics.memoryUsagePercent > 80) {
      recommendations.push('Consider reducing memory usage or increasing available memory');
    }

    return recommendations;
  }

  private aggregateCollectionHealth(collections: ComponentHealth[]): ComponentHealth {
    const healthyCount = collections.filter(c => c.healthy).length;
    const totalCount = collections.length;
    
    return {
      name: 'Collections',
      type: 'collection_aggregate',
      healthy: healthyCount === totalCount,
      status: healthyCount === totalCount ? 'healthy' : healthyCount > totalCount / 2 ? 'warning' : 'error',
      lastCheck: Date.now(),
      metrics: {
        totalCollections: totalCount,
        healthyCollections: healthyCount,
        healthPercentage: totalCount > 0 ? (healthyCount / totalCount) * 100 : 0
      },
      issues: collections.filter(c => !c.healthy).map(c => `${c.name}: ${c.issues.join(', ')}`),
      uptime: Date.now() - this.startTime
    };
  }

  private triggerAlert(level: 'warning' | 'critical', message: string): void {
    console.log(`[HealthMonitor] ALERT [${level.toUpperCase()}]: ${message}`);
    
    // In a full implementation, this would send notifications
    // to external monitoring systems, email, Slack, etc.
  }

  /**
   * Get current monitoring statistics
   */
  getStats(): MonitoringStats {
    return { ...this.stats };
  }

  /**
   * Get all component health statuses
   */
  getAllComponentHealth(): ComponentHealth[] {
    return Array.from(this.componentHealth.values());
  }
}