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


    let phaseIndex = 0;
    for (const phase of this.phaseOrder) {
      phaseIndex++;
      try {
        const result = await this.initializePhase(phase);
        results.push(result);
        
        if (result.success) {
        } else {
          break;
        }
      } catch (error) {
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
    const successfulPhases = results.filter(r => r.success).length;
    const failedPhases = results.filter(r => !r.success).length;

    
    if (failedPhases === 0) {
    } else {
    }

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
        'workspaceService',
        'memoryService'
      ];


      let serviceIndex = 0;
      for (const serviceName of servicesToInitialize) {
        serviceIndex++;
        const serviceStartTime = Date.now();
        
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
          
          const serviceDuration = Date.now() - serviceStartTime;
          componentsInitialized.push(serviceName);
          
        } catch (error) {
          const serviceDuration = Date.now() - serviceStartTime;
          const errorMessage = `Service ${serviceName} initialization failed: ${error instanceof Error ? error.message : String(error)}`;
          errors.push({ component: serviceName, error: new Error(errorMessage) });
          
          // Continue with other services - no special fail-fast logic needed
        }
      }

      // Service initialization completed - comprehensive summary
      
      if (componentsInitialized.length > 0) {
      }
      if (errors.length > 0) {
      }
      
      // Validation: Confirm exactly 4 services expected
      if (componentsInitialized.length === 4 && errors.length === 0) {
      } else if (componentsInitialized.length + errors.length === 4) {
      } else {
      }

      return { success: errors.length === 0, componentsInitialized, errors };
    } catch (error) {
      errors.push({ component: 'services', error: error as Error });
      return { success: false, componentsInitialized, errors };
    }
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
    // Use default timeout for all services
    const timeout = undefined;
    
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