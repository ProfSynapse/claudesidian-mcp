/**
 * Location: /src/agents/memoryManager/validators/WorkspaceValidator.ts
 *
 * Purpose: Validates workspace creation and update parameters
 * Extracted from ValidationService.ts to follow Single Responsibility Principle
 *
 * Used by: Workspace-related modes for parameter validation
 * Dependencies: None
 */

import { ValidationError } from './ValidationTypes';

/**
 * Validator for workspace operations
 */
export class WorkspaceValidator {
  /**
   * Validate workspace creation parameters
   */
  static validateCreationParams(params: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!params.name) {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'Workspace name is required and must be a non-empty string'
      });
    }

    if (!params.rootFolder) {
      errors.push({
        field: 'rootFolder',
        value: params.rootFolder,
        requirement: 'Root folder path is required for workspace organization'
      });
    }

    if (!params.purpose) {
      errors.push({
        field: 'purpose',
        value: params.purpose,
        requirement: 'Workspace purpose is required. Provide a clear description of what this workspace is for'
      });
    }

    if (!params.currentGoal) {
      errors.push({
        field: 'currentGoal',
        value: params.currentGoal,
        requirement: 'Current goal is required. Specify what you are trying to accomplish right now'
      });
    }

    if (!params.workflows || !Array.isArray(params.workflows) || params.workflows.length === 0) {
      errors.push({
        field: 'workflows',
        value: params.workflows,
        requirement: 'At least one workflow is required. Provide workflows with name, when to use, and steps'
      });
    }

    return errors;
  }
}
