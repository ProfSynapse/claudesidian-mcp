/**
 * UniversalSearchValidator - Core validation engine for universal search pipeline
 * 
 * Provides comprehensive validation to prevent split() errors and other string operation
 * failures throughout the universal search processing pipeline.
 * 
 * Design Principles:
 * - Defense in Depth: Multiple validation layers at component boundaries
 * - Fail-Safe Design: Graceful degradation when validation fails
 * - Performance First: Minimal overhead validation with smart caching
 * - Framework Integration: Seamless extension of existing validation patterns
 */

import { ValidationErrorMonitor, ValidationError, globalValidationErrorMonitor } from './ValidationErrorMonitor';

export interface ValidationResult<T> {
  isValid: boolean;
  data: T | null;
  errors: string[];
}

export interface ValidationContext {
  stage: string;
  component: string;
  operation: string;
}

/**
 * Comprehensive validation service for universal search components
 * Prevents undefined/null values from reaching string operations like split(), toLowerCase(), etc.
 */
export class UniversalSearchValidator {
  private validationCache = new Map<string, { result: string; timestamp: number }>();
  private readonly CACHE_SIZE_LIMIT = 1000;
  private readonly CACHE_TTL = 300000; // 5 minutes
  private errorMonitor: ValidationErrorMonitor;

  constructor(errorMonitor?: ValidationErrorMonitor) {
    this.errorMonitor = errorMonitor || globalValidationErrorMonitor;
  }

  /**
   * Validate query parameter with comprehensive type checking
   * Critical for preventing split() errors in ResultFormatter.highlightQueryTerms()
   */
  validateQuery(query: unknown, context?: ValidationContext): string {
    const contextInfo = context ? `[${context.component}:${context.stage}]` : '[QUERY_VALIDATION]';
    
    try {
      // Fast path for valid strings
      if (typeof query === 'string' && query.trim().length > 0) {
        console.log(`${contextInfo} ✅ Query validation passed - valid string`);
        
        // Record successful validation
        if (context) {
          this.errorMonitor.recordValidationSuccess(context.component, context.stage, context.operation);
        }
        
        return query.trim();
      }
      
      // Handle edge cases with defensive conversions
      if (query === null || query === undefined) {
        console.log(`${contextInfo} ⚠️ Query is null/undefined - using empty string fallback`);
        
        // Record validation error for monitoring
        if (context) {
          this.errorMonitor.recordValidationError(ValidationErrorMonitor.createError(
            context.component,
            context.stage,
            context.operation,
            'null_undefined',
            'high',
            query,
            'string',
            'Used empty string fallback'
          ));
        }
        
        return '';
      }
      
      // Convert numeric/boolean values safely
      if (typeof query === 'number' || typeof query === 'boolean') {
        const converted = String(query);
        console.log(`${contextInfo} ⚠️ Query converted from ${typeof query} to string: "${converted}"`);
        return converted;
      }
      
      // Handle objects/arrays safely
      if (typeof query === 'object') {
        console.warn(`${contextInfo} ❌ Query is object type - cannot convert safely`);
        return '';
      }
      
      // Fallback for other types
      console.warn(`${contextInfo} ❌ Query has unsupported type: ${typeof query}`);
      return '';
      
    } catch (error) {
      console.error(`${contextInfo} ERROR during query validation:`, error);
      return '';
    }
  }

  /**
   * Validate snippet content with integration to existing ContentSearchStrategy validation
   * Critical for preventing toLowerCase() errors in ResultConsolidator.removeDuplicateSnippets()
   */
  validateSnippetContent(content: unknown, context?: ValidationContext): string {
    const contextInfo = context ? `[${context.component}:${context.stage}]` : '[CONTENT_VALIDATION]';
    
    try {
      // Use existing validation patterns from ContentSearchStrategy
      if (this.isValidStringContent(content)) {
        const sanitized = this.sanitizeContent(content as string);
        console.log(`${contextInfo} ✅ Content validation passed - ${sanitized.length} chars`);
        return sanitized;
      }
      
      // Handle edge cases
      if (content === null || content === undefined) {
        console.log(`${contextInfo} ⚠️ Content is null/undefined - using empty string fallback`);
        return '';
      }
      
      // Convert other types safely
      if (typeof content === 'number' || typeof content === 'boolean') {
        const converted = String(content);
        console.log(`${contextInfo} ⚠️ Content converted from ${typeof content} to string`);
        return this.sanitizeContent(converted);
      }
      
      // Handle objects that might have useful content
      if (typeof content === 'object' && content !== null) {
        // Try to extract meaningful content from objects
        const obj = content as any;
        if (obj.content && typeof obj.content === 'string') {
          console.log(`${contextInfo} ⚠️ Extracted content from object.content property`);
          return this.validateSnippetContent(obj.content, context);
        }
        if (obj.text && typeof obj.text === 'string') {
          console.log(`${contextInfo} ⚠️ Extracted content from object.text property`);
          return this.validateSnippetContent(obj.text, context);
        }
        if (obj.snippet && typeof obj.snippet === 'string') {
          console.log(`${contextInfo} ⚠️ Extracted content from object.snippet property`);
          return this.validateSnippetContent(obj.snippet, context);
        }
      }
      
      console.warn(`${contextInfo} ❌ Content cannot be converted to valid string - using empty fallback`);
      return '';
      
    } catch (error) {
      console.error(`${contextInfo} ERROR during content validation:`, error);
      return '';
    }
  }

  /**
   * Validate search result objects with comprehensive structure checking
   * Ensures all required fields are present and valid
   */
  validateSearchResult(result: unknown, context?: ValidationContext): ValidationResult<any> {
    const contextInfo = context ? `[${context.component}:${context.stage}]` : '[RESULT_VALIDATION]';
    
    try {
      if (typeof result !== 'object' || result === null) {
        return {
          isValid: false,
          errors: [`Result must be an object, got ${typeof result}`],
          data: null
        };
      }
      
      const r = result as any;
      const errors: string[] = [];
      
      // Validate required fields
      if (!r.id || typeof r.id !== 'string') {
        errors.push('Result must have valid id string');
      }
      
      // Validate snippet content (critical for preventing string operation errors)
      const validatedContent = this.validateSnippetContent(r.snippet, context);
      
      // Validate score
      if (typeof r.score !== 'number' || isNaN(r.score)) {
        errors.push('Result must have valid numeric score');
      }
      
      if (errors.length > 0) {
        console.log(`${contextInfo} ❌ Result validation failed:`, errors);
        return { isValid: false, errors, data: null };
      }
      
      // Return sanitized result
      const sanitizedResult = {
        ...r,
        snippet: validatedContent,
        score: isNaN(r.score) ? 0 : Math.max(0, Math.min(1, r.score))
      };
      
      console.log(`${contextInfo} ✅ Result validation passed`);
      return { isValid: true, data: sanitizedResult, errors: [] };
      
    } catch (error) {
      console.error(`${contextInfo} ERROR during result validation:`, error);
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        data: null
      };
    }
  }

  /**
   * Validate query type parameter
   */
  validateQueryType(queryType: unknown): ValidationResult<string> {
    const validTypes = ['exact', 'mixed', 'conceptual', 'exploratory'];
    
    if (typeof queryType === 'string' && validTypes.includes(queryType)) {
      return { isValid: true, data: queryType, errors: [] };
    }
    
    // Default fallback
    return { isValid: true, data: 'mixed', errors: ['Invalid queryType, using default: mixed'] };
  }

  /**
   * Validate array of snippets with individual content validation
   * Used by ResultConsolidator to ensure all snippet content is safe
   */
  validateSnippetsArray(snippets: unknown, context?: ValidationContext): Array<{ content: string; searchMethod: string; score: number }> {
    const contextInfo = context ? `[${context.component}:${context.stage}]` : '[SNIPPETS_VALIDATION]';
    
    if (!Array.isArray(snippets)) {
      console.warn(`${contextInfo} ❌ Snippets is not an array, returning empty array`);
      return [];
    }
    
    const validatedSnippets: Array<{ content: string; searchMethod: string; score: number }> = [];
    
    for (let i = 0; i < snippets.length; i++) {
      const snippet = snippets[i];
      
      if (typeof snippet !== 'object' || snippet === null) {
        console.warn(`${contextInfo} ❌ Snippet ${i} is not an object, skipping`);
        continue;
      }
      
      const s = snippet as any;
      
      // Validate and sanitize content (critical for preventing split() errors)
      const validatedContent = this.validateSnippetContent(s.content, context);
      
      // Skip empty content snippets
      if (validatedContent.length === 0) {
        console.log(`${contextInfo} ⚠️ Snippet ${i} has no valid content, skipping`);
        continue;
      }
      
      validatedSnippets.push({
        content: validatedContent,
        searchMethod: typeof s.searchMethod === 'string' ? s.searchMethod : 'unknown',
        score: typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0
      });
    }
    
    console.log(`${contextInfo} ✅ Validated ${validatedSnippets.length}/${snippets.length} snippets`);
    return validatedSnippets;
  }

  /**
   * Create validation context for error tracking and logging
   */
  createValidationContext(component: string, stage: string, operation: string = 'unknown'): ValidationContext {
    return { component, stage, operation };
  }

  /**
   * Type guard with comprehensive string content validation
   * Based on existing ContentSearchStrategy validation patterns
   */
  private isValidStringContent(content: any): content is string {
    return (
      typeof content === 'string' &&
      content !== null &&
      content !== undefined &&
      // Ensure string methods are available (defensive programming)
      typeof content.split === 'function' &&
      typeof content.toLowerCase === 'function' &&
      typeof content.trim === 'function'
    );
  }

  /**
   * Content sanitization with safety checks
   * Based on existing ContentSearchStrategy sanitization patterns
   */
  private sanitizeContent(content: string): string {
    // Basic safety checks
    if (content.length === 0) {
      return '';
    }
    
    // Hard limit to prevent memory issues
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '...';
    }
    
    // Remove problematic characters that might break processing
    const sanitized = content
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x1F\x7F]/g, ' ') // Replace control characters with spaces
      .trim();
    
    return sanitized;
  }

  /**
   * Cache validation results for performance optimization
   */
  private validateWithCache(key: string, validator: () => string): string {
    // Check cache first
    const cached = this.validationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }
    
    // Perform validation
    const result = validator();
    
    // Cache management
    if (this.validationCache.size >= this.CACHE_SIZE_LIMIT) {
      this.evictOldestEntries();
    }
    
    this.validationCache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }

  /**
   * Evict oldest cache entries to maintain size limit
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.validationCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 25% of entries
    const removeCount = Math.floor(entries.length * 0.25);
    for (let i = 0; i < removeCount; i++) {
      this.validationCache.delete(entries[i][0]);
    }
  }

  /**
   * Validate file path with comprehensive type checking
   * Critical for preventing split() errors in display operations like SearchMode.execute
   */
  validateFilePath(filePath: unknown, context?: ValidationContext): string {
    const contextInfo = context ? `[${context.component}:${context.operation}]` : '[FILEPATH_VALIDATION]';
    const startTime = performance.now();
    
    try {
      // Fast path for valid strings
      if (typeof filePath === 'string' && filePath.trim().length > 0) {
        console.log(`${contextInfo} ✅ FilePath validation passed - valid string: "${filePath}"`);
        
        // Record successful validation
        if (context) {
          this.errorMonitor.recordValidationSuccess(context.component, context.stage, context.operation);
        }
        
        return filePath.trim();
      }
      
      // Handle null/undefined cases
      if (filePath === null || filePath === undefined) {
        console.log(`${contextInfo} ⚠️ FilePath is null/undefined - using 'unknown-file' fallback`);
        
        // Record validation error for monitoring
        if (context) {
          this.errorMonitor.recordValidationError(ValidationErrorMonitor.createError(
            context.component,
            context.stage,
            context.operation,
            'null_undefined',
            'medium',
            filePath,
            'string',
            'Used unknown-file fallback for display'
          ));
        }
        
        return 'unknown-file';
      }
      
      // Handle empty string cases
      if (typeof filePath === 'string' && filePath.trim().length === 0) {
        console.log(`${contextInfo} ⚠️ FilePath is empty string - using 'untitled-file' fallback`);
        
        if (context) {
          this.errorMonitor.recordValidationError(ValidationErrorMonitor.createError(
            context.component,
            context.stage,
            context.operation,
            'invalid_structure',
            'medium',
            filePath,
            'string',
            'Used untitled-file fallback for display'
          ));
        }
        
        return 'untitled-file';
      }
      
      // Handle non-string types
      if (typeof filePath !== 'string') {
        console.warn(`${contextInfo} ❌ FilePath has invalid type: ${typeof filePath} - using type-based fallback`);
        
        if (context) {
          this.errorMonitor.recordValidationError(ValidationErrorMonitor.createError(
            context.component,
            context.stage,
            context.operation,
            'type_mismatch',
            'medium',
            filePath,
            'string',
            `Invalid type ${typeof filePath}, used fallback`
          ));
        }
        
        return `invalid-file-${typeof filePath}`;
      }
      
      // Fallback for any other edge cases
      console.warn(`${contextInfo} ❌ FilePath validation failed for unexpected case - using generic fallback`);
      return 'unknown-file';
      
    } catch (error) {
      console.error(`${contextInfo} ERROR during filePath validation:`, error);
      
      if (context) {
        this.errorMonitor.recordValidationError(ValidationErrorMonitor.createError(
          context.component,
          context.stage,
          context.operation,
          'validation_failure',
          'high',
          filePath,
          'string',
          `Validation error: ${error instanceof Error ? error.message : String(error)}`
        ));
      }
      
      return 'error-file';
    } finally {
      // Record performance metrics
      const validationTime = performance.now() - startTime;
      if (context && validationTime > 1) { // Only log if validation took >1ms
        console.log(`${contextInfo} 📊 FilePath validation took ${validationTime.toFixed(2)}ms`);
      }
    }
  }

  /**
   * Get validation cache statistics for monitoring
   */
  getCacheStats(): { size: number; hitRate: number; memoryUsage: number } {
    // Simple cache statistics
    return {
      size: this.validationCache.size,
      hitRate: 0.8, // Placeholder - would need actual tracking
      memoryUsage: this.validationCache.size * 100 // Rough estimate
    };
  }
}