/**
 * Location: /src/services/mcp-bridge/providers/base/BaseProviderConverter.ts
 * 
 * This file provides the abstract base class for all provider-specific converters.
 * It defines the common interface and provides shared functionality for converting
 * MCP tools to different LLM provider formats (OpenAI, Anthropic, Google, etc.).
 * 
 * Used by: Provider-specific converters (OpenAIToolConverter, AnthropicToolConverter, etc.)
 * Dependencies: BridgeTypes, JSON Schema validation
 */

import {
  IProviderConverter,
  MCPTool,
  ProviderTool,
  ToolCallRequest,
  ToolCallResult,
  ValidationResult,
  ProviderCapabilities,
  ToolFeature,
  SupportedProvider,
  BridgeError,
  BridgeErrorType,
  DiagnosticLevel
} from '../../types/BridgeTypes';

// JSONSchema type from BridgeTypes
type JSONSchema = {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: any[];
  [key: string]: any;
};
// JSON Schema type is now defined in BridgeTypes

/**
 * Base configuration for provider converters
 */
export interface BaseConverterConfig {
  provider: SupportedProvider;
  enableLogging: boolean;
  logLevel: DiagnosticLevel;
  validateSchemas: boolean;
  maxToolNameLength: number;
  maxDescriptionLength: number;
}

/**
 * Abstract base class for all provider converters
 * 
 * Provides common functionality and enforces consistent interface
 * across all provider-specific implementations.
 */
export abstract class BaseProviderConverter implements IProviderConverter {
  public readonly provider: SupportedProvider;
  protected config: BaseConverterConfig;
  
  constructor(provider: SupportedProvider, config: Partial<BaseConverterConfig> = {}) {
    this.provider = provider;
    this.config = {
      provider,
      enableLogging: true,
      logLevel: DiagnosticLevel.INFO,
      validateSchemas: true,
      maxToolNameLength: 64,
      maxDescriptionLength: 1024,
      ...config
    };
    
    if (this.config.enableLogging) {
      console.log(`[${this.provider}Converter] Initialized converter for ${provider}`);
    }
  }

  // ============================================================================
  // Abstract methods that must be implemented by concrete converters
  // ============================================================================

  /**
   * Convert MCP tool to provider-specific format
   * Must be implemented by each provider converter
   */
  abstract convertMCPTool(mcpTool: MCPTool): ProviderTool;

  /**
   * Parse provider-specific tool call to normalized format
   * Must be implemented by each provider converter
   */
  abstract parseToolCall(providerToolCall: any): ToolCallRequest;

  /**
   * Format tool result for provider consumption
   * Must be implemented by each provider converter
   */
  abstract formatToolResult(result: ToolCallResult): any;

  /**
   * Get provider-specific capabilities
   * Must be implemented by each provider converter
   */
  abstract getCapabilities(): ProviderCapabilities;

  // ============================================================================
  // Concrete methods with default implementations
  // ============================================================================

  /**
   * Validate MCP tool conversion to provider format
   */
  validateConversion(mcpTool: MCPTool, providerTool: ProviderTool): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!providerTool.tool) {
      errors.push('Provider tool is missing tool definition');
    }

    if (providerTool.provider !== this.provider) {
      errors.push(`Provider mismatch: expected ${this.provider}, got ${providerTool.provider}`);
    }

    if (providerTool.originalName !== mcpTool.name) {
      errors.push(`Original name mismatch: expected ${mcpTool.name}, got ${providerTool.originalName}`);
    }

    // Validate tool name length
    if (mcpTool.name.length > this.config.maxToolNameLength) {
      warnings.push(`Tool name exceeds maximum length: ${mcpTool.name.length} > ${this.config.maxToolNameLength}`);
    }

    // Validate description length
    if (mcpTool.description.length > this.config.maxDescriptionLength) {
      warnings.push(`Description exceeds maximum length: ${mcpTool.description.length} > ${this.config.maxDescriptionLength}`);
    }

    // Provider-specific validation
    const providerValidation = this.validateProviderSpecific(mcpTool, providerTool);
    errors.push(...providerValidation.errors || []);
    warnings.push(...providerValidation.warnings || []);

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };

    if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.DEBUG) {
      console.log(`[${this.provider}Converter] Validation result for ${mcpTool.name}:`, result);
    }

    return result;
  }

  /**
   * Check if provider supports a specific feature
   */
  supportsFeature(feature: ToolFeature): boolean {
    return this.getCapabilities().features.includes(feature);
  }

  /**
   * Sanitize tool name for provider compatibility
   */
  protected sanitizeToolName(name: string): string {
    // Remove invalid characters and ensure valid identifier
    let sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, '_')  // Replace invalid chars with underscore
      .replace(/^[0-9]/, '_$&')         // Prefix numbers with underscore
      .replace(/_+/g, '_')              // Collapse multiple underscores
      .replace(/^_+|_+$/g, '');         // Trim underscores from ends

    // Ensure minimum length
    if (sanitized.length === 0) {
      sanitized = 'tool';
    }

    // Ensure maximum length
    if (sanitized.length > this.config.maxToolNameLength) {
      sanitized = sanitized.substring(0, this.config.maxToolNameLength);
    }

    return sanitized;
  }

  /**
   * Sanitize description for provider compatibility
   */
  protected sanitizeDescription(description: string): string {
    let sanitized = description.trim();
    
    // Ensure maximum length
    if (sanitized.length > this.config.maxDescriptionLength) {
      sanitized = sanitized.substring(0, this.config.maxDescriptionLength - 3) + '...';
    }
    
    // Ensure minimum length
    if (sanitized.length === 0) {
      sanitized = 'No description available';
    }
    
    return sanitized;
  }

  /**
   * Deep clone JSON schema to avoid mutation
   */
  protected cloneSchema(schema: JSONSchema): JSONSchema {
    return JSON.parse(JSON.stringify(schema));
  }

  /**
   * Validate JSON schema structure
   */
  protected validateJsonSchema(schema: JSONSchema): ValidationResult {
    const errors: string[] = [];

    if (!schema.type) {
      errors.push('Schema missing type property');
    }

    if (schema.type === 'object' && !schema.properties) {
      errors.push('Object schema missing properties');
    }

    // Check for common schema issues
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (typeof propSchema === 'object' && propSchema !== null && 'type' in propSchema) {
          if (!(propSchema as any).type) {
            errors.push(`Property ${propName} missing type`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Generate unique ID for tool calls
   */
  protected generateToolCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse JSON arguments safely
   */
  protected parseArguments(args: string): Record<string, any> {
    try {
      return JSON.parse(args);
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`[${this.provider}Converter] Failed to parse arguments:`, args, error);
      }
      throw new BridgeError(
        BridgeErrorType.PARAMETER_VALIDATION_ERROR,
        `Invalid JSON in tool call arguments: ${error instanceof Error ? error.message : String(error)}`,
        this.provider
      );
    }
  }

  /**
   * Stringify result safely
   */
  protected stringifyResult(result: any): string {
    try {
      if (typeof result === 'string') {
        return result;
      }
      return JSON.stringify(result, null, 2);
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`[${this.provider}Converter] Failed to stringify result:`, result, error);
      }
      return String(result);
    }
  }

  /**
   * Log conversion activity
   */
  protected logConversion(operation: string, toolName: string, details?: any): void {
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[${this.provider}Converter] ${operation}: ${toolName}`, details);
    }
  }

  /**
   * Log error with context
   */
  protected logError(error: Error, toolName?: string, context?: any): void {
    console.error(`[${this.provider}Converter] Error${toolName ? ` for ${toolName}` : ''}:`, error, context);
  }

  // ============================================================================
  // Protected abstract methods for provider-specific validation
  // ============================================================================

  /**
   * Provider-specific validation logic
   * Override in concrete implementations if needed
   */
  protected validateProviderSpecific(mcpTool: MCPTool, providerTool: ProviderTool): ValidationResult {
    // Default implementation - no additional validation
    return { isValid: true };
  }

  // ============================================================================
  // Utility methods for common provider patterns
  // ============================================================================

  /**
   * Extract tool name from various provider formats
   */
  protected extractToolName(providerToolCall: any): string {
    // Handle different provider formats
    if (providerToolCall.function?.name) {
      return providerToolCall.function.name; // OpenAI format
    }
    if (providerToolCall.name) {
      return providerToolCall.name; // Anthropic format
    }
    throw new BridgeError(
      BridgeErrorType.PARAMETER_VALIDATION_ERROR,
      'Cannot extract tool name from provider tool call',
      this.provider
    );
  }

  /**
   * Extract parameters from various provider formats
   */
  protected extractParameters(providerToolCall: any): Record<string, any> {
    // Handle different provider formats
    if (providerToolCall.function?.arguments) {
      return this.parseArguments(providerToolCall.function.arguments); // OpenAI format
    }
    if (providerToolCall.input) {
      return providerToolCall.input; // Anthropic format
    }
    if (providerToolCall.args) {
      return providerToolCall.args; // Google format
    }
    return {}; // Default empty parameters
  }

  /**
   * Extract tool call ID from various provider formats
   */
  protected extractToolCallId(providerToolCall: any): string {
    if (providerToolCall.id) {
      return providerToolCall.id; // Most providers
    }
    // Generate ID if not provided
    return this.generateToolCallId();
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<BaseConverterConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.enableLogging) {
      console.log(`[${this.provider}Converter] Configuration updated:`, config);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): BaseConverterConfig {
    return { ...this.config };
  }
}