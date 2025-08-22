/**
 * Location: /src/utils/validation/index.ts
 * Purpose: Export barrel for validation utilities providing clean import interface
 * 
 * This file centralizes all validation utility exports for easy access throughout
 * the application, providing a clean interface for importing validation functionality.
 * 
 * Used by: All modes and utilities requiring validation functionality
 * Exports: All core validation utilities from Phase 1 implementation
 */

// Core validation utilities
export {
  ValidationResultHelper
} from './ValidationResultHelper';

export type {
  ValidationError,
  ValidationResult,
  ValidationMetadata
} from './ValidationResultHelper';

export {
  CommonValidators
} from './CommonValidators';

export type {
  StringValidationOptions,
  FilePathValidationOptions,
  SessionContextOptions,
  ValidationRule,
  ValidationRuleSet
} from './CommonValidators';

export {
  SchemaBlocks
} from './SchemaBlocks';

export type {
  JSONSchema,
  SchemaBlockOptions
} from './SchemaBlocks';

export {
  ServiceAccessMixin
} from './ServiceAccessMixin';

export type {
  ServiceRequirements,
  ServiceAccessOptions,
  ServiceAccessResult
} from './ServiceAccessMixin';

// Re-export commonly used patterns for convenience
// Note: Individual imports are preferred to avoid circular dependencies
// and provide better tree-shaking for the build process.