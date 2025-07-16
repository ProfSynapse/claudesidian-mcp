/**
 * SessionValidator - Handles session resolution, validation, and creation
 * Follows Single Responsibility Principle by focusing only on session management
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';

export interface SessionResolutionResult {
  success: boolean;
  sessionId?: string;
  session?: any;
  error?: string;
  wasCreated?: boolean;
}

/**
 * Service responsible for session resolution and validation for state creation
 * Follows SRP by focusing only on session-related operations
 */
export class SessionValidator {
  constructor(
    private memoryService: MemoryService,
    private activityEmbedder?: any
  ) {}

  /**
   * Resolve session for state creation - either use provided or find/create appropriate session
   */
  async resolveSession(
    workspaceId: string,
    targetSessionId?: string,
    stateName?: string
  ): Promise<SessionResolutionResult> {
    try {
      // If a specific session was provided, validate it
      if (targetSessionId) {
        const result = await this.validateProvidedSession(targetSessionId, workspaceId);
        if (result.success) {
          return result;
        }
        // If provided session is invalid, fall back to finding/creating one
        console.warn(`Provided session ${targetSessionId} invalid, falling back to workspace session`);
      }

      // Try to find an existing active session for this workspace
      const activeSessionResult = await this.findActiveSession(workspaceId);
      if (activeSessionResult.success) {
        return activeSessionResult;
      }

      // Create a new session for this workspace
      return await this.createSessionForState(workspaceId, stateName);

    } catch (error) {
      return {
        success: false,
        error: `Failed to resolve session: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate a provided session ID
   */
  private async validateProvidedSession(
    sessionId: string,
    expectedWorkspaceId: string
  ): Promise<SessionResolutionResult> {
    try {
      const session = await this.memoryService.getSession(sessionId);
      
      if (!session) {
        return {
          success: false,
          error: `Session with ID ${sessionId} not found`
        };
      }
      
      // Validate that the session belongs to the correct workspace
      if (session.workspaceId !== expectedWorkspaceId) {
        return {
          success: false,
          error: `Session ${sessionId} belongs to workspace ${session.workspaceId}, not ${expectedWorkspaceId}`
        };
      }

      return {
        success: true,
        sessionId,
        session,
        wasCreated: false
      };
    } catch (error) {
      return {
        success: false,
        error: `Error validating session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Find an active session for the workspace
   */
  private async findActiveSession(workspaceId: string): Promise<SessionResolutionResult> {
    try {
      const activeSessions = await this.memoryService.getSessions(workspaceId, true);
      
      if (activeSessions && activeSessions.length > 0) {
        const session = activeSessions[0];
        console.log(`Using existing active session ${session.id} for workspace ${workspaceId}`);
        
        return {
          success: true,
          sessionId: session.id,
          session,
          wasCreated: false
        };
      }

      return {
        success: false,
        error: 'No active sessions found for workspace'
      };
    } catch (error) {
      return {
        success: false,
        error: `Error finding active session: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a new session for state creation
   */
  private async createSessionForState(
    workspaceId: string,
    stateName?: string
  ): Promise<SessionResolutionResult> {
    try {
      const sessionName = stateName ? `Session for state: ${stateName}` : 'State creation session';
      const sessionDescription = stateName 
        ? `Auto-created session for creating state "${stateName}"`
        : 'Auto-created session for state creation';

      const newSession = await this.memoryService.createSession({
        workspaceId,
        name: sessionName,
        description: sessionDescription,
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0
      });
      
      console.log(`Created new session ${newSession.id} for workspace ${workspaceId}`);
      
      // For backward compatibility with activity embedder
      if (this.activityEmbedder && typeof this.activityEmbedder.createSession === 'function') {
        try {
          await this.activityEmbedder.createSession(
            workspaceId,
            sessionName,
            sessionDescription
          );
        } catch (embedderError) {
          console.warn('Failed to notify activity embedder of session creation:', embedderError);
          // Don't fail the entire operation for embedder issues
        }
      }
      
      return {
        success: true,
        sessionId: newSession.id,
        session: newSession,
        wasCreated: true
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate session ID format
   */
  validateSessionId(sessionId: string): { isValid: boolean; error?: string } {
    if (!sessionId || typeof sessionId !== 'string') {
      return {
        isValid: false,
        error: 'Session ID must be a non-empty string'
      };
    }

    if (sessionId.trim().length === 0) {
      return {
        isValid: false,
        error: 'Session ID cannot be empty'
      };
    }

    return { isValid: true };
  }
}