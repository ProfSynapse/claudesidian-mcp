/**
 * Interface for coordinating the entire initialization process
 * Follows Open/Closed Principle - extensible for new initialization phases
 * Follows Dependency Inversion Principle - depends on abstractions
 */

export enum InitializationPhase {
  FRAMEWORK = 'framework',
  COLLECTIONS = 'collections',
  SERVICES = 'services',
  AGENTS = 'agents',
  COMPLETE = 'complete'
}

export interface InitializationPhaseResult {
  phase: InitializationPhase;
  success: boolean;
  duration: number;
  componentsInitialized: string[];
  errors: Array<{ component: string; error: Error }>;
}

export interface InitializationProgress {
  currentPhase: InitializationPhase;
  completedPhases: InitializationPhase[];
  totalProgress: number; // 0-100
  isComplete: boolean;
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface IInitializationCoordinator {
  /**
   * Start the complete initialization process
   */
  initializeAll(): Promise<InitializationPhaseResult[]>;

  /**
   * Initialize a specific phase
   */
  initializePhase(phase: InitializationPhase): Promise<InitializationPhaseResult>;

  /**
   * Get current initialization progress
   */
  getProgress(): InitializationProgress;

  /**
   * Check if initialization is complete
   */
  isComplete(): boolean;

  /**
   * Check if a specific phase is complete
   */
  isPhaseComplete(phase: InitializationPhase): boolean;

  /**
   * Wait for initialization to complete
   */
  waitForCompletion(timeout?: number): Promise<boolean>;

  /**
   * Wait for a specific phase to complete
   */
  waitForPhase(phase: InitializationPhase, timeout?: number): Promise<boolean>;

  /**
   * Get initialization results
   */
  getResults(): InitializationPhaseResult[];

  /**
   * Reset initialization state
   */
  reset(): void;
}