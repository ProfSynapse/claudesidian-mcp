/**
 * MemoryTracer - Handles memory trace creation and storage
 * Follows Single Responsibility Principle by focusing only on memory operations
 */

import { MemoryManagerAgent } from '../../../../memoryManager'
import { CreateSessionParams } from '../../../../types';
import { ContextData } from './ContextBuilder';
import { getErrorMessage } from '../../../../../../utils/errorUtils';

export interface MemoryTraceData {
    sessionId: string;
    workspaceId: string;
    workspace: any;
    contextTraceContent: string;
    contextData: ContextData;
    sessionName: string;
    sessionDescription: string;
    sessionGoal?: string;
    previousSessionId?: string;
}

/**
 * Service responsible for creating memory traces
 * Follows SRP by focusing only on memory trace operations
 */
export class MemoryTracer {
    constructor(private agent: MemoryManagerAgent) {}

    /**
     * Create initial memory trace for session
     */
    async createInitialMemoryTrace(traceData: MemoryTraceData): Promise<{
        success: boolean;
        error?: string;
    }> {
        try {
            const memoryService = this.agent.getMemoryService();
            
            if (!memoryService) {
                return {
                    success: false,
                    error: 'Memory service not available'
                };
            }

            // Create the memory trace
            await memoryService.storeMemoryTrace({
                sessionId: traceData.sessionId,
                workspaceId: traceData.workspaceId,
                timestamp: Date.now(),
                content: traceData.contextTraceContent,
                activityType: 'project_plan', // Using project_plan as the type for session initialization
                metadata: {
                    tool: 'memoryManager.createSession',
                    params: {
                        name: traceData.sessionName,
                        description: traceData.sessionDescription,
                        sessionGoal: traceData.sessionGoal,
                        previousSessionId: traceData.previousSessionId,
                        workspaceId: traceData.workspaceId
                    },
                    result: {
                        sessionId: traceData.sessionId,
                        workspaceId: traceData.workspaceId
                    },
                    relatedFiles: traceData.contextData.relevantFiles || []
                },
                workspacePath: traceData.workspace.path || [],
                contextLevel: traceData.workspace.hierarchyType || 'workspace',
                importance: 0.7,
                tags: traceData.contextData.tags || []
            });

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error)
            };
        }
    }

    /**
     * Create backward compatibility trace with activity embedder
     */
    async createBackwardCompatibilityTrace(traceData: MemoryTraceData): Promise<{
        success: boolean;
        error?: string;
    }> {
        try {
            // Get the activity embedder for backward compatibility
            const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
            
            if (!activityEmbedder || typeof activityEmbedder.recordActivity !== 'function') {
                return {
                    success: false,
                    error: 'Activity embedder not available'
                };
            }

            await activityEmbedder.recordActivity(
                traceData.workspaceId,
                traceData.workspace.path,
                'project_plan',
                traceData.contextTraceContent,
                {
                    tool: 'memoryManager.createSession',
                    params: {
                        name: traceData.sessionName,
                        description: traceData.sessionDescription,
                        sessionGoal: traceData.sessionGoal,
                        previousSessionId: traceData.previousSessionId,
                        workspaceId: traceData.workspaceId
                    },
                    result: {
                        sessionId: traceData.sessionId,
                        workspaceId: traceData.workspaceId
                    }
                },
                traceData.contextData.relevantFiles || [],
                traceData.sessionId
            );

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error)
            };
        }
    }

    /**
     * Create both memory traces (new and backward compatibility)
     */
    async createMemoryTraces(traceData: MemoryTraceData): Promise<{
        success: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Create new memory trace
        const newTraceResult = await this.createInitialMemoryTrace(traceData);
        if (!newTraceResult.success) {
            errors.push(`Failed to create memory trace: ${newTraceResult.error}`);
        }

        // Create backward compatibility trace
        const backwardCompatResult = await this.createBackwardCompatibilityTrace(traceData);
        if (!backwardCompatResult.success) {
            warnings.push(`Failed to create backward compatibility trace: ${backwardCompatResult.error}`);
        }

        return {
            success: newTraceResult.success,
            errors,
            warnings
        };
    }

    /**
     * Validate memory trace parameters
     */
    validateMemoryTraceParameters(params: CreateSessionParams): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate generateContextTrace
        if (params.generateContextTrace !== undefined && typeof params.generateContextTrace !== 'boolean') {
            errors.push('generateContextTrace must be a boolean');
        }

        // Warnings
        if (params.generateContextTrace === false) {
            warnings.push('Context trace generation disabled - no initial memory trace will be created');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get memory service status
     */
    getMemoryServiceStatus(): {
        hasMemoryService: boolean;
        hasActivityEmbedder: boolean;
        canCreateTraces: boolean;
    } {
        const memoryService = this.agent.getMemoryService();
        const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();

        return {
            hasMemoryService: !!memoryService,
            hasActivityEmbedder: !!activityEmbedder,
            canCreateTraces: !!memoryService
        };
    }

    /**
     * Build memory trace metadata
     */
    buildMemoryTraceMetadata(
        sessionName: string,
        sessionDescription: string,
        sessionGoal: string | undefined,
        previousSessionId: string | undefined,
        workspaceId: string,
        sessionId: string,
        relevantFiles: string[]
    ): any {
        return {
            tool: 'memoryManager.createSession',
            params: {
                name: sessionName,
                description: sessionDescription,
                sessionGoal,
                previousSessionId,
                workspaceId
            },
            result: {
                sessionId,
                workspaceId
            },
            relatedFiles: relevantFiles
        };
    }

    /**
     * Get trace importance score
     */
    getTraceImportanceScore(hasSessionGoal: boolean, hasPreviousSession: boolean): number {
        let importance = 0.5; // Base importance
        
        if (hasSessionGoal) {
            importance += 0.1; // Higher importance for sessions with goals
        }
        
        if (hasPreviousSession) {
            importance += 0.1; // Higher importance for continuation sessions
        }
        
        return Math.min(importance, 1.0);
    }

    /**
     * Get activity type for memory trace
     */
    getActivityType(sessionGoal?: string): string {
        // Use project_plan as the default type for session initialization
        // This could be extended to use different types based on session characteristics
        return 'project_plan';
    }

    /**
     * Format trace content for storage
     */
    formatTraceContent(
        contextSummary: string,
        contextString: string,
        sessionGoal?: string,
        previousSessionId?: string
    ): string {
        let content = `Session initialized with the following context:\n\n${contextSummary}`;

        if (contextString) {
            content += `\n\nPurpose: ${contextString}`;
        }

        if (sessionGoal) {
            content += `\n\nThis session's goal is to: ${sessionGoal}`;
        }

        if (previousSessionId) {
            content += '\n\nThis session continues work from a previous session.';
        } else {
            content += '\n\nThis is a new session starting from scratch.';
        }

        return content;
    }
}