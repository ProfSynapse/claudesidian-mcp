/**
 * Location: /src/agents/memoryManager/validators/SessionValidator.ts
 *
 * Purpose: Validates session creation and update parameters
 * Extracted from ValidationService.ts to follow Single Responsibility Principle
 *
 * Used by: Session-related modes for parameter validation
 * Dependencies: None
 */

import { ValidationError } from './ValidationTypes';

/**
 * Validator for session operations
 */
export class SessionValidator {
  /**
   * Validate session creation parameters
   */
  static validateCreationParams(params: any): ValidationError[] {
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
}
