/**
 * ContextBuilder - Gathers and builds context for state creation
 * Follows Single Responsibility Principle by focusing only on context gathering
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../../../database/services/WorkspaceService';
import { WorkspaceMemoryTrace } from '../../../../../../database/workspace-types';

export interface ContextData {
  traces: WorkspaceMemoryTrace[];
  files: any[];
  enhancedDescription: string;
  enhancedMetadata: {
    tags: string[];
    reason?: string;
    activityTypes: string[];
    toolsUsed: string[];
  };
}

export interface ContextOptions {
  maxFiles: number;
  maxTraces: number;
  includeFileContents: boolean;
  tags: string[];
  reason?: string;
}

/**
 * Service responsible for gathering context data for state creation
 * Follows SRP by focusing only on context collection and enhancement
 */
export class ContextBuilder {
  constructor(
    private memoryService: MemoryService,
    private workspaceService: WorkspaceService
  ) {}

  /**
   * Build comprehensive context for state creation
   */
  async buildContext(
    workspaceId: string,
    sessionId: string,
    workspace: any,
    description: string,
    options: ContextOptions
  ): Promise<ContextData> {
    // Gather memory traces
    const traces = await this.gatherMemoryTraces(workspaceId, sessionId, options.maxTraces);
    
    // Gather relevant files
    const files = await this.gatherRelevantFiles(workspaceId, options.maxFiles, options.includeFileContents);
    
    // Enhance description with context
    const enhancedDescription = this.enhanceDescription(description, workspace, traces, files, options.reason);
    
    // Build enhanced metadata
    const enhancedMetadata = this.buildEnhancedMetadata(traces, files, workspace, options);

    return {
      traces,
      files,
      enhancedDescription,
      enhancedMetadata
    };
  }

  /**
   * Gather recent memory traces for the session/workspace
   */
  private async gatherMemoryTraces(
    workspaceId: string,
    sessionId: string,
    maxTraces: number
  ): Promise<WorkspaceMemoryTrace[]> {
    try {
      // Get traces from the workspace (MemoryService only supports workspaceId and limit)
      const traces = await this.memoryService.getMemoryTraces(workspaceId, maxTraces);

      console.log(`Gathered ${traces.length} memory traces for context`);
      return traces;
    } catch (error) {
      console.error('Error gathering memory traces:', error);
      return [];
    }
  }

  /**
   * Gather relevant files for the workspace
   */
  private async gatherRelevantFiles(
    workspaceId: string,
    maxFiles: number,
    includeContents: boolean
  ): Promise<any[]> {
    try {
      // Get associated notes for the workspace
      const filePaths = await this.workspaceService.getAssociatedNotes(workspaceId);
      
      // Limit to maxFiles
      const limitedPaths = filePaths.slice(0, maxFiles);
      
      // Convert to file objects
      const files = limitedPaths.map(path => ({
        path,
        name: path.split('/').pop() || path,
        extension: path.split('.').pop() || '',
        lastModified: Date.now(), // Would need actual file stat
        content: includeContents ? '' : undefined // Would need actual file content
      }));

      console.log(`Gathered ${files.length} relevant files for context`);
      return files;
    } catch (error) {
      console.error('Error gathering relevant files:', error);
      return [];
    }
  }

  /**
   * Enhance description with contextual information
   */
  private enhanceDescription(
    originalDescription: string,
    workspace: any,
    traces: WorkspaceMemoryTrace[],
    files: any[],
    reason?: string
  ): string {
    let enhanced = originalDescription || '';

    // Add workspace context
    if (workspace) {
      enhanced += `\n\nWorkspace: ${workspace.name} (${workspace.hierarchyType})`;
      if (workspace.description) {
        enhanced += `\nWorkspace Description: ${workspace.description}`;
      }
    }

    // Add reason if provided
    if (reason) {
      enhanced += `\n\nReason for state creation: ${reason}`;
    }

    // Add activity context
    if (traces.length > 0) {
      const activityTypes = [...new Set(traces.map(t => t.activityType))];
      enhanced += `\n\nRecent activities: ${activityTypes.join(', ')} (${traces.length} total)`;
    }

    // Add file context
    if (files.length > 0) {
      enhanced += `\n\nKey files: ${files.length} files included`;
      const fileTypes = [...new Set(files.map(f => f.extension || 'unknown').filter(Boolean))];
      if (fileTypes.length > 0) {
        enhanced += ` (${fileTypes.join(', ')})`;
      }
    }

    return enhanced;
  }

  /**
   * Build enhanced metadata from context
   */
  private buildEnhancedMetadata(
    traces: WorkspaceMemoryTrace[],
    files: any[],
    workspace: any,
    options: ContextOptions
  ): {
    tags: string[];
    reason?: string;
    activityTypes: string[];
    toolsUsed: string[];
  } {
    const tags = [...(options.tags || [])];
    
    // Extract activity types from traces
    const activityTypes = [...new Set(traces.map(trace => trace.activityType))];
    
    // Extract tools used from traces
    const toolsUsed = [...new Set(traces
      .map(trace => trace.metadata?.tool)
      .filter(Boolean) as string[]
    )];

    // Add automatic tags based on content
    if (files.length > 0) {
      tags.push(`files:${files.length}`);
      
      // Add file type tags
      const fileTypes = [...new Set(files.map(f => f.extension).filter(Boolean))];
      fileTypes.forEach(type => tags.push(`type:${type}`));
    }

    if (traces.length > 0) {
      tags.push(`traces:${traces.length}`);
      
      // Add activity type tags
      activityTypes.forEach(activity => tags.push(`activity:${activity}`));
    }

    // Add workspace-related tags
    if (workspace) {
      tags.push(`workspace:${workspace.hierarchyType}`);
      
      // Add folder tag if available
      if (workspace.rootFolder && workspace.rootFolder !== '/') {
        try {
          const folderName = workspace.rootFolder.split('/').pop();
          if (folderName) {
            tags.push(`folder:${folderName}`);
          }
        } catch (error) {
          console.warn(`Error adding folder tag: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return {
      tags: [...new Set(tags)], // Remove duplicates
      reason: options.reason,
      activityTypes,
      toolsUsed
    };
  }

  /**
   * Get context statistics
   */
  getContextStats(context: ContextData): {
    traceCount: number;
    fileCount: number;
    tagCount: number;
    activityTypeCount: number;
    toolCount: number;
  } {
    return {
      traceCount: context.traces.length,
      fileCount: context.files.length,
      tagCount: context.enhancedMetadata.tags.length,
      activityTypeCount: context.enhancedMetadata.activityTypes.length,
      toolCount: context.enhancedMetadata.toolsUsed.length
    };
  }
}