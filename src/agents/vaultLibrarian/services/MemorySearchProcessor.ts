/**
 * Memory Search Processor
 * 
 * Location: src/agents/vaultLibrarian/services/MemorySearchProcessor.ts
 * Purpose: Core search logic across multiple memory types (traces, sessions, workspaces, etc.)
 * Used by: SearchMemoryMode for processing search requests and enriching results
 */

import { Plugin } from 'obsidian';
import {
  MemorySearchParameters,
  MemorySearchResult,
  RawMemoryResult,
  MemorySearchContext,
  MemorySearchExecutionOptions,
  SearchOptions,
  ValidationResult,
  MemoryProcessorConfiguration,
  SearchMethod,
  MemoryType
} from '../../../types/memory/MemorySearchTypes';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { MemoryTraceService } from '../../../database/services/memory/MemoryTraceService';
import { WorkspaceService } from "../memoryManager/services/WorkspaceService";

export interface MemorySearchProcessorInterface {
  process(params: MemorySearchParameters): Promise<MemorySearchResult[]>;
  validateParameters(params: MemorySearchParameters): ValidationResult;
  executeSearch(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]>;
  enrichResults(results: RawMemoryResult[], context: MemorySearchContext): Promise<MemorySearchResult[]>;
  getConfiguration(): MemoryProcessorConfiguration;
  updateConfiguration(config: Partial<MemoryProcessorConfiguration>): Promise<void>;
}

export class MemorySearchProcessor implements MemorySearchProcessorInterface {
  private plugin: Plugin;
  private configuration: MemoryProcessorConfiguration;
  
  constructor(plugin: Plugin, config?: Partial<MemoryProcessorConfiguration>) {
    this.plugin = plugin;
    this.configuration = {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSearchMethod: SearchMethod.MIXED,
      enableSemanticSearch: true,
      enableExactSearch: true,
      timeoutMs: 30000,
      ...config
    };
  }

  /**
   * Main processing entry point
   */
  async process(params: MemorySearchParameters): Promise<MemorySearchResult[]> {
    // Validate parameters
    const validation = this.validateParameters(params);
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Build search context
    const context: MemorySearchContext = {
      params,
      timestamp: new Date()
    };

    // Execute search across all specified memory types
    const searchOptions = this.buildSearchOptions(params);
    const rawResults = await this.executeSearch(params.query, searchOptions);

    // Enrich results with metadata and context
    return this.enrichResults(rawResults, context);
  }

  /**
   * Validates search parameters
   */
  validateParameters(params: MemorySearchParameters): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!params.query || params.query.trim().length === 0) {
      errors.push('Query parameter is required and cannot be empty');
    }

    // Limit validation
    if (params.limit !== undefined) {
      if (params.limit < 1) {
        errors.push('Limit must be positive');
      }
      if (params.limit > this.configuration.maxLimit) {
        errors.push(`Limit cannot exceed ${this.configuration.maxLimit}`);
      }
    }

    // Date range validation
    if (params.dateRange) {
      if (params.dateRange.start && params.dateRange.end) {
        const startDate = new Date(params.dateRange.start);
        const endDate = new Date(params.dateRange.end);
        
        if (isNaN(startDate.getTime())) {
          errors.push('Invalid start date format');
        }
        if (isNaN(endDate.getTime())) {
          errors.push('Invalid end date format');
        }
        if (startDate > endDate) {
          errors.push('Start date must be before end date');
        }
      }
    }

    // Tool call filters validation
    if (params.toolCallFilters) {
      const filters = params.toolCallFilters;
      if (filters.minExecutionTime !== undefined && filters.minExecutionTime < 0) {
        errors.push('Minimum execution time must be non-negative');
      }
      if (filters.maxExecutionTime !== undefined && filters.maxExecutionTime < 0) {
        errors.push('Maximum execution time must be non-negative');
      }
      if (filters.minExecutionTime !== undefined && 
          filters.maxExecutionTime !== undefined && 
          filters.minExecutionTime > filters.maxExecutionTime) {
        errors.push('Minimum execution time must be less than maximum execution time');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute search across all memory types
   */
  async executeSearch(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const results: RawMemoryResult[] = [];
    const searchPromises: Promise<RawMemoryResult[]>[] = [];

    // Get default memory types if not specified
    const memoryTypes = (options as any).memoryTypes || ['traces', 'toolCalls', 'sessions', 'states', 'workspaces'];
    const limit = options.limit || this.configuration.defaultLimit;

    // Search legacy traces
    if (memoryTypes.includes('traces')) {
      searchPromises.push(this.searchLegacyTraces(query, options));
    }

    // Search tool call traces
    if (memoryTypes.includes('toolCalls')) {
      searchPromises.push(this.searchToolCallTraces(query, options));
    }

    // Search sessions
    if (memoryTypes.includes('sessions')) {
      searchPromises.push(this.searchSessions(query, options));
    }

    // Search states
    if (memoryTypes.includes('states')) {
      searchPromises.push(this.searchStates(query, options));
    }

    // Search workspaces
    if (memoryTypes.includes('workspaces')) {
      searchPromises.push(this.searchWorkspaces(query, options));
    }

    // Execute all searches in parallel
    const searchResults = await Promise.allSettled(searchPromises);
    
    // Collect results from successful searches
    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      } else {
        console.error('[MemorySearchProcessor] Search error:', result.reason);
      }
    }

    // Sort by score and apply limit
    results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return results.slice(0, limit);
  }

  /**
   * Enrich raw results with metadata and context
   */
  async enrichResults(results: RawMemoryResult[], context: MemorySearchContext): Promise<MemorySearchResult[]> {
    const enrichedResults: MemorySearchResult[] = [];

    for (const result of results) {
      try {
        const enriched = await this.enrichSingleResult(result, context);
        if (enriched) {
          enrichedResults.push(enriched);
        }
      } catch (error) {
        console.warn('[MemorySearchProcessor] Failed to enrich result:', error);
      }
    }

    return enrichedResults;
  }

  /**
   * Get current configuration
   */
  getConfiguration(): MemoryProcessorConfiguration {
    return { ...this.configuration };
  }

  /**
   * Update configuration
   */
  async updateConfiguration(config: Partial<MemoryProcessorConfiguration>): Promise<void> {
    this.configuration = { ...this.configuration, ...config };
  }

  // Private helper methods

  private buildSearchOptions(params: MemorySearchParameters): MemorySearchExecutionOptions {
    return {
      workspaceId: params.workspace,
      sessionId: params.sessionId,
      limit: params.limit || this.configuration.defaultLimit,
      toolCallFilters: params.toolCallFilters
    };
  }

  private async searchLegacyTraces(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const memoryService = this.getMemoryService();
    if (!memoryService) return [];

    try {
      const results = await memoryService.searchMemoryTraces(query, {
        workspaceId: options.workspaceId,
        limit: options.limit,
        sessionId: options.sessionId
      });

      return results.map(result => ({
        trace: result.trace,
        similarity: result.similarity
      }));
    } catch (error) {
      console.error('[MemorySearchProcessor] Error searching legacy traces:', error);
      return [];
    }
  }

  private async searchToolCallTraces(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const memoryTraceService = await this.getMemoryTraceService();
    if (!memoryTraceService) return [];

    try {
      const results: RawMemoryResult[] = [];
      const searchMethod = this.configuration.defaultSearchMethod;

      // Semantic search
      if (this.configuration.enableSemanticSearch && 
          (searchMethod === SearchMethod.SEMANTIC || searchMethod === SearchMethod.MIXED)) {
        const semanticResults = await memoryTraceService.searchMemoryTraces(query, {
          workspaceId: options.workspaceId,
          limit: options.limit,
          sessionId: options.sessionId
        });
        
        results.push(...semanticResults.map(result => ({
          trace: result.trace,
          similarity: result.similarity
        })));
      }

      // Exact search
      if (this.configuration.enableExactSearch && 
          (searchMethod === SearchMethod.EXACT || searchMethod === SearchMethod.MIXED)) {
        const exactResults = await this.searchToolCallsExact(query, options);
        results.push(...exactResults);
      }

      // Deduplicate results
      return this.deduplicateResults(results);
    } catch (error) {
      console.error('[MemorySearchProcessor] Error searching tool call traces:', error);
      return [];
    }
  }

  private async searchSessions(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const memoryService = this.getMemoryService();
    if (!memoryService) return [];

    try {
      const sessions = await memoryService.getAllSessions();
      const queryLower = query.toLowerCase();
      const results: RawMemoryResult[] = [];

      for (const session of sessions) {
        let score = 0;
        
        // Check name match
        if ((session.name || '').toLowerCase().includes(queryLower)) {
          score += 0.9;
        }
        
        // Check description match
        if (session.description?.toLowerCase().includes(queryLower)) {
          score += 0.8;
        }

        if (score > 0) {
          results.push({
            trace: session,
            similarity: score
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[MemorySearchProcessor] Error searching sessions:', error);
      return [];
    }
  }

  private async searchStates(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const memoryService = this.getMemoryService();
    if (!memoryService) return [];

    try {
      const states = await memoryService.getSnapshots();
      const queryLower = query.toLowerCase();
      const results: RawMemoryResult[] = [];

      for (const state of states) {
        let score = 0;
        
        // Check name match
        if (state.name.toLowerCase().includes(queryLower)) {
          score += 0.9;
        }
        
        // Check description match
        if (state.description?.toLowerCase().includes(queryLower)) {
          score += 0.8;
        }

        if (score > 0) {
          results.push({
            trace: state,
            similarity: score
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[MemorySearchProcessor] Error searching states:', error);
      return [];
    }
  }

  private async searchWorkspaces(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const workspaceService = this.getWorkspaceService();
    if (!workspaceService) return [];

    try {
      const workspaces = await workspaceService.getWorkspaces();
      const queryLower = query.toLowerCase();
      const results: RawMemoryResult[] = [];

      for (const workspace of workspaces) {
        let score = 0;
        
        // Check name match
        if (workspace.name.toLowerCase().includes(queryLower)) {
          score += 0.9;
        }
        
        // Check description match
        if (workspace.description?.toLowerCase().includes(queryLower)) {
          score += 0.8;
        }

        if (score > 0) {
          results.push({
            trace: workspace,
            similarity: score
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[MemorySearchProcessor] Error searching workspaces:', error);
      return [];
    }
  }

  private async searchToolCallsExact(query: string, options: MemorySearchExecutionOptions): Promise<RawMemoryResult[]> {
    const memoryTraceService = await this.getMemoryTraceService();
    if (!memoryTraceService) return [];

    try {
      // Get traces for exact matching
      let traces: any[] = [];
      if (options.workspaceId) {
        traces = await memoryTraceService.getMemoryTraces(options.workspaceId, options.limit);
      } else if (options.sessionId) {
        traces = await memoryTraceService.getSessionTraces(options.sessionId, options.limit);
      }

      const queryLower = query.toLowerCase();
      const results: RawMemoryResult[] = [];

      for (const trace of traces) {
        // Only process tool call traces
        if (!(trace as any).toolCallId) continue;

        let score = 0;
        const toolCallTrace = trace as any;

        // Content matching
        if (trace.content.toLowerCase().includes(queryLower)) {
          score += 0.8;
        }

        // Metadata matching
        const metadataText = JSON.stringify(trace.metadata).toLowerCase();
        if (metadataText.includes(queryLower)) {
          score += 0.6;
        }

        // Tool call specific field matching
        if (toolCallTrace.agent?.toLowerCase().includes(queryLower)) score += 0.9;
        if (toolCallTrace.mode?.toLowerCase().includes(queryLower)) score += 0.9;
        if (toolCallTrace.toolName?.toLowerCase().includes(queryLower)) score += 0.9;

        if (score > 0) {
          results.push({
            trace: trace,
            similarity: score
          });
        }
      }

      // Sort by score and limit
      results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      return results.slice(0, options.limit || this.configuration.defaultLimit);

    } catch (error) {
      console.error('[MemorySearchProcessor] Error in exact tool call search:', error);
      return [];
    }
  }

  private async enrichSingleResult(result: RawMemoryResult, context: MemorySearchContext): Promise<MemorySearchResult | null> {
    const trace = result.trace;
    const query = context.params.query;

    try {
      // Determine result type
      const resultType = this.determineResultType(trace);
      
      // Generate highlight
      const highlight = this.generateHighlight(trace, query);
      
      // Build metadata
      const metadata = this.buildMetadata(trace, resultType);
      
      // Generate context
      const searchContext = this.generateSearchContext(trace, query, resultType);

      return {
        type: resultType,
        id: trace.id,
        highlight,
        metadata,
        context: searchContext,
        score: result.similarity || 0
      };
    } catch (error) {
      console.warn('[MemorySearchProcessor] Failed to enrich result:', error);
      return null;
    }
  }

  private determineResultType(trace: any): MemoryType {
    if ((trace as any).toolCallId) return MemoryType.TOOL_CALL;
    if (trace.name && trace.startTime !== undefined) return MemoryType.SESSION;
    if (trace.name && trace.timestamp !== undefined) return MemoryType.STATE;
    if (trace.name && trace.created !== undefined) return MemoryType.WORKSPACE;
    return MemoryType.TRACE;
  }

  private generateHighlight(trace: any, query: string): string {
    const maxLength = 200;
    const content = trace.content || trace.description || trace.name || '';
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const index = contentLower.indexOf(queryLower);
    if (index === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);
    
    let highlight = content.substring(start, end);
    if (start > 0) highlight = '...' + highlight;
    if (end < content.length) highlight = highlight + '...';
    
    return highlight;
  }

  private buildMetadata(trace: any, resultType: MemoryType): any {
    const baseMetadata = {
      created: trace.timestamp ? new Date(trace.timestamp).toISOString() : 
               trace.startTime ? new Date(trace.startTime).toISOString() :
               trace.created ? new Date(trace.created).toISOString() : 
               new Date().toISOString(),
      sessionId: trace.sessionId,
      workspaceId: trace.workspaceId,
      primaryGoal: '',
      filesReferenced: trace.metadata?.relatedFiles || trace.relationships?.relatedFiles || [],
      activityType: trace.activityType
    };

    if (resultType === MemoryType.TOOL_CALL) {
      const toolCallTrace = trace as any;
      return {
        ...baseMetadata,
        toolUsed: toolCallTrace.toolName,
        modeUsed: toolCallTrace.mode,
        toolCallId: toolCallTrace.toolCallId,
        agent: toolCallTrace.agent,
        mode: toolCallTrace.mode,
        executionTime: toolCallTrace.executionContext?.timing?.executionTime,
        success: toolCallTrace.metadata?.response?.success,
        errorMessage: toolCallTrace.metadata?.response?.error?.message,
        affectedResources: toolCallTrace.relationships?.affectedResources || []
      };
    }

    return {
      ...baseMetadata,
      toolUsed: trace.metadata?.tool,
      modeUsed: '',
      updated: trace.endTime ? new Date(trace.endTime).toISOString() : 
               trace.lastAccessed ? new Date(trace.lastAccessed).toISOString() : undefined
    };
  }

  private generateSearchContext(trace: any, query: string, resultType: MemoryType): any {
    const content = trace.content || trace.description || trace.name || '';
    const context = this.generateBasicContext(content, query);

    if (resultType === MemoryType.TOOL_CALL) {
      return this.enhanceToolCallContext(context, trace);
    }

    return context;
  }

  private generateBasicContext(content: string, query: string): any {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const index = contentLower.indexOf(queryLower);
    
    if (index === -1) {
      return {
        before: '',
        match: content.substring(0, 100),
        after: ''
      };
    }
    
    const matchStart = index;
    const matchEnd = index + query.length;
    
    return {
      before: content.substring(Math.max(0, matchStart - 50), matchStart),
      match: content.substring(matchStart, matchEnd),
      after: content.substring(matchEnd, Math.min(content.length, matchEnd + 50))
    };
  }

  private enhanceToolCallContext(context: any, toolCallTrace: any): any {
    const toolInfo = `${toolCallTrace.agent}.${toolCallTrace.mode}`;
    const statusInfo = toolCallTrace.metadata?.response?.success ? 'SUCCESS' : 'FAILED';
    const executionTime = toolCallTrace.executionContext?.timing?.executionTime;
    
    return {
      before: `[${toolInfo}] ${context.before}`,
      match: context.match,
      after: `${context.after} [${statusInfo}${executionTime ? ` - ${executionTime}ms` : ''}]`
    };
  }

  private deduplicateResults(results: RawMemoryResult[]): RawMemoryResult[] {
    const seen = new Set<string>();
    const unique: RawMemoryResult[] = [];
    
    for (const result of results) {
      const id = result.trace?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(result);
      }
    }
    
    return unique;
  }

  // Service access methods
  private getMemoryService(): MemoryService | undefined {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('memoryService') || undefined;
      }
      return undefined;
    } catch (error) {
      console.warn('[MemorySearchProcessor] Failed to get MemoryService:', error);
      return undefined;
    }
  }

  private async getMemoryTraceService(): Promise<MemoryTraceService | undefined> {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      
      if (plugin?.getService) {
        return await plugin.getService('memoryTraceService', 5000);
      }
      
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('memoryTraceService');
      }
      
      return undefined;
    } catch (error) {
      console.warn('[MemorySearchProcessor] Failed to get MemoryTraceService:', error);
      return undefined;
    }
  }

  private getWorkspaceService(): WorkspaceService | undefined {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('workspaceService') || undefined;
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  }
}