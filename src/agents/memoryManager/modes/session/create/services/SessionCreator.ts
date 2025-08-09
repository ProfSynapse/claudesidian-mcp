/**
 * SessionCreator - Handles session creation and ID management
 * Follows Single Responsibility Principle by focusing only on session operations
 */

import { MemoryManagerAgent } from '../../../../MemoryManager';
import { CreateSessionParams } from '../../../../types';
import { WorkspaceSession } from '../../../../../../database/workspace-types';
import { generateSessionId } from '../../../../../../utils/sessionUtils';
import { getErrorMessage } from '../../../../../../utils/errorUtils';

export interface SessionCreationData {
    workspaceId: string;
    name: string;
    description: string;
    sessionGoal?: string;
    previousSessionId?: string;
    context?: any;
    tags: string[];
}

export interface SessionCreationResult {
    session: WorkspaceSession;
    finalId: string;
    error?: string;
}

/**
 * Service responsible for creating sessions
 * Follows SRP by focusing only on session creation operations
 */
export class SessionCreator {
    constructor(private agent: MemoryManagerAgent) {}

    /**
     * Create a new session
     */
    async createSession(params: CreateSessionParams, sessionData: SessionCreationData): Promise<SessionCreationResult> {
        try {
            const memoryService = this.agent.getMemoryService();
            
            if (!memoryService) {
                return {
                    session: null as any,
                    finalId: '',
                    error: 'Memory service not available'
                };
            }

            // Determine final session ID
            const finalId = await this.determineFinalSessionId(params, memoryService);

            // Build session object
            const sessionToCreate = this.buildSessionObject(params, sessionData, finalId);

            // Create session using memory service
            const session = await memoryService.createSession(sessionToCreate);

            return {
                session,
                finalId: session.id
            };
        } catch (error) {
            return {
                session: null as any,
                finalId: '',
                error: getErrorMessage(error)
            };
        }
    }

    /**
     * Determine the final session ID to use
     */
    private async determineFinalSessionId(params: CreateSessionParams, memoryService: any): Promise<string> {
        // Check if a session with the provided ID already exists (if ID was provided)
        let existingSession: WorkspaceSession | undefined = undefined;
        
        if (params.sessionId) {
            try {
                existingSession = await memoryService.getSession(params.sessionId);
            } catch (error) {
                console.warn(`Error checking for existing session: ${getErrorMessage(error)}`);
            }
        }

        // If a session with this ID already exists or the provided ID is not in our standard format,
        // generate a new standardized ID. This ensures unique, predictable session IDs
        return existingSession ? generateSessionId() : (params.sessionId || generateSessionId());
    }

    /**
     * Build session object for creation
     */
    private buildSessionObject(params: CreateSessionParams, sessionData: SessionCreationData, finalId: string): any {
        // Enhance description with context
        const enhancedDescription = this.enhanceDescription(
            sessionData.description,
            params.context,
            sessionData.sessionGoal
        );

        return {
            workspaceId: sessionData.workspaceId,
            name: sessionData.name || `Session ${new Date().toLocaleString()}`,
            description: enhancedDescription || `Session created at ${new Date().toLocaleString()}`,
            startTime: Date.now(),
            isActive: true,
            toolCalls: 0,
            previousSessionId: sessionData.previousSessionId,
            id: finalId,
            // Store context separately for better discoverability
            context: params.context
        };
    }

    /**
     * Enhance description with context and session goal
     */
    private enhanceDescription(description: string, context: any, sessionGoal?: string): string {
        let enhancedDescription = description;
        
        // Extract context string
        const contextString = typeof context === 'string' ? context : 
                             (typeof context === 'object' && context?.toolContext ? context.toolContext : '');
        
        // Add context to description
        if (!enhancedDescription && contextString) {
            enhancedDescription = `Purpose: ${contextString}`;
        } else if (enhancedDescription && contextString && !enhancedDescription.includes(contextString)) {
            enhancedDescription = `${enhancedDescription}\n\nPurpose: ${contextString}`;
        }

        // Add session goal if provided
        if (sessionGoal && enhancedDescription && !enhancedDescription.includes(sessionGoal)) {
            enhancedDescription = `${enhancedDescription}\n\nGoal: ${sessionGoal}`;
        } else if (sessionGoal && !enhancedDescription) {
            enhancedDescription = `Goal: ${sessionGoal}`;
        }

        return enhancedDescription;
    }

    /**
     * Get previous session information
     */
    async getPreviousSessionInfo(previousSessionId: string): Promise<{
        info: string;
        tags: string[];
    }> {
        try {
            const memoryService = this.agent.getMemoryService();
            
            if (!memoryService) {
                return { info: '', tags: [] };
            }

            const previousSession = await memoryService.getSession(previousSessionId);
            
            if (!previousSession) {
                return { info: '', tags: [] };
            }

            // Build previous session info
            let info = `Continues from previous session "${previousSession.name}" `;
            info += previousSession.endTime 
                ? `(${new Date(previousSession.startTime).toLocaleString()} - ${new Date(previousSession.endTime).toLocaleString()})`
                : `(started ${new Date(previousSession.startTime).toLocaleString()})`;

            return {
                info,
                tags: ['continuation']
            };
        } catch (error) {
            console.warn(`Failed to retrieve previous session data: ${getErrorMessage(error)}`);
            return { info: '', tags: [] };
        }
    }

    /**
     * Validate session parameters
     */
    validateSessionParameters(params: CreateSessionParams): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate session name
        if (params.name && typeof params.name !== 'string') {
            errors.push('Session name must be a string');
        }

        // Validate description
        if (params.description && typeof params.description !== 'string') {
            errors.push('Session description must be a string');
        }

        // Validate session goal
        if (params.sessionGoal && typeof params.sessionGoal !== 'string') {
            errors.push('Session goal must be a string');
        }

        // Validate previous session ID format
        if (params.previousSessionId && typeof params.previousSessionId !== 'string') {
            errors.push('Previous session ID must be a string');
        }

        // Validate tags
        if (params.tags && !Array.isArray(params.tags)) {
            errors.push('Tags must be an array');
        } else if (params.tags && !params.tags.every((tag: any) => typeof tag === 'string')) {
            errors.push('All tags must be strings');
        }

        // Validate context depth
        if (params.contextDepth && !['minimal', 'standard', 'comprehensive'].includes(params.contextDepth)) {
            errors.push('Context depth must be one of: minimal, standard, comprehensive');
        }

        // Warnings
        if (!params.name && !params.description) {
            warnings.push('No name or description provided - session will use default naming');
        }

        if (!params.context) {
            warnings.push('No context provided - session will have minimal context information');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Extract context string from parameters
     */
    extractContextString(params: CreateSessionParams): string {
        if (typeof params.context === 'string') {
            return params.context;
        }
        
        if (typeof params.context === 'object' && params.context?.toolContext) {
            return params.context.toolContext;
        }
        
        return '';
    }

    /**
     * Get session creation summary
     */
    getSessionCreationSummary(session: WorkspaceSession, contextString: string): string {
        return contextString ? 
            `Created session with purpose: ${contextString}` :
            `Created session ${session.name || new Date().toLocaleString()}`;
    }

    /**
     * Check if session already exists
     */
    async sessionExists(sessionId: string): Promise<boolean> {
        try {
            const memoryService = this.agent.getMemoryService();
            
            if (!memoryService) {
                return false;
            }

            const session = await memoryService.getSession(sessionId);
            return !!session;
        } catch (error) {
            return false;
        }
    }
}