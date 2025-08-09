/**
 * ContextBuilder - Handles session context building and memory gathering
 * Follows Single Responsibility Principle by focusing only on context operations
 */

import { MemoryManagerAgent } from '../../../../MemoryManager';
import { WorkspaceMemoryTrace } from '../../../../../../database/workspace-types';
import { CreateSessionParams } from '../../../../types';
import { getErrorMessage } from '../../../../../../utils/errorUtils';

export interface ContextData {
    summary: string;
    relevantFiles?: string[];
    recentActivities?: Array<{
        timestamp: number;
        description: string;
        type: string;
    }>;
    tags: string[];
}

export interface ContextBuildingOptions {
    workspace: any;
    sessionGoal?: string;
    previousSessionId?: string;
    previousSessionInfo?: string;
    contextDepth: string;
    tags: string[];
}

/**
 * Service responsible for building session context
 * Follows SRP by focusing only on context building operations
 */
export class ContextBuilder {
    constructor(private agent: MemoryManagerAgent) {}

    /**
     * Build comprehensive context data for session
     */
    async buildSessionContext(options: ContextBuildingOptions): Promise<ContextData> {
        const contextData: ContextData = {
            summary: `Workspace: ${options.workspace.name}`,
            tags: [...options.tags]
        };

        // Add workspace tags
        const workspaceTags = this.getWorkspaceTags(options.workspace);
        contextData.tags.push(...workspaceTags);

        // Add continuation tag if applicable
        if (options.previousSessionId) {
            contextData.tags.push('continuation');
        }

        // Gather previous session context if available
        if (options.previousSessionId && options.contextDepth !== 'minimal') {
            await this.addPreviousSessionContext(contextData, options);
        }

        // Build comprehensive context summary
        contextData.summary = await this.buildContextSummary(options);

        return contextData;
    }

    /**
     * Add previous session context to context data
     */
    private async addPreviousSessionContext(contextData: ContextData, options: ContextBuildingOptions): Promise<void> {
        try {
            const memoryService = this.agent.getMemoryService();
            
            if (!memoryService || !options.previousSessionId) {
                return;
            }

            // Get previous session traces
            const previousTraces = await this.getPreviousSessionTraces(
                options.previousSessionId,
                options.workspace.id,
                options.contextDepth,
                memoryService
            );

            if (previousTraces.length > 0) {
                // Extract relevant files
                const relevantFiles = this.extractRelevantFiles(previousTraces);
                if (relevantFiles.length > 0) {
                    contextData.relevantFiles = relevantFiles;
                }

                // Summarize recent activities
                contextData.recentActivities = this.summarizeRecentActivities(previousTraces);
            }
        } catch (error) {
            console.warn(`Failed to add previous session context: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Get previous session traces
     */
    private async getPreviousSessionTraces(
        previousSessionId: string,
        workspaceId: string,
        contextDepth: string,
        memoryService: any
    ): Promise<WorkspaceMemoryTrace[]> {
        const maxTraces = contextDepth === 'comprehensive' ? 20 : 10;
        
        try {
            // Check if the method exists
            if (typeof memoryService.getSessionTraces === 'function') {
                return await memoryService.getSessionTraces(previousSessionId, maxTraces);
            } else {
                // Fall back to getting traces for the workspace
                return await memoryService.getMemoryTraces(workspaceId, maxTraces);
            }
        } catch (error) {
            console.warn(`Failed to get previous session traces: ${getErrorMessage(error)}`);
            return [];
        }
    }

    /**
     * Extract relevant files from memory traces
     */
    private extractRelevantFiles(traces: WorkspaceMemoryTrace[]): string[] {
        const relevantFiles = new Set<string>();
        
        traces.forEach((trace: WorkspaceMemoryTrace) => {
            if (trace.metadata?.relatedFiles && Array.isArray(trace.metadata.relatedFiles)) {
                trace.metadata.relatedFiles.forEach((file: string) => relevantFiles.add(file));
            }
        });

        return Array.from(relevantFiles);
    }

    /**
     * Summarize recent activities from memory traces
     */
    private summarizeRecentActivities(traces: WorkspaceMemoryTrace[]): Array<{
        timestamp: number;
        description: string;
        type: string;
    }> {
        return traces.map((trace: WorkspaceMemoryTrace) => ({
            timestamp: trace.timestamp,
            description: this.summarizeTrace(trace),
            type: trace.activityType
        }));
    }

    /**
     * Build comprehensive context summary
     */
    private async buildContextSummary(options: ContextBuildingOptions): Promise<string> {
        let contextSummary = `Workspace: ${options.workspace.name}\n`;
        
        // Add workspace description
        if (options.workspace.description) {
            contextSummary += `Description: ${options.workspace.description}\n`;
        }
        
        // Add previous session info
        if (options.previousSessionInfo) {
            contextSummary += `${options.previousSessionInfo}\n`;
        }
        
        // Add session goal
        if (options.sessionGoal) {
            contextSummary += `Goal: ${options.sessionGoal}\n`;
        }
        
        // Add workspace hierarchy info
        contextSummary += await this.buildWorkspaceHierarchyInfo(options.workspace);
        
        // Add activity history if not minimal
        if (options.contextDepth !== 'minimal') {
            contextSummary += this.buildActivityHistoryInfo(options.workspace, options.contextDepth);
        }
        
        return contextSummary;
    }

    /**
     * Build workspace hierarchy information
     */
    private async buildWorkspaceHierarchyInfo(workspace: any): Promise<string> {
        let hierarchyInfo = `Type: ${workspace.hierarchyType} level`;
        
        // Add parent information
        if (workspace.parentId) {
            try {
                const workspaceService = this.agent.getWorkspaceService();
                if (workspaceService) {
                    const parent = await workspaceService.getWorkspace(workspace.parentId);
                    if (parent) {
                        hierarchyInfo += ` within "${parent.name}"`;
                    }
                }
            } catch (error) {
                console.warn(`Failed to retrieve parent workspace: ${getErrorMessage(error)}`);
            }
        }
        
        // Add child information
        if (workspace.childWorkspaces && workspace.childWorkspaces.length > 0) {
            hierarchyInfo += `\nContains ${workspace.childWorkspaces.length} sub-items`;
        }
        
        return hierarchyInfo;
    }

    /**
     * Build activity history information
     */
    private buildActivityHistoryInfo(workspace: any, contextDepth: string): string {
        if (!workspace.activityHistory || workspace.activityHistory.length === 0) {
            return '';
        }

        // Get recent activities (last 5 for standard, last 10 for comprehensive)
        const recentActivities = workspace.activityHistory
            .sort((a: any, b: any) => b.timestamp - a.timestamp)
            .slice(0, contextDepth === 'comprehensive' ? 10 : 5);

        if (recentActivities.length === 0) {
            return '';
        }

        let activityInfo = '\n\nRecent workspace activities:';
        recentActivities.forEach((activity: any) => {
            const date = new Date(activity.timestamp).toLocaleString();
            let activityDesc = `\n- ${date}: `;
            
            switch (activity.action) {
                case 'view':
                    activityDesc += 'Viewed content';
                    break;
                case 'edit':
                    activityDesc += 'Modified content';
                    break;
                case 'create':
                    activityDesc += 'Created content';
                    break;
                case 'tool':
                    activityDesc += `Used ${activity.toolName || 'a tool'}`;
                    break;
                default:
                    activityDesc += 'Interacted with workspace';
            }
            
            activityInfo += activityDesc;
        });

        return activityInfo;
    }

    /**
     * Get workspace tags
     */
    private getWorkspaceTags(workspace: any): string[] {
        const tags: string[] = [];
        
        // Add workspace root folder to tags
        if (workspace.rootFolder) {
            tags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
        }

        return tags;
    }

    /**
     * Generate a human-readable summary of a memory trace
     */
    private summarizeTrace(trace: WorkspaceMemoryTrace): string {
        // Extract key information from the trace
        const tool = trace.metadata?.tool || 'unknown tool';
        
        // Create a summary based on activity type
        switch (trace.activityType) {
            case 'project_plan':
                return `Project planning with ${tool}`;
            case 'question':
                return `Research/questions using ${tool}`;
            case 'checkpoint':
                return `Progress checkpoint using ${tool}`;
            case 'completion':
                return `Completion status update using ${tool}`;
            case 'research':
                return `Research using ${tool}`;
            default: {
                // Extract a short summary from content
                const contentPreview = trace.content.substring(0, 50).trim();
                return contentPreview ? `${contentPreview}...` : `Activity using ${tool}`;
            }
        }
    }

    /**
     * Build context trace content for memory storage
     */
    buildContextTraceContent(
        contextSummary: string,
        contextString: string,
        sessionGoal?: string,
        previousSessionId?: string
    ): string {
        return `Session initialized with the following context:
          
${contextSummary}

${contextString ? `Purpose: ${contextString}` : ''}
${sessionGoal ? `This session's goal is to: ${sessionGoal}` : ''}
${previousSessionId ? 'This session continues work from a previous session.' : 'This is a new session starting from scratch.'}`;
    }

    /**
     * Get context validation
     */
    validateContextParameters(params: CreateSessionParams): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate context depth
        if (params.contextDepth && !['minimal', 'standard', 'comprehensive'].includes(params.contextDepth)) {
            errors.push('Context depth must be one of: minimal, standard, comprehensive');
        }

        // Validate generateContextTrace
        if (params.generateContextTrace !== undefined && typeof params.generateContextTrace !== 'boolean') {
            errors.push('generateContextTrace must be a boolean');
        }

        // Warnings
        if (!params.context) {
            warnings.push('No context provided - session will have minimal context information');
        }

        if (params.contextDepth === 'minimal') {
            warnings.push('Minimal context depth selected - limited session context will be available');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}