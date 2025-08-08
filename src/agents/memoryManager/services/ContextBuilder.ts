/**
 * Location: /src/agents/memoryManager/services/ContextBuilder.ts
 * Purpose: Consolidated context building service combining all context generation logic from memory manager modes
 * 
 * This file consolidates:
 * - ContextBuilder logic from session creation
 * - WorkspaceContextBuilder logic from state restoration
 * - SummaryGenerator logic from various modes
 * - Context formatting and structuring utilities
 * 
 * Used by: All consolidated memory manager modes for context building operations
 */

import { App } from 'obsidian';
import { WorkspaceService } from "./WorkspaceService";
import { MemoryService } from "./MemoryService";
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Context building options
 */
export interface ContextBuildingOptions {
    workspace?: any;
    sessionGoal?: string;
    previousSessionId?: string;
    previousSessionInfo?: string;
    contextDepth?: 'minimal' | 'standard' | 'comprehensive';
    tags?: string[];
    includeTraces?: boolean;
    includeWorkspaceContext?: boolean;
    maxTraces?: number;
}

/**
 * Context data structure
 */
export interface ContextData {
    summary: string;
    associatedNotes: string[];
    sessionCreatedAt?: string;
    stateCreatedAt?: string;
    originalSessionId?: string;
    traces?: Array<{
        timestamp: number;
        content: string;
        type: string;
        importance: number;
    }>;
    tags: string[];
    workspaceContext?: any;
}

/**
 * Consolidated context building service for memory manager operations
 */
export class ContextBuilder {
    constructor(
        private app: App,
        private memoryService: MemoryService,
        private workspaceService: WorkspaceService
    ) {}

    /**
     * Build session context (consolidated from session creation logic)
     */
    async buildSessionContext(options: ContextBuildingOptions): Promise<ContextData> {
        try {
            // Build context summary based on depth
            const summary = this.buildSessionSummary(options);

            // Get associated notes if workspace is provided
            const associatedNotes = await this.extractAssociatedNotes(options.workspace);

            // Get previous session traces if requested
            let traces: any[] = [];
            if (options.includeTraces && options.previousSessionId) {
                traces = await this.getPreviousSessionTraces(options.previousSessionId, options.maxTraces);
            }

            return {
                summary,
                associatedNotes,
                sessionCreatedAt: new Date().toISOString(),
                traces,
                tags: options.tags || [],
                workspaceContext: options.includeWorkspaceContext ? options.workspace?.context : undefined
            };

        } catch (error) {
            console.warn('Error building session context:', error);
            return {
                summary: 'Session created successfully',
                associatedNotes: [],
                sessionCreatedAt: new Date().toISOString(),
                traces: [],
                tags: options.tags || []
            };
        }
    }

    /**
     * Build state restoration context (consolidated from state loading logic)
     */
    async buildStateRestorationContext(stateSnapshot: any, workspace: any, relatedTraces?: any[]): Promise<ContextData> {
        try {
            const snapshot = stateSnapshot.snapshot || {};
            
            // Build restoration summary
            const summary = this.buildStateRestorationSummary(stateSnapshot, workspace, snapshot);

            // Process active files
            const associatedNotes = this.processActiveFiles(snapshot.activeFiles || []);

            // Process memory traces
            const traces = this.processMemoryTraces(relatedTraces || []);

            return {
                summary,
                associatedNotes,
                stateCreatedAt: new Date(stateSnapshot.created).toISOString(),
                originalSessionId: stateSnapshot.sessionId,
                traces,
                tags: stateSnapshot.state?.metadata?.tags || [],
                workspaceContext: snapshot.workspaceContext
            };

        } catch (error) {
            console.warn('Error building state restoration context:', error);
            return {
                summary: `State "${stateSnapshot.name}" loaded successfully`,
                associatedNotes: [],
                stateCreatedAt: new Date().toISOString(),
                originalSessionId: stateSnapshot.sessionId,
                traces: [],
                tags: []
            };
        }
    }

    /**
     * Build workspace context (consolidated from workspace operations)
     */
    async buildWorkspaceContext(workspace: any, includeFiles: boolean = true): Promise<ContextData> {
        try {
            // Build workspace summary
            const summary = this.buildWorkspaceSummary(workspace);

            // Get associated notes if requested
            const associatedNotes = includeFiles ? await this.extractAssociatedNotes(workspace) : [];

            return {
                summary,
                associatedNotes,
                tags: workspace.context?.preferences || [],
                workspaceContext: workspace.context
            };

        } catch (error) {
            console.warn('Error building workspace context:', error);
            return {
                summary: `Workspace "${workspace.name}" loaded successfully`,
                associatedNotes: [],
                tags: []
            };
        }
    }

    /**
     * Build context trace content for memory traces
     */
    buildContextTraceContent(
        summary: string,
        contextString: string,
        sessionGoal?: string,
        previousSessionId?: string
    ): string {
        const parts: string[] = [];
        
        parts.push(`Context Summary: ${summary}`);
        
        if (contextString) {
            parts.push(`Details: ${contextString}`);
        }
        
        if (sessionGoal) {
            parts.push(`Goal: ${sessionGoal}`);
        }
        
        if (previousSessionId) {
            parts.push(`Continues from session: ${previousSessionId}`);
        }
        
        return parts.join('\n\n');
    }

    /**
     * Build restoration trace content for state loading
     */
    buildRestorationTraceContent(
        stateSnapshot: any,
        snapshot: any,
        continuationSessionId: string,
        restorationGoal?: string
    ): string {
        const parts: string[] = [];
        
        parts.push(`State Restoration: Loaded state "${stateSnapshot.name}"`);
        parts.push(`Original state created: ${new Date(stateSnapshot.created).toLocaleString()}`);
        parts.push(`Continuation session created: ${continuationSessionId}`);
        
        if (restorationGoal) {
            parts.push(`Restoration goal: ${restorationGoal}`);
        }
        
        if (snapshot.activeTask) {
            parts.push(`Active task: ${snapshot.activeTask}`);
        }
        
        if (snapshot.conversationContext) {
            parts.push(`Previous context: ${snapshot.conversationContext.substring(0, 200)}${snapshot.conversationContext.length > 200 ? '...' : ''}`);
        }
        
        if (snapshot.nextSteps && snapshot.nextSteps.length > 0) {
            parts.push(`Next steps: ${snapshot.nextSteps.slice(0, 3).join(', ')}${snapshot.nextSteps.length > 3 ? '...' : ''}`);
        }
        
        if (snapshot.activeFiles && snapshot.activeFiles.length > 0) {
            parts.push(`Active files: ${snapshot.activeFiles.slice(0, 5).join(', ')}`);
        }
        
        return parts.join('\n\n');
    }

    /**
     * Private helper methods
     */

    private buildSessionSummary(options: ContextBuildingOptions): string {
        const parts: string[] = [];
        
        if (options.workspace) {
            parts.push(`Session started in workspace: ${options.workspace.name}`);
        }
        
        if (options.sessionGoal) {
            parts.push(`Goal: ${options.sessionGoal}`);
        }
        
        if (options.previousSessionInfo) {
            parts.push(options.previousSessionInfo);
        }
        
        if (options.contextDepth === 'comprehensive' && options.workspace?.context) {
            if (options.workspace.context.purpose) {
                parts.push(`Workspace purpose: ${options.workspace.context.purpose}`);
            }
            if (options.workspace.context.currentGoal) {
                parts.push(`Workspace goal: ${options.workspace.context.currentGoal}`);
            }
        }
        
        return parts.join('. ');
    }

    private buildStateRestorationSummary(stateSnapshot: any, workspace: any, snapshot: any): string {
        const parts: string[] = [];
        
        parts.push(`Loaded state: "${stateSnapshot.name}"`);
        parts.push(`Workspace: ${workspace.name}`);
        
        if (snapshot.activeTask) {
            parts.push(`Active task: ${snapshot.activeTask}`);
        }
        
        if (snapshot.conversationContext) {
            const contextPreview = snapshot.conversationContext.length > 100 
                ? snapshot.conversationContext.substring(0, 100) + '...'
                : snapshot.conversationContext;
            parts.push(`Context: ${contextPreview}`);
        }
        
        if (snapshot.activeFiles && snapshot.activeFiles.length > 0) {
            parts.push(`${snapshot.activeFiles.length} active file${snapshot.activeFiles.length === 1 ? '' : 's'}`);
        }
        
        if (snapshot.nextSteps && snapshot.nextSteps.length > 0) {
            parts.push(`${snapshot.nextSteps.length} next step${snapshot.nextSteps.length === 1 ? '' : 's'} defined`);
        }
        
        const stateAge = Date.now() - stateSnapshot.created;
        const daysAgo = Math.floor(stateAge / (1000 * 60 * 60 * 24));
        if (daysAgo > 0) {
            parts.push(`Created ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`);
        } else {
            const hoursAgo = Math.floor(stateAge / (1000 * 60 * 60));
            if (hoursAgo > 0) {
                parts.push(`Created ${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`);
            } else {
                parts.push('Created recently');
            }
        }
        
        return parts.join('. ');
    }

    private buildWorkspaceSummary(workspace: any): string {
        const parts: string[] = [];
        
        parts.push(`Workspace: ${workspace.name}`);
        
        if (workspace.description) {
            parts.push(`Description: ${workspace.description}`);
        }
        
        if (workspace.context?.purpose) {
            parts.push(`Purpose: ${workspace.context.purpose}`);
        }
        
        if (workspace.context?.currentGoal) {
            parts.push(`Current goal: ${workspace.context.currentGoal}`);
        }
        
        if (workspace.context?.status) {
            parts.push(`Status: ${workspace.context.status}`);
        }
        
        return parts.join('. ');
    }

    private async extractAssociatedNotes(workspace: any): Promise<string[]> {
        if (!workspace?.context?.keyFiles) {
            return [];
        }

        const notes: string[] = [];
        
        try {
            // Extract file paths from keyFiles structure
            workspace.context.keyFiles.forEach((category: any) => {
                if (category.files) {
                    Object.values(category.files).forEach((filePath: any) => {
                        if (typeof filePath === 'string' && filePath.endsWith('.md')) {
                            notes.push(filePath);
                        }
                    });
                }
            });
        } catch (error) {
            console.warn('Error extracting associated notes:', error);
        }
        
        return notes.slice(0, 10); // Limit to 10 notes
    }

    private async getPreviousSessionTraces(sessionId: string, maxTraces: number = 5): Promise<any[]> {
        try {
            const traces = await this.memoryService.getSessionTraces(sessionId);
            return traces.slice(0, maxTraces).map(trace => ({
                timestamp: trace.timestamp,
                content: trace.content.substring(0, 200) + (trace.content.length > 200 ? '...' : ''),
                type: trace.type,
                importance: trace.importance
            }));
        } catch (error) {
            console.warn('Error getting previous session traces:', error);
            return [];
        }
    }

    private processActiveFiles(activeFiles: string[]): string[] {
        return activeFiles
            .filter(file => file && typeof file === 'string')
            .slice(0, 20); // Limit to 20 files
    }

    private processMemoryTraces(traces: any[]): any[] {
        return traces
            .slice(0, 5) // Limit to 5 most recent traces
            .map(trace => ({
                timestamp: trace.timestamp,
                content: trace.content.substring(0, 150) + (trace.content.length > 150 ? '...' : ''),
                type: trace.type,
                importance: trace.importance
            }));
    }
}

/**
 * Factory function to create ContextBuilder with services
 */
export async function createContextBuilder(
    app: App,
    memoryService: MemoryService,
    workspaceService: WorkspaceService
): Promise<ContextBuilder> {
    return new ContextBuilder(app, memoryService, workspaceService);
}