/**
 * Location: /src/services/mcp-bridge/core/ToolSchemaConverter.ts
 * 
 * This file implements the tool schema converter that orchestrates conversion of MCP tools
 * to different provider formats. It manages provider-specific converters and provides
 * a unified interface for schema transformation across all supported LLM providers.
 * 
 * Used by: MCPFunctionBridge for converting tools to provider-specific formats
 * Dependencies: BridgeTypes, provider converters (OpenAIToolConverter, etc.)
 */

import {
  IToolSchemaConverter,
  IProviderConverter,
  MCPTool,
  ProviderTool,
  ValidationResult,
  SupportedProvider,
  BridgeError,
  BridgeErrorType,
  DiagnosticLevel
} from '../types/BridgeTypes';
import { OpenAIToolConverter } from '../providers/openai/OpenAIToolConverter';

/**
 * Configuration for the tool schema converter
 */
interface ToolSchemaConverterConfig {
  enableLogging: boolean;
  logLevel: DiagnosticLevel;
  validateConversions: boolean;
  cacheConversions: boolean;
  maxCacheSize: number;
}

/**
 * Cache entry for converted tools
 */
interface ConversionCacheEntry {
  tools: ProviderTool[];
  timestamp: string;
  mcpToolsHash: string; // Hash of source MCP tools for invalidation
}

/**
 * Tool Schema Converter Implementation
 * 
 * Manages provider-specific converters and provides unified interface
 * for converting MCP tools to various LLM provider formats.
 */
export class ToolSchemaConverter implements IToolSchemaConverter {
  private converters = new Map<SupportedProvider, IProviderConverter>();
  private config: ToolSchemaConverterConfig;
  private conversionCache = new Map<string, ConversionCacheEntry>();
  
  constructor(config: Partial<ToolSchemaConverterConfig> = {}) {
    this.config = {
      enableLogging: true,
      logLevel: DiagnosticLevel.INFO,
      validateConversions: true,
      cacheConversions: true,
      maxCacheSize: 100,
      ...config
    };
    
    this.initializeDefaultConverters();
    
    if (this.config.enableLogging) {
      console.log('[ToolSchemaConverter] Initialized with converters for:', 
        Array.from(this.converters.keys()));
    }
  }

  /**
   * Register a provider-specific converter
   */
  registerProviderConverter(provider: SupportedProvider, converter: IProviderConverter): void {
    if (converter.provider !== provider) {
      throw new BridgeError(
        BridgeErrorType.PROVIDER_NOT_SUPPORTED,
        `Converter provider mismatch: expected ${provider}, got ${converter.provider}`,
        provider
      );
    }
    
    this.converters.set(provider, converter);
    
    if (this.config.enableLogging) {
      console.log(`[ToolSchemaConverter] Registered converter for ${provider}`);
    }
  }

  /**
   * Convert multiple MCP tools to provider-specific format
   */
  async convertToolsForProvider(mcpTools: MCPTool[], provider: SupportedProvider): Promise<ProviderTool[]> {
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[ToolSchemaConverter] Converting ${mcpTools.length} tools for ${provider}`);
    }

    // Check cache first
    if (this.config.cacheConversions) {
      const cacheKey = this.generateCacheKey(mcpTools, provider);
      const cached = this.conversionCache.get(cacheKey);
      
      if (cached && this.isCacheValid(cached, mcpTools)) {
        if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.DEBUG) {
          console.log(`[ToolSchemaConverter] Cache hit for ${provider}, returning ${cached.tools.length} tools`);
        }
        return [...cached.tools]; // Return copy to prevent mutation
      }
    }

    const converter = this.getConverter(provider);
    const convertedTools: ProviderTool[] = [];
    const errors: string[] = [];

    // Convert each tool
    for (const mcpTool of mcpTools) {
      try {
        const providerTool = await this.convertSingleTool(mcpTool, provider);
        convertedTools.push(providerTool);
      } catch (error) {
        console.error(`[ToolSchemaConverter] Failed to convert tool ${mcpTool.name} for ${provider}:`, error);
        errors.push(`${mcpTool.name}: ${(error as Error).message}`);
      }
    }

    // Log conversion summary
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[ToolSchemaConverter] Conversion completed for ${provider}:`, {
        total: mcpTools.length,
        successful: convertedTools.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      });
    }

    // Cache successful conversions
    if (this.config.cacheConversions && convertedTools.length > 0) {
      const cacheKey = this.generateCacheKey(mcpTools, provider);
      this.cacheConversions(cacheKey, convertedTools, mcpTools);
    }

    return convertedTools;
  }

  /**
   * Convert a single MCP tool to provider-specific format
   */
  async convertSingleTool(mcpTool: MCPTool, provider: SupportedProvider): Promise<ProviderTool> {
    if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.TRACE) {
      console.log(`[ToolSchemaConverter] Converting single tool ${mcpTool.name} for ${provider}`);
    }

    // Validate input
    const mcpValidation = this.validateMCPTool(mcpTool);
    if (!mcpValidation.isValid) {
      throw new BridgeError(
        BridgeErrorType.SCHEMA_CONVERSION_ERROR,
        `Invalid MCP tool: ${mcpValidation.errors?.join(', ')}`,
        provider,
        mcpTool.name
      );
    }

    const converter = this.getConverter(provider);
    
    try {
      const providerTool = converter.convertMCPTool(mcpTool);
      
      // Validate conversion if enabled
      if (this.config.validateConversions) {
        const conversionValidation = converter.validateConversion(mcpTool, providerTool);
        if (!conversionValidation.isValid) {
          console.warn(`[ToolSchemaConverter] Conversion validation warnings for ${mcpTool.name}:`, 
            conversionValidation.warnings);
        }
      }
      
      return providerTool;
      
    } catch (error) {
      throw new BridgeError(
        BridgeErrorType.SCHEMA_CONVERSION_ERROR,
        `Failed to convert tool ${mcpTool.name} for ${provider}: ${(error as Error).message}`,
        provider,
        mcpTool.name,
        error as Error
      );
    }
  }

  /**
   * Validate MCP tool structure
   */
  validateMCPTool(tool: MCPTool): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!tool.name) {
      errors.push('Tool name is required');
    } else if (typeof tool.name !== 'string') {
      errors.push('Tool name must be a string');
    }

    if (!tool.description) {
      errors.push('Tool description is required');
    } else if (typeof tool.description !== 'string') {
      errors.push('Tool description must be a string');
    }

    if (!tool.inputSchema) {
      errors.push('Tool inputSchema is required');
    } else if (typeof tool.inputSchema !== 'object') {
      errors.push('Tool inputSchema must be an object');
    }

    // Schema validation
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      if (!tool.inputSchema.type) {
        warnings.push('Tool inputSchema should have a type property');
      }
      
      if (tool.inputSchema.type === 'object' && !tool.inputSchema.properties) {
        warnings.push('Object schema should have properties');
      }
    }

    // Name format validation
    if (tool.name) {
      const namePattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
      if (!namePattern.test(tool.name)) {
        warnings.push('Tool name should start with letter and contain only alphanumeric and underscore');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate provider tool structure
   */
  validateProviderTool(tool: ProviderTool): ValidationResult {
    const errors: string[] = [];

    if (!tool.provider) {
      errors.push('Provider tool must specify provider');
    }

    if (!tool.originalName) {
      errors.push('Provider tool must specify originalName');
    }

    if (!tool.tool) {
      errors.push('Provider tool must have tool definition');
    }

    if (tool.provider && !this.isProviderSupported(tool.provider)) {
      errors.push(`Unsupported provider: ${tool.provider}`);
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get list of supported providers
   */
  getSupportedProviders(): SupportedProvider[] {
    return Array.from(this.converters.keys());
  }

  /**
   * Check if a provider is supported
   */
  isProviderSupported(provider: SupportedProvider): boolean {
    return this.converters.has(provider);
  }

  /**
   * Get converter for provider (with validation)
   */
  private getConverter(provider: SupportedProvider): IProviderConverter {
    const converter = this.converters.get(provider);
    
    if (!converter) {
      throw new BridgeError(
        BridgeErrorType.PROVIDER_NOT_SUPPORTED,
        `No converter registered for provider: ${provider}`,
        provider
      );
    }
    
    return converter;
  }

  /**
   * Initialize default converters for supported providers
   */
  private initializeDefaultConverters(): void {
    // OpenAI converter (also works for OpenRouter)
    const openAIConverter = new OpenAIToolConverter();
    this.converters.set('openai', openAIConverter);
    this.converters.set('openrouter', openAIConverter); // Same schema format
    
    // TODO: Add more converters as they're implemented
    // this.converters.set('anthropic', new AnthropicToolConverter());
    // this.converters.set('google', new GoogleToolConverter());
    // this.converters.set('groq', openAIConverter); // Uses OpenAI format
    // this.converters.set('mistral', openAIConverter); // Uses OpenAI format
  }

  /**
   * Generate cache key for tool conversions
   */
  private generateCacheKey(mcpTools: MCPTool[], provider: SupportedProvider): string {
    const toolsHash = this.generateToolsHash(mcpTools);
    return `${provider}:${toolsHash}`;
  }

  /**
   * Generate hash for MCP tools to detect changes
   */
  private generateToolsHash(mcpTools: MCPTool[]): string {
    // Simple hash based on tool names and descriptions
    const content = mcpTools
      .map(tool => `${tool.name}:${tool.description}`)
      .sort()
      .join('|');
    
    // Simple hash function (for production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Cache conversion results
   */
  private cacheConversions(cacheKey: string, tools: ProviderTool[], mcpTools: MCPTool[]): void {
    // Implement LRU eviction if cache is full
    if (this.conversionCache.size >= this.config.maxCacheSize) {
      const oldestKey = this.conversionCache.keys().next().value;
      if (oldestKey) {
        this.conversionCache.delete(oldestKey);
      }
    }

    this.conversionCache.set(cacheKey, {
      tools: [...tools], // Store copy to prevent mutation
      timestamp: new Date().toISOString(),
      mcpToolsHash: this.generateToolsHash(mcpTools)
    });

    if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.DEBUG) {
      console.log(`[ToolSchemaConverter] Cached ${tools.length} converted tools with key: ${cacheKey}`);
    }
  }

  /**
   * Check if cached conversion is still valid
   */
  private isCacheValid(cached: ConversionCacheEntry, currentMcpTools: MCPTool[]): boolean {
    const currentHash = this.generateToolsHash(currentMcpTools);
    return cached.mcpToolsHash === currentHash;
  }

  /**
   * Clear conversion cache
   */
  public clearCache(): void {
    this.conversionCache.clear();
    
    if (this.config.enableLogging) {
      console.log('[ToolSchemaConverter] Cleared conversion cache');
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number; hitRatio?: number } {
    return {
      size: this.conversionCache.size,
      maxSize: this.config.maxCacheSize
      // TODO: Track hit ratio if needed
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ToolSchemaConverterConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.enableLogging) {
      console.log('[ToolSchemaConverter] Configuration updated:', config);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): ToolSchemaConverterConfig {
    return { ...this.config };
  }
}