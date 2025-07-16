/**
 * ParameterValidator - Validates input parameters for state creation
 * Follows Single Responsibility Principle by focusing only on validation
 */

import { CreateStateParams } from '../../../../types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Service responsible for validating create state parameters
 * Follows SRP by focusing only on parameter validation logic
 */
export class ParameterValidator {
  /**
   * Validate create state parameters
   */
  validate(params: CreateStateParams): ValidationResult {
    const warnings: string[] = [];

    // Check required fields
    if (!params.name) {
      return {
        isValid: false,
        error: 'State name is required'
      };
    }

    if (typeof params.name !== 'string' || params.name.trim().length === 0) {
      return {
        isValid: false,
        error: 'State name must be a non-empty string'
      };
    }

    // Validate optional fields
    if (params.description && typeof params.description !== 'string') {
      warnings.push('Description should be a string, using empty description');
    }

    if (params.maxFiles && (typeof params.maxFiles !== 'number' || params.maxFiles < 1)) {
      warnings.push('maxFiles should be a positive number, using default (10)');
    }

    if (params.maxTraces && (typeof params.maxTraces !== 'number' || params.maxTraces < 1)) {
      warnings.push('maxTraces should be a positive number, using default (20)');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      warnings.push('tags should be an array, using empty array');
    }

    if (params.targetSessionId && typeof params.targetSessionId !== 'string') {
      warnings.push('targetSessionId should be a string, will auto-resolve session');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Sanitize parameters by applying defaults and cleaning invalid values
   */
  sanitizeParameters(params: CreateStateParams): CreateStateParams {
    return {
      ...params, // Preserve all inherited properties like sessionId, context, etc.
      name: params.name?.trim() || '',
      description: typeof params.description === 'string' ? params.description : '',
      workspaceContext: params.workspaceContext,
      targetSessionId: typeof params.targetSessionId === 'string' ? params.targetSessionId : undefined,
      includeSummary: params.includeSummary !== false, // Default to true
      includeFileContents: params.includeFileContents === true, // Default to false
      maxFiles: typeof params.maxFiles === 'number' && params.maxFiles > 0 ? params.maxFiles : 10,
      maxTraces: typeof params.maxTraces === 'number' && params.maxTraces > 0 ? params.maxTraces : 20,
      tags: Array.isArray(params.tags) ? params.tags : [],
      reason: typeof params.reason === 'string' ? params.reason : undefined
    };
  }

  /**
   * Validate state name format
   */
  validateStateName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return {
        isValid: false,
        error: 'State name is required and must be a string'
      };
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return {
        isValid: false,
        error: 'State name cannot be empty'
      };
    }

    if (trimmed.length > 100) {
      return {
        isValid: false,
        error: 'State name cannot be longer than 100 characters'
      };
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(trimmed)) {
      return {
        isValid: false,
        error: 'State name contains invalid characters. Avoid: < > : " / \\ | ? *'
      };
    }

    return { isValid: true };
  }
}