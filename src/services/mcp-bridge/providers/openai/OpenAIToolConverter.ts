/**
 * Location: /src/services/mcp-bridge/providers/openai/OpenAIToolConverter.ts
 * 
 * This file implements the provider converter for OpenAI and OpenRouter function calling.
 * Both providers use the same schema format, so this converter handles both.
 * It converts MCP tools to OpenAI function calling format and handles tool call parsing.
 * 
 * Used by: ToolSchemaConverter for OpenAI and OpenRouter providers
 * Dependencies: BaseProviderConverter, BridgeTypes, OpenAI function calling schemas
 */

import {
  MCPTool,
  ProviderTool,
  ToolCallRequest,
  ToolCallResult,
  ValidationResult,
  ProviderCapabilities,
  ToolFeature,
  OpenAITool,
  OpenAIToolCall,
  BridgeError,
  BridgeErrorType,
  DiagnosticLevel
} from '../../types/BridgeTypes';
import { BaseProviderConverter } from '../base/BaseProviderConverter';
import { mergeWithCommonSchema } from '../../../../utils/schemaUtils';

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
 * OpenAI Tool Converter Implementation
 * 
 * Handles conversion between MCP tools and OpenAI function calling format.
 * Also compatible with OpenRouter since they use the same schema.
 */
export class OpenAIToolConverter extends BaseProviderConverter {
  
  constructor() {
    super('openai', {
      enableLogging: false,
      logLevel: DiagnosticLevel.ERROR,
      validateSchemas: true,
      maxToolNameLength: 64,
      maxDescriptionLength: 1024
    });
  }

  /**
   * Convert MCP tool to OpenAI function calling format
   */
  convertMCPTool(mcpTool: MCPTool): ProviderTool {
    this.logConversion('Converting MCP tool to OpenAI format', mcpTool.name);

    try {
      // Validate input
      if (!mcpTool.name || !mcpTool.description || !mcpTool.inputSchema) {
        throw new BridgeError(
          BridgeErrorType.SCHEMA_CONVERSION_ERROR,
          'MCP tool missing required fields (name, description, or inputSchema)',
          this.provider,
          mcpTool.name
        );
      }

      // Sanitize name and description
      const sanitizedName = this.sanitizeToolName(mcpTool.name);
      const sanitizedDescription = this.sanitizeDescription(mcpTool.description);

      // Clone and merge with common schema (sessionId, context, etc.)
      const baseParameters = this.cloneSchema(mcpTool.inputSchema);
      const parametersWithCommon = mergeWithCommonSchema(baseParameters);
      const schemaValidation = this.validateJsonSchema(parametersWithCommon);
      
      if (!schemaValidation.isValid) {
        console.warn(`[OpenAIToolConverter] Schema validation warnings for ${mcpTool.name}:`, schemaValidation.errors);
      }

      // Create OpenAI tool format
      const openAITool: OpenAITool = {
        type: 'function',
        function: {
          name: sanitizedName,
          description: sanitizedDescription,
          parameters: this.convertSchemaForOpenAI(parametersWithCommon)
        }
      };

      const providerTool: ProviderTool = {
        provider: this.provider,
        originalName: mcpTool.name,
        tool: openAITool
      };

      // Validate conversion
      const conversionValidation = this.validateConversion(mcpTool, providerTool);
      if (!conversionValidation.isValid) {
        console.warn(`[OpenAIToolConverter] Conversion validation warnings for ${mcpTool.name}:`, conversionValidation);
      }

      this.logConversion('Successfully converted to OpenAI format', mcpTool.name, {
        originalName: mcpTool.name,
        sanitizedName,
        hasParameters: !!parametersWithCommon.properties,
        addedCommonParams: true
      });

      return providerTool;

    } catch (error) {
      this.logError(error as Error, mcpTool.name, { inputSchema: mcpTool.inputSchema });
      throw error instanceof BridgeError ? error : new BridgeError(
        BridgeErrorType.SCHEMA_CONVERSION_ERROR,
        `Failed to convert MCP tool to OpenAI format: ${(error as Error).message}`,
        this.provider,
        mcpTool.name,
        error as Error
      );
    }
  }

  /**
   * Parse OpenAI tool call to normalized format
   */
  parseToolCall(providerToolCall: OpenAIToolCall): ToolCallRequest {
    this.logConversion('Parsing OpenAI tool call', providerToolCall.function?.name || 'unknown');

    try {
      // Validate tool call structure
      if (!providerToolCall.id) {
        throw new BridgeError(
          BridgeErrorType.PARAMETER_VALIDATION_ERROR,
          'OpenAI tool call missing required id field',
          this.provider
        );
      }

      if (!providerToolCall.function?.name) {
        throw new BridgeError(
          BridgeErrorType.PARAMETER_VALIDATION_ERROR,
          'OpenAI tool call missing function.name field',
          this.provider
        );
      }

      // Extract and parse parameters
      const toolName = providerToolCall.function.name;
      const parametersJson = providerToolCall.function.arguments || '{}';
      const parameters = this.parseArguments(parametersJson);

      const toolCallRequest: ToolCallRequest = {
        id: providerToolCall.id,
        name: toolName,
        parameters,
        provider: this.provider,
        metadata: {
          timestamp: new Date().toISOString()
        }
      };

      this.logConversion('Successfully parsed OpenAI tool call', toolName, {
        id: providerToolCall.id,
        parameterCount: Object.keys(parameters).length
      });

      return toolCallRequest;

    } catch (error) {
      this.logError(error as Error, providerToolCall.function?.name, providerToolCall);
      throw error instanceof BridgeError ? error : new BridgeError(
        BridgeErrorType.PARAMETER_VALIDATION_ERROR,
        `Failed to parse OpenAI tool call: ${(error as Error).message}`,
        this.provider,
        providerToolCall.function?.name,
        error as Error
      );
    }
  }

  /**
   * Format tool result for OpenAI consumption
   */
  formatToolResult(result: ToolCallResult): any {
    this.logConversion('Formatting tool result for OpenAI', result.name);

    try {
      // OpenAI expects tool results in message format
      const content = result.success 
        ? this.stringifyResult(result.result)
        : JSON.stringify({
            error: result.error,
            errorCode: result.metadata?.errorCode || 'TOOL_EXECUTION_ERROR'
          });

      const toolMessage = {
        role: 'tool',
        tool_call_id: result.id,
        content: content
      };

      this.logConversion('Successfully formatted tool result for OpenAI', result.name, {
        success: result.success,
        contentLength: content.length,
        executionTime: result.executionTime
      });

      return toolMessage;

    } catch (error) {
      this.logError(error as Error, result.name, result);
      
      // Return error message format
      return {
        role: 'tool',
        tool_call_id: result.id,
        content: JSON.stringify({
          error: `Failed to format tool result: ${(error as Error).message}`,
          originalError: result.error
        })
      };
    }
  }

  /**
   * Get OpenAI provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportsParallelCalls: true,
      supportsStreaming: true,
      maxToolsPerCall: 100, // OpenAI's documented limit
      features: [
        ToolFeature.FUNCTION_CALLING,
        ToolFeature.PARALLEL_CALLS,
        ToolFeature.STREAMING,
        ToolFeature.VALIDATION
      ]
    };
  }

  /**
   * Convert JSON schema for OpenAI compatibility
   */
  private convertSchemaForOpenAI(schema: JSONSchema): JSONSchema {
    const convertedSchema = this.cloneSchema(schema);
    
    // OpenAI-specific schema transformations
    this.removeUnsupportedSchemaFields(convertedSchema);
    this.normalizeSchemaTypes(convertedSchema);
    
    return convertedSchema;
  }

  /**
   * Remove schema fields not supported by OpenAI
   */
  private removeUnsupportedSchemaFields(schema: any): void {
    // OpenAI doesn't support some JSON Schema features
    const unsupportedFields = [
      'examples',
      'const',
      'if',
      'then',
      'else',
      'allOf',
      'anyOf',
      'oneOf',
      'not'
    ];
    
    for (const field of unsupportedFields) {
      if (field in schema) {
        delete schema[field];
      }
    }
    
    // Recursively clean nested schemas
    if (schema.properties && typeof schema.properties === 'object') {
      for (const prop of Object.values(schema.properties)) {
        if (typeof prop === 'object' && prop !== null) {
          this.removeUnsupportedSchemaFields(prop);
        }
      }
    }
    
    if (schema.items && typeof schema.items === 'object') {
      this.removeUnsupportedSchemaFields(schema.items);
    }
  }

  /**
   * Normalize schema types for OpenAI compatibility
   */
  private normalizeSchemaTypes(schema: any): void {
    // Ensure type is a string, not an array
    if (Array.isArray(schema.type)) {
      schema.type = schema.type[0]; // Take first type
    }
    
    // Handle integer type (OpenAI prefers number)
    if (schema.type === 'integer') {
      schema.type = 'number';
    }
    
    // Recursively normalize nested schemas
    if (schema.properties && typeof schema.properties === 'object') {
      for (const prop of Object.values(schema.properties)) {
        if (typeof prop === 'object' && prop !== null) {
          this.normalizeSchemaTypes(prop);
        }
      }
    }
    
    if (schema.items && typeof schema.items === 'object') {
      this.normalizeSchemaTypes(schema.items);
    }
  }

  /**
   * Provider-specific validation for OpenAI tools
   */
  protected validateProviderSpecific(mcpTool: MCPTool, providerTool: ProviderTool): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const openAITool = providerTool.tool as OpenAITool;
    
    // Validate OpenAI-specific requirements
    if (!openAITool.type || openAITool.type !== 'function') {
      errors.push('OpenAI tool must have type "function"');
    }
    
    if (!openAITool.function) {
      errors.push('OpenAI tool must have function definition');
    } else {
      // Validate function definition
      if (!openAITool.function.name) {
        errors.push('OpenAI function must have name');
      }
      
      if (!openAITool.function.description) {
        errors.push('OpenAI function must have description');
      }
      
      // Check name format (OpenAI requirements)
      const namePattern = /^[a-zA-Z0-9_-]+$/;
      if (openAITool.function.name && !namePattern.test(openAITool.function.name)) {
        errors.push('OpenAI function name contains invalid characters (must be alphanumeric, underscore, or dash)');
      }
      
      // Validate parameters schema
      if (openAITool.function.parameters) {
        const schemaValidation = this.validateJsonSchema(openAITool.function.parameters);
        if (!schemaValidation.isValid) {
          errors.push(...(schemaValidation.errors || []));
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}