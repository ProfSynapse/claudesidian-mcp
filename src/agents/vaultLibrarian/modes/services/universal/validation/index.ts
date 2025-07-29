/**
 * Universal Search Validation Framework - Public API
 * 
 * Provides a unified interface for universal search validation components.
 * This module exports all validation functionality for easy integration.
 */

import { 
  UniversalSearchValidator, 
  ValidationResult, 
  ValidationContext 
} from './UniversalSearchValidator';

import { 
  ValidationErrorMonitor, 
  ValidationError, 
  ValidationErrorSummary,
  globalValidationErrorMonitor 
} from './ValidationErrorMonitor';

export { UniversalSearchValidator };
export type { ValidationResult, ValidationContext };
export { ValidationErrorMonitor, globalValidationErrorMonitor };
export type { ValidationError, ValidationErrorSummary };

/**
 * Creates a configured UniversalSearchValidator instance
 * for use in universal search components
 */
export function createUniversalSearchValidator(): UniversalSearchValidator {
  return new UniversalSearchValidator();
}

/**
 * Gets the global validation error monitor for system-wide error tracking
 */
export function getGlobalValidationErrorMonitor(): ValidationErrorMonitor {
  return globalValidationErrorMonitor;
}

/**
 * Utility function to create a validation context
 */
export function createValidationContext(
  component: string, 
  stage: string, 
  operation: string = 'unknown'
): ValidationContext {
  return { component, stage, operation };
}

/**
 * Check if the validation system has any critical issues
 */
export function hasCriticalValidationIssues(minutes: number = 10): boolean {
  return globalValidationErrorMonitor.hasCriticalIssues(minutes);
}

/**
 * Get a summary of validation system health
 */
export function getValidationHealthSummary(): ValidationErrorSummary {
  return globalValidationErrorMonitor.getErrorSummary();
}