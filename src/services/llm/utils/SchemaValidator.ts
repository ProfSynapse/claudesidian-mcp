/**
 * Schema Validator Utility
 * Location: src/services/llm/utils/SchemaValidator.ts
 *
 * Extracted from BaseAdapter.ts to follow Single Responsibility Principle.
 * Provides basic JSON schema validation for LLM responses and tool parameters.
 *
 * Usage:
 * - Used by BaseAdapter.generateJSON() for response schema validation
 * - Can be used by provider adapters for validating tool schemas
 * - Basic recursive validation - can be enhanced with a proper validator library
 */

export class SchemaValidator {
  /**
   * Validate data against a JSON schema
   * Basic implementation that checks:
   * - Type matching
   * - Required properties
   * - Nested object validation
   */
  static validateSchema(data: any, schema: any): boolean {
    // Basic schema validation - could be enhanced with a proper validator
    if (typeof schema !== 'object' || schema === null) {
      return true;
    }

    if (schema.type) {
      const expectedType = schema.type;
      const actualType = Array.isArray(data) ? 'array' : typeof data;

      if (expectedType !== actualType) {
        return false;
      }
    }

    if (schema.properties && typeof data === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (schema.required?.includes(key) && !(key in data)) {
          return false;
        }

        if (key in data && !this.validateSchema(data[key], propSchema)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Sanitize JSON Schema for Google's simplified schema format
   * Google doesn't support: if/then, allOf/anyOf/oneOf, examples, $ref, etc.
   */
  static sanitizeSchemaForGoogle(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Create a clean copy
    const sanitized: any = {};

    // Copy basic properties that Google supports
    const allowedTopLevel = ['type', 'description', 'properties', 'required', 'items', 'enum'];
    for (const key of allowedTopLevel) {
      if (key in schema) {
        sanitized[key] = schema[key];
      }
    }

    // Recursively sanitize nested properties
    if (sanitized.properties && typeof sanitized.properties === 'object') {
      const cleanProps: any = {};
      for (const [propName, propSchema] of Object.entries(sanitized.properties)) {
        cleanProps[propName] = this.sanitizeSchemaForGoogle(propSchema);
      }
      sanitized.properties = cleanProps;
    }

    // Recursively sanitize array items
    if (sanitized.items && typeof sanitized.items === 'object') {
      sanitized.items = this.sanitizeSchemaForGoogle(sanitized.items);
    }

    // CRITICAL: Validate required array - remove any properties that don't exist in sanitized.properties
    if (sanitized.required && Array.isArray(sanitized.required) && sanitized.properties) {
      sanitized.required = sanitized.required.filter((propName: string) => {
        const exists = propName in sanitized.properties;
        if (!exists) {
          console.warn(`[SchemaValidator] Removed required property "${propName}" - not in sanitized properties`);
        }
        return exists;
      });

      // If required array is now empty, remove it
      if (sanitized.required.length === 0) {
        delete sanitized.required;
      }
    }

    return sanitized;
  }
}
