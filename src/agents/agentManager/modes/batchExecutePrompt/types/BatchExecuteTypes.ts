import { CommonParameters } from '../../../../../types';

/**
 * Parameters for batch LLM prompt execution
 */
export interface BatchExecutePromptParams extends CommonParameters {
  /** Array of prompts to execute - can be parallel or sequential */
  prompts: Array<{
    /** The prompt text to send to the LLM */
    prompt: string;
    /** Optional provider to use (defaults to settings default) */
    provider?: string;
    /** Optional model to use (defaults to settings default) */
    model?: string;
    /** Optional context files to include */
    contextFiles?: string[];
    /** Optional workspace for context */
    workspace?: string;
    /** Custom identifier for this prompt */
    id?: string;
    /** Sequence number for ordered execution (sequences execute in numerical order: 0, 1, 2, etc.) */
    sequence?: number;
    /** Parallel group within sequence - prompts with same parallelGroup run together, different groups run sequentially within the sequence */
    parallelGroup?: string;
    /** Whether to include previous step results as context */
    includePreviousResults?: boolean;
    /** Specific IDs of previous steps to include as context (if not specified, includes all previous results when includePreviousResults is true) */
    contextFromSteps?: string[];
    /** Optional action to perform with the LLM response */
    action?: {
      type: 'create' | 'append' | 'prepend' | 'replace' | 'findReplace';
      targetPath: string;
      position?: number;
      findText?: string; // Required for 'findReplace' type
      replaceAll?: boolean; // Optional for 'findReplace' type
      caseSensitive?: boolean; // Optional for 'findReplace' type
      wholeWord?: boolean; // Optional for 'findReplace' type
    };
    /** Optional custom agent/prompt to use */
    agent?: string;
  }>;
  /** Whether to merge all responses into a single result */
  mergeResponses?: boolean;
}

/**
 * Individual prompt configuration for execution
 */
export interface PromptConfig {
  prompt: string;
  provider?: string;
  model?: string;
  contextFiles?: string[];
  workspace?: string;
  id?: string;
  sequence?: number;
  parallelGroup?: string;
  includePreviousResults?: boolean;
  contextFromSteps?: string[];
  action?: ContentAction;
  agent?: string;
}

/**
 * Content action configuration
 */
export interface ContentAction {
  type: 'create' | 'append' | 'prepend' | 'replace' | 'findReplace';
  targetPath: string;
  position?: number;
  findText?: string;
  replaceAll?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/**
 * Execution context for prompt processing
 */
export interface ExecutionContext {
  sessionId?: string;
  context?: any;
  previousResults: Map<number, PromptExecutionResult[]>;
  allResults: PromptExecutionResult[];
}

/**
 * Parameters for individual prompt execution
 */
export interface PromptExecutionParams {
  systemPrompt: string;
  userPrompt: string;
  filepaths?: string[];
  provider?: string;
  model?: string;
  workspace?: string;
  sessionId?: string;
}

/**
 * Result from individual prompt execution
 */
export interface PromptExecutionResult {
  id?: string;
  prompt: string;
  success: boolean;
  response?: string;
  provider?: string;
  model?: string;
  agent?: string;
  error?: string;
  executionTime?: number;
  sequence?: number;
  parallelGroup?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
  filesIncluded?: string[];
  actionPerformed?: {
    type: string;
    targetPath: string;
    success: boolean;
    error?: string;
  };
}