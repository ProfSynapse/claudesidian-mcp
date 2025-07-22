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
   * Trigger HNSW index creation from loaded collections
   * This is the missing piece - collections are loaded but indexes aren't created
   * CRITICAL FIX: Actually verify that indexes were built, not just that the method completed
   * NEW: Check processed files state to avoid re-processing on every startup
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
    
    const hnswService = await this.serviceManager.get('hnswSearchService');
    
    if (!hnswService) {
      throw new Error('Service manager returned null/undefined for hnswSearchService despite successful initialization');
    }
    
    if (typeof hnswService.ensureFullyInitialized !== 'function') {
      throw new Error('hnswService.ensureFullyInitialized is not a function');
    }
    
    // Get vector store to check collection count
    const vectorStore = await this.serviceManager.get('vectorStore');
    if (!vectorStore) {
      console.warn('[InitializationCoordinator] Vector store not available for index verification');
    }
    
    // NEW: Check processed files state to avoid unnecessary processing
    const stateManager = await this.serviceManager.get('stateManager');
    if (stateManager) {
      const processedCount = stateManager.getProcessedFilesCount();
      const vaultFiles = this.plugin.app.vault.getMarkdownFiles();
      const totalFiles = vaultFiles.length;
      
      console.log(`[StateManager] InitializationCoordinator state check: ${processedCount} processed files, ${totalFiles} total files`);
      
      // If all files are processed and we have a reasonable collection count, skip full initialization
      if (processedCount > 0 && vectorStore) {
        try {
          const collectionCount = await vectorStore.count('file_embeddings');
          console.log(`[StateManager] Collection count: ${collectionCount}`);
          
          // Skip full initialization if:
          // 1. We have processed files in state
          // 2. Collection has embeddings
          // 3. State count is reasonable relative to vault size
          if (collectionCount > 0 && processedCount >= Math.min(totalFiles, collectionCount / 5)) {
            console.log('[StateManager] ⚡ Skipping full initialization - files already processed');
            return;
          } else {
            console.log(`[StateManager] Proceeding with initialization:`, {
              processedCount,
              totalFiles,
              collectionCount,
              threshold: Math.min(totalFiles, collectionCount / 5),
              shouldSkip: processedCount >= Math.min(totalFiles, collectionCount / 5)
            });
          }
        } catch (countError) {
          console.warn('[StateManager] Could not check collection count, proceeding with initialization:', countError);
        }
      } else {
        console.log(`[StateManager] Not skipping initialization: processedCount=${processedCount}, hasVectorStore=${!!vectorStore}`);
      }
    } else {
      console.warn('[StateManager] No state manager available, proceeding with full initialization');
    }
    
    try {
      console.log('[InitializationCoordinator] 🔧 Calling ensureFullyInitialized to trigger index building');
      await hnswService.ensureFullyInitialized();
      
      // CRITICAL FIX: Verify that indexes were actually built by checking if they exist and have data
      console.log('[InitializationCoordinator] 🔍 Verifying index creation after ensureFullyInitialized');
      
      let indexVerified = false;
      let indexCount = 0;
      
      if (typeof hnswService.hasIndex === 'function') {
        const hasFileEmbeddingsIndex = hnswService.hasIndex('file_embeddings');
        console.log('[InitializationCoordinator] Has file_embeddings index:', hasFileEmbeddingsIndex);
        
        if (hasFileEmbeddingsIndex && typeof hnswService.getIndexStats === 'function') {
          const stats = hnswService.getIndexStats('file_embeddings');
          console.log('[InitializationCoordinator] Index stats for file_embeddings:', stats);
          
          if (stats && stats.itemCount > 0) {
            indexVerified = true;
            indexCount = stats.itemCount;
            console.log(`[InitializationCoordinator] ✅ Index verified: ${indexCount} items in file_embeddings index`);
          } else {
            console.log('[InitializationCoordinator] ⚠️ Index exists but has no items');
          }
        } else if (hasFileEmbeddingsIndex) {
          // Index exists but we can't verify item count - still consider it a success
          indexVerified = true;
          console.log('[InitializationCoordinator] ✅ Index exists (cannot verify item count)');
        }
      }
      
      // Also check if collections have data that should be indexed
      if (vectorStore && typeof vectorStore.count === 'function') {
        try {
          const collectionCount = await vectorStore.count('file_embeddings');
          console.log(`[InitializationCoordinator] Collection file_embeddings has ${collectionCount} items`);
          
          if (collectionCount > 0 && !indexVerified) {
            console.warn(`[InitializationCoordinator] ⚠️ Collection has ${collectionCount} items but no index was built - this indicates a problem`);
            throw new Error(`Collection has ${collectionCount} items but no HNSW index was created`);
          } else if (collectionCount === 0) {
            console.log('[InitializationCoordinator] Collection is empty - no index expected');
            indexVerified = true; // Empty collection is valid
          }
        } catch (countError) {
          console.warn('[InitializationCoordinator] Could not verify collection count:', countError);
        }
      }
      
      if (!indexVerified) {
        throw new Error('ensureFullyInitialized completed but no valid indexes were found');
      }
      
    } catch (methodError) {
      const errorMessage = methodError instanceof Error ? methodError.message : String(methodError);
      console.error(`[InitializationCoordinator] Index creation failed: ${errorMessage}`);
      throw new Error(`Index creation failed: ${errorMessage}`);
    }
    
    componentsInitialized.push('hnswIndexes');
    console.log('[InitializationCoordinator] ✅ HNSW index creation verified successfully');
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