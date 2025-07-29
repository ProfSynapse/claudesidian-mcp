/**
 * InitializationCoordinator - Orchestrates the entire initialization process
 * Follows Single Responsibility Principle - only coordinates initialization phases
 * Follows Open/Closed Principle - extensible for new phases
 * Implements Boy Scout Rule - cleaner phase-based initialization
 */

import { Plugin } from 'obsidian';
import { 
  IInitializationCoordinator, 
  InitializationPhase, 
  InitializationPhaseResult, 
  InitializationProgress 
} from './interfaces/IInitializationCoordinator';
import { IInitializationStateManager } from './interfaces/IInitializationStateManager';
import { ICollectionLoadingCoordinator } from './interfaces/ICollectionLoadingCoordinator';

export class InitializationCoordinator implements IInitializationCoordinator {
  private readonly phaseOrder: InitializationPhase[] = [
    InitializationPhase.FRAMEWORK,
    InitializationPhase.COLLECTIONS,
    InitializationPhase.SERVICES,
    InitializationPhase.AGENTS,
    InitializationPhase.COMPLETE
  ];

  private readonly phaseResults = new Map<InitializationPhase, InitializationPhaseResult>();
  private startTime: number = 0;
  private currentPhase: InitializationPhase = InitializationPhase.FRAMEWORK;

  constructor(
    private readonly plugin: Plugin,
    private readonly stateManager: IInitializationStateManager,
    private readonly collectionCoordinator: ICollectionLoadingCoordinator,
    private readonly serviceManager: any // Will be injected
  ) {}

  /**
   * Start the complete initialization process
   */
  async initializeAll(): Promise<InitializationPhaseResult[]> {
    this.startTime = Date.now();
    const results: InitializationPhaseResult[] = [];

    console.log('[InitializationCoordinator] Starting complete initialization...');

    for (const phase of this.phaseOrder) {
      try {
        const result = await this.initializePhase(phase);
        results.push(result);
        
        if (!result.success) {
          console.error(`[InitializationCoordinator] Phase ${phase} failed, stopping initialization`);
          break;
        }
      } catch (error) {
        console.error(`[InitializationCoordinator] Exception in phase ${phase}:`, error);
        const errorResult: InitializationPhaseResult = {
          phase,
          success: false,
          duration: 0,
          componentsInitialized: [],
          errors: [{ component: 'phase', error: error as Error }]
        };
        results.push(errorResult);
        break;
      }
    }

    const totalDuration = Date.now() - this.startTime;
    console.log(`[InitializationCoordinator] Initialization completed in ${totalDuration}ms`);

    return results;
  }

  /**
   * Initialize a specific phase
   */
  async initializePhase(phase: InitializationPhase): Promise<InitializationPhaseResult> {
    const existingResult = this.phaseResults.get(phase);
    if (existingResult && existingResult.success) {
      return existingResult;
    }

    this.currentPhase = phase;
    const startTime = Date.now();
    
    console.log(`[InitializationCoordinator] Starting phase: ${phase}`);

    try {
      const result = await this.executePhase(phase);
      const duration = Date.now() - startTime;
      
      const phaseResult: InitializationPhaseResult = {
        phase,
        success: result.success,
        duration,
        componentsInitialized: result.componentsInitialized,
        errors: result.errors
      };

      this.phaseResults.set(phase, phaseResult);
      
      console.log(`[InitializationCoordinator] Phase ${phase} completed in ${duration}ms`);
      return phaseResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const phaseResult: InitializationPhaseResult = {
        phase,
        success: false,
        duration,
        componentsInitialized: [],
        errors: [{ component: 'phase', error: error as Error }]
      };

      this.phaseResults.set(phase, phaseResult);
      console.error(`[InitializationCoordinator] Phase ${phase} failed after ${duration}ms:`, error);
      return phaseResult;
    }
  }

  /**
   * Execute a specific phase
   */
  private async executePhase(phase: InitializationPhase): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    switch (phase) {
      case InitializationPhase.FRAMEWORK:
        return this.initializeFramework();

      case InitializationPhase.COLLECTIONS:
        return this.initializeCollections();

      case InitializationPhase.SERVICES:
        return this.initializeServices();

      case InitializationPhase.AGENTS:
        return this.initializeAgents();

      case InitializationPhase.COMPLETE:
        return this.completeInitialization();

      default:
        throw new Error(`Unknown initialization phase: ${phase}`);
    }
  }

  /**
   * Initialize framework components
   */
  private async initializeFramework(): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    try {
      // Initialize basic framework components
      await this.initializeComponent('settings', async () => {
        // Settings initialization would go here
        console.log('[InitializationCoordinator] Framework settings initialized');
      });
      componentsInitialized.push('settings');

      await this.initializeComponent('directories', async () => {
        // Directory initialization would go here
        console.log('[InitializationCoordinator] Framework directories initialized');
      });
      componentsInitialized.push('directories');

      return { success: true, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'framework', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
  }

  /**
   * Initialize collections
   */
  private async initializeCollections(): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    try {
      const result = await this.collectionCoordinator.ensureCollectionsLoaded();
      
      if (result.success) {
        componentsInitialized.push('collections');
        console.log(`[InitializationCoordinator] Collections initialized: ${result.collectionsLoaded} loaded`);
      } else {
        errors.push(...result.errors.map(e => ({ component: e.collectionName, error: e.error })));
      }

      return { success: result.success, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'collections', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    try {
      // Initialize services that depend on collections
      const servicesToInitialize = [
        'vectorStore',
        'embeddingService',
        'hnswSearchService',
        'workspaceService',
        'memoryService'
      ];

      for (const serviceName of servicesToInitialize) {
        try {
          await this.initializeComponent(serviceName, async () => {
            if (!this.serviceManager) {
              throw new Error(`Service manager is null/undefined for service ${serviceName}`);
            }
            
            if (typeof this.serviceManager.initializeService === 'function') {
              await this.serviceManager.initializeService(serviceName);
            } else if (typeof this.serviceManager.get === 'function') {
              const service = await this.serviceManager.get(serviceName);
              if (!service) {
                throw new Error(`Service manager returned null/undefined for ${serviceName}`);
              }
            } else {
              throw new Error(`Service manager has no usable methods`);
            }
          });
          
          componentsInitialized.push(serviceName);
          
        } catch (error) {
          const errorMessage = `Service ${serviceName} initialization failed: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[InitializationCoordinator] ${errorMessage}`);
          errors.push({ component: serviceName, error: new Error(errorMessage) });
          
          // FAIL FAST - don't continue if critical services fail
          if (serviceName === 'hnswSearchService') {
            throw new Error(`CRITICAL FAILURE: HNSW Search Service initialization failed: ${errorMessage}`);
          }
        }
      }

      // CRITICAL: Trigger HNSW index creation after all services are initialized
      await this.triggerHnswIndexCreation(componentsInitialized, errors);

      return { success: errors.length === 0, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'services', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
  }

  /**
   * Fast HNSW index health check and background initialization scheduling
   * STARTUP OPTIMIZATION: No longer blocks startup - just checks if indexes exist and schedules background work if needed
   * This replaces the previous blocking ensureFullyInitialized() approach
   */
  private async triggerHnswIndexCreation(
    componentsInitialized: string[], 
    errors: Array<{ component: string; error: Error }>
  ): Promise<void> {
    // Verify HNSW service was initialized
    if (!componentsInitialized.includes('hnswSearchService')) {
      const errorMsg = `hnswSearchService not in completed components list. Completed: [${componentsInitialized.join(', ')}]`;
      console.error(`[InitializationCoordinator] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    if (!this.serviceManager) {
      throw new Error('Service manager is null/undefined during index creation');
    }
    
    if (typeof this.serviceManager.get !== 'function') {
      throw new Error('Service manager get method is not a function');
    }
    
    console.log('[InitializationCoordinator] 🚀 Starting fast HNSW index health check...');
    
    try {
      // Get required services for health checking
      const healthChecker = await this.serviceManager.get('hnswIndexHealthChecker');
      const backgroundIndexingService = await this.serviceManager.get('backgroundIndexingService');
      const hnswService = await this.serviceManager.get('hnswSearchService');
      
      if (!healthChecker) {
        console.warn('[InitializationCoordinator] Health checker not available, falling back to blocking initialization');
        const hnswService = await this.serviceManager.get('hnswSearchService');
        if (hnswService && typeof hnswService.ensureFullyInitialized === 'function') {
          await hnswService.ensureFullyInitialized();
        }
        return;
      }
      
      console.log('[InitializationCoordinator] 🔍 Performing fast index health check (non-blocking)...');
      
      // FAST HEALTH CHECK: Only metadata comparisons, no WASM loading
      const healthSummary = await healthChecker.checkAllIndexes({
        includeStorageInfo: false,
        checkContentHash: true,
        validateItemCounts: true,
        tolerance: 0.05 // 5% tolerance for item count differences
      });
      
      console.log('[InitializationCoordinator] ⚡ Health check completed in:', healthSummary.totalCheckTime + 'ms');
      console.log('[InitializationCoordinator] Health summary:', {
        allHealthy: healthSummary.allHealthy,
        healthyCollections: healthSummary.healthyCollections.length,
        needsBuildingCollections: healthSummary.needsBuildingCollections.length,
        needsUpdateCollections: healthSummary.needsUpdateCollections.length,
        corruptedCollections: healthSummary.corruptedCollections.length
      });
      
      if (healthSummary.allHealthy) {
        console.log('[InitializationCoordinator] ✅ All indexes are healthy - ready for fast loading on first search');
        
        // Mark HNSW service as ready for loading
        if (hnswService && typeof hnswService.markReadyForLoading === 'function') {
          hnswService.markReadyForLoading();
          // Mark collections as ready
          for (const collectionName of healthSummary.healthyCollections) {
            if (typeof hnswService.markCollectionReady === 'function') {
              hnswService.markCollectionReady(collectionName);
            }
          }
        }
        
        console.log('[InitializationCoordinator] 🎉 HNSW startup optimization complete - no background work needed');
        
      } else {
        console.log('[InitializationCoordinator] 🔄 Indexes need building/updating - scheduling background work');
        
        // Collect collections that need work
        const collectionsNeedingWork = [
          ...healthSummary.needsBuildingCollections,
          ...healthSummary.needsUpdateCollections,
          ...healthSummary.corruptedCollections
        ];
        
        if (backgroundIndexingService && collectionsNeedingWork.length > 0) {
          console.log(`[InitializationCoordinator] 📅 Scheduling background indexing for ${collectionsNeedingWork.length} collections:`, collectionsNeedingWork);
          
          // Mark collections as building in HNSW service
          if (hnswService) {
            for (const collectionName of collectionsNeedingWork) {
              if (typeof hnswService.markCollectionBuilding === 'function') {
                hnswService.markCollectionBuilding(collectionName);
              }
            }
          }
          
          // Schedule the background work (non-blocking)
          await backgroundIndexingService.scheduleIndexing(collectionsNeedingWork);
          
          console.log('[InitializationCoordinator] ✅ Background indexing scheduled - startup can continue');
        } else {
          console.warn('[InitializationCoordinator] Background indexing service not available, indexes will need manual rebuilding');
        }
      }
      
      console.log('[InitializationCoordinator] ⚡ HNSW initialization completed (non-blocking)');
      
    } catch (healthCheckError) {
      const errorMessage = healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError);
      console.error(`[InitializationCoordinator] Health check failed: ${errorMessage}`);
      
      // Fallback to blocking initialization if health check fails
      console.warn('[InitializationCoordinator] Falling back to blocking HNSW initialization due to health check failure');
      try {
        const hnswService = await this.serviceManager.get('hnswSearchService');
        if (hnswService && typeof hnswService.ensureFullyInitialized === 'function') {
          await hnswService.ensureFullyInitialized();
        }
      } catch (fallbackError) {
        console.error('[InitializationCoordinator] Fallback initialization also failed:', fallbackError);
        throw new Error(`Both health check and fallback initialization failed: ${errorMessage}`);
      }
    }
    
    // Mark as complete - either health check succeeded or fallback completed
    console.log('[InitializationCoordinator] ✅ HNSW startup optimization completed successfully');
  }

  /**
   * Initialize agents
   */
  private async initializeAgents(): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    try {
      await this.initializeComponent('agents', async () => {
        // Initialize remaining services that support agents
        const agentServices = ['fileEventManager', 'usageStatsService'];
        
        for (const serviceName of agentServices) {
          try {
            if (this.serviceManager && typeof this.serviceManager.get === 'function') {
              await this.serviceManager.get(serviceName);
              console.log(`[InitializationCoordinator] Agent service ${serviceName} initialized`);
            }
          } catch (error) {
            console.warn(`[InitializationCoordinator] Failed to initialize agent service ${serviceName}:`, error);
          }
        }
        
        console.log('[InitializationCoordinator] Agents initialized');
      });
      componentsInitialized.push('agents');

      return { success: true, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'agents', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
  }

  /**
   * Complete initialization
   */
  private async completeInitialization(): Promise<{
    success: boolean;
    componentsInitialized: string[];
    errors: Array<{ component: string; error: Error }>;
  }> {
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: Error }> = [];

    try {
      await this.initializeComponent('completion', async () => {
        // Final initialization steps
        console.log('[InitializationCoordinator] Initialization completed');
      });
      componentsInitialized.push('completion');

      return { success: true, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'completion', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
  }

  /**
   * Initialize a single component with state management
   */
  private async initializeComponent(componentName: string, initializer: () => Promise<void>): Promise<void> {
    // Use longer timeout for HNSW service specifically
    const timeout = componentName === 'hnswSearchService' ? 180000 : undefined; // 3 minutes for HNSW
    
    const result = await this.stateManager.ensureInitialized(
      componentName,
      initializer,
      timeout
    );

    if (!result.success) {
      throw result.error || new Error(`Failed to initialize ${componentName}`);
    }
  }

  /**
   * Get current initialization progress
   */
  getProgress(): InitializationProgress {
    const completedPhases = Array.from(this.phaseResults.keys()).filter(
      phase => this.phaseResults.get(phase)?.success
    );

    const totalProgress = (completedPhases.length / this.phaseOrder.length) * 100;

    return {
      currentPhase: this.currentPhase,
      completedPhases,
      totalProgress,
      isComplete: this.isComplete(),
      startTime: this.startTime,
      estimatedTimeRemaining: this.estimateTimeRemaining()
    };
  }

  /**
   * Estimate remaining time based on current progress
   */
  private estimateTimeRemaining(): number | undefined {
    if (this.startTime === 0) return undefined;

    const elapsed = Date.now() - this.startTime;
    const progress = this.getProgress().totalProgress;
    
    if (progress === 0) return undefined;
    
    const totalEstimated = (elapsed / progress) * 100;
    return Math.max(0, totalEstimated - elapsed);
  }

  /**
   * Check if initialization is complete
   */
  isComplete(): boolean {
    return this.phaseResults.has(InitializationPhase.COMPLETE) &&
           this.phaseResults.get(InitializationPhase.COMPLETE)?.success === true;
  }

  /**
   * Check if a specific phase is complete
   */
  isPhaseComplete(phase: InitializationPhase): boolean {
    return this.phaseResults.has(phase) &&
           this.phaseResults.get(phase)?.success === true;
  }

  /**
   * Wait for initialization to complete
   */
  async waitForCompletion(timeout = 120000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.isComplete()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  /**
   * Wait for a specific phase to complete
   */
  async waitForPhase(phase: InitializationPhase, timeout = 60000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.isPhaseComplete(phase)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  /**
   * Get initialization results
   */
  getResults(): InitializationPhaseResult[] {
    return Array.from(this.phaseResults.values());
  }

  /**
   * Reset initialization state
   */
  reset(): void {
    this.phaseResults.clear();
    this.startTime = 0;
    this.currentPhase = InitializationPhase.FRAMEWORK;
  }
}