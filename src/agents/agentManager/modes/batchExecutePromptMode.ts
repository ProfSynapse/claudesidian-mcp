/**
 * BatchExecutePromptMode - Refactored Implementation
 * 
 * This file now exports the refactored BatchExecutePromptMode that follows SOLID principles.
 * The implementation has been broken down into focused, reusable services.
 * 
 * Key improvements:
 * - Single Responsibility Principle: Each service handles one concern
 * - Open/Closed Principle: Easy to extend without modifying existing code  
 * - Dependency Inversion: Depends on abstractions, not concrete implementations
 * - DRY: Eliminates duplicate code across execution methods
 * 
 * File structure:
 * - BatchExecutePromptMode.ts: Main orchestrator (150 lines)
 * - services/: Specialized services for execution, validation, etc.
 * - types/: Interface and type definitions
 * - utils/: Utility classes for parsing and schema generation
 */

// Re-export the refactored implementation for backward compatibility
export { BatchExecutePromptMode } from './batchExecutePrompt';
export type { BatchExecutePromptParams, BatchExecutePromptResult } from './batchExecutePrompt';

// Export additional types and services for advanced usage
export type {
  PromptConfig,
  ContentAction,
  ExecutionContext,
  PromptExecutionResult,
  ExecutionStats,
  MergedResponse
} from './batchExecutePrompt/types';

export {
  BudgetValidator,
  ContextBuilder,
  PromptExecutor,
  SequenceManager,
  ResultProcessor,
  ActionExecutor
} from './batchExecutePrompt/services';

export {
  PromptParser,
  SchemaBuilder
} from './batchExecutePrompt/utils';