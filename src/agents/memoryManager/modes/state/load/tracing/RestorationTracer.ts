/**
 * RestorationTracer - Records restoration activity traces
 * Follows Single Responsibility Principle by focusing only on restoration tracing
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';

export interface RestorationTraceOptions {
  sessionId: string;
  workspaceId: string;
  stateId: string;
  stateName: string;
  stateCreatedAt: string;
  originalSessionName: string;
  originalSessionId: string;
  associatedNotes: string[];
  workspace: any;
  contextSummary: string;
  restorationGoal?: string;
  tags?: string[];
}

export interface BackwardCompatibilityOptions {
  activityEmbedder?: any;
  workspaceId: string;
  workspacePath: string[];
  restorationTraceContent: string;
  stateId: string;
  restorationGoal?: string;
  newSessionId: string;
  associatedNotes: string[];
  originalSessionId: string;
}

/**
 * Service responsible for recording restoration activity traces
 * Follows SRP by focusing only on restoration tracing operations
 */
export class RestorationTracer {
  constructor(private memoryService: MemoryService) {}

  /**
   * Record a memory trace about the restoration
   */
  async recordRestorationTrace(options: RestorationTraceOptions): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const {
        sessionId,
        workspaceId,
        stateId,
        stateName,
        stateCreatedAt,
        originalSessionName,
        originalSessionId,
        associatedNotes,
        workspace,
        contextSummary,
        restorationGoal,
        tags = []
      } = options;

      const restorationTraceContent = this.generateRestorationTraceContent(
        stateName,
        stateCreatedAt,
        originalSessionName,
        workspace,
        associatedNotes,
        contextSummary,
        restorationGoal
      );

      // Create memory trace using MemoryService
      await this.memoryService.storeMemoryTrace({
        sessionId,
        workspaceId,
        timestamp: Date.now(),
        content: restorationTraceContent,
        activityType: 'checkpoint',
        metadata: {
          tool: 'memoryManager.loadState',
          params: {
            stateId,
            workspaceId,
            restorationGoal
          },
          result: {
            newSessionId: sessionId,
            associatedNotes,
            originalSessionId
          },
          relatedFiles: associatedNotes
        },
        workspacePath: workspace.path || [],
        contextLevel: workspace.hierarchyType || 'workspace',
        importance: 0.7,
        tags
      });

      return { success: true };
    } catch (error) {
      console.warn(`Failed to create memory trace for restoration: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        error: `Failed to record restoration trace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle backward compatibility with activity embedder
   */
  async handleBackwardCompatibility(options: BackwardCompatibilityOptions): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const {
        activityEmbedder,
        workspaceId,
        workspacePath,
        restorationTraceContent,
        stateId,
        restorationGoal,
        newSessionId,
        associatedNotes,
        originalSessionId
      } = options;

      if (activityEmbedder && typeof activityEmbedder.recordActivity === 'function') {
        await activityEmbedder.recordActivity(
          workspaceId,
          workspacePath,
          'checkpoint',
          restorationTraceContent,
          {
            tool: 'memoryManager.loadState',
            params: {
              stateId,
              workspaceId,
              restorationGoal
            },
            result: {
              newSessionId,
              associatedNotes,
              originalSessionId
            }
          },
          associatedNotes,
          newSessionId
        );
      }

      return { success: true };
    } catch (error) {
      console.warn(`Failed to handle backward compatibility: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        error: `Failed to handle backward compatibility: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Generate restoration trace content
   */
  private generateRestorationTraceContent(
    stateName: string,
    stateCreatedAt: string,
    originalSessionName: string,
    workspace: any,
    associatedNotes: string[],
    contextSummary: string,
    restorationGoal?: string
  ): string {
    let content = `Loaded from state "${stateName}" created on ${stateCreatedAt} during session "${originalSessionName}"\n\n`;
    
    content += `This state captured ${associatedNotes.length} associated notes and contains workspace state from "${workspace.name}".\n\n`;
    
    if (restorationGoal) {
      content += `Restoration goal: ${restorationGoal}\n\n`;
    }
    
    content += contextSummary;

    return content;
  }

  /**
   * Generate tags for restoration trace
   */
  generateRestorationTags(
    baseTags: string[],
    workspace: any,
    state: any
  ): string[] {
    const resultTags = [...baseTags];
    resultTags.push('restored-state');
    
    // Add workspace root folder to tags
    if (workspace.rootFolder) {
      resultTags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
    }
    
    // If the state had tags, add them with the 'state-' prefix
    const stateTags = state.state?.metadata?.tags;
    if (stateTags && Array.isArray(stateTags)) {
      stateTags.forEach((tag: string) => {
        if (typeof tag === 'string' && !resultTags.includes(`state-${tag}`)) {
          resultTags.push(`state-${tag}`);
        }
      });
    }

    return resultTags;
  }
}