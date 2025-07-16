import { PromptConfig, BatchExecutePromptParams } from '../types';

/**
 * Utility for parsing and validating prompt configurations
 * Follows SRP by focusing only on prompt parsing logic
 */
export class PromptParser {

  /**
   * Validate batch execution parameters
   */
  validateParameters(params: BatchExecutePromptParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.prompts || params.prompts.length === 0) {
      errors.push('At least one prompt is required');
    }

    if (params.prompts && params.prompts.length > 100) {
      errors.push('Maximum of 100 prompts allowed per batch');
    }

    // Validate individual prompts
    if (params.prompts) {
      params.prompts.forEach((prompt, index) => {
        const promptErrors = this.validatePromptConfig(prompt, index);
        errors.push(...promptErrors);
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate individual prompt configuration
   */
  validatePromptConfig(promptConfig: any, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Prompt ${index + 1}`;

    if (!promptConfig.prompt || typeof promptConfig.prompt !== 'string') {
      errors.push(`${prefix}: prompt text is required and must be a string`);
    }

    if (promptConfig.prompt && promptConfig.prompt.length > 10000) {
      errors.push(`${prefix}: prompt text cannot exceed 10,000 characters`);
    }

    if (promptConfig.sequence !== undefined && (typeof promptConfig.sequence !== 'number' || promptConfig.sequence < 0)) {
      errors.push(`${prefix}: sequence must be a non-negative number`);
    }

    if (promptConfig.contextFiles && !Array.isArray(promptConfig.contextFiles)) {
      errors.push(`${prefix}: contextFiles must be an array`);
    }

    if (promptConfig.contextFromSteps && !Array.isArray(promptConfig.contextFromSteps)) {
      errors.push(`${prefix}: contextFromSteps must be an array`);
    }

    if (promptConfig.action) {
      const actionErrors = this.validateActionConfig(promptConfig.action, prefix);
      errors.push(...actionErrors);
    }

    return errors;
  }

  /**
   * Validate action configuration
   */
  validateActionConfig(action: any, prefix: string): string[] {
    const errors: string[] = [];

    if (!action.type) {
      errors.push(`${prefix}: action.type is required`);
    }

    if (!action.targetPath) {
      errors.push(`${prefix}: action.targetPath is required`);
    }

    const validActionTypes = ['create', 'append', 'prepend', 'replace', 'findReplace'];
    if (action.type && !validActionTypes.includes(action.type)) {
      errors.push(`${prefix}: action.type must be one of: ${validActionTypes.join(', ')}`);
    }

    if (action.type === 'findReplace' && !action.findText) {
      errors.push(`${prefix}: action.findText is required for findReplace action`);
    }

    if (action.position !== undefined && (typeof action.position !== 'number' || action.position < 0)) {
      errors.push(`${prefix}: action.position must be a non-negative number`);
    }

    return errors;
  }

  /**
   * Normalize prompt configurations
   */
  normalizePromptConfigs(prompts: any[]): PromptConfig[] {
    return prompts.map((prompt, index) => ({
      prompt: prompt.prompt,
      provider: prompt.provider,
      model: prompt.model,
      contextFiles: prompt.contextFiles || [],
      workspace: prompt.workspace,
      id: prompt.id || `prompt_${index + 1}`,
      sequence: prompt.sequence || 0,
      parallelGroup: prompt.parallelGroup || 'default',
      includePreviousResults: prompt.includePreviousResults || false,
      contextFromSteps: prompt.contextFromSteps || [],
      action: prompt.action,
      agent: prompt.agent
    }));
  }

  /**
   * Extract unique sequences from prompts
   */
  extractSequences(prompts: PromptConfig[]): number[] {
    const sequences = new Set(prompts.map(p => p.sequence || 0));
    return Array.from(sequences).sort((a, b) => a - b);
  }

  /**
   * Extract unique parallel groups from prompts
   */
  extractParallelGroups(prompts: PromptConfig[]): string[] {
    const groups = new Set(prompts.map(p => p.parallelGroup || 'default'));
    return Array.from(groups).sort();
  }

  /**
   * Get execution plan summary
   */
  getExecutionPlan(prompts: PromptConfig[]): {
    totalPrompts: number;
    sequences: number[];
    parallelGroups: string[];
    estimatedDuration: string;
  } {
    const sequences = this.extractSequences(prompts);
    const parallelGroups = this.extractParallelGroups(prompts);
    
    // Rough estimation based on typical LLM response times
    const avgPromptTime = 5; // seconds
    const maxConcurrency = Math.max(...parallelGroups.map(group => 
      prompts.filter(p => (p.parallelGroup || 'default') === group).length
    ));
    
    const estimatedSeconds = sequences.length * avgPromptTime * Math.ceil(prompts.length / maxConcurrency);
    const estimatedDuration = this.formatDuration(estimatedSeconds);

    return {
      totalPrompts: prompts.length,
      sequences,
      parallelGroups,
      estimatedDuration
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }
}