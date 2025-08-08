/**
 * SessionManager - Handles session creation and management for state restoration
 * Follows Single Responsibility Principle by focusing only on session management
 */

import { MemoryService } from "../services/MemoryService";

export interface SessionCreationOptions {
  workspaceId: string;
  sessionName?: string;
  sessionDescription?: string;
  restorationGoal?: string;
  stateName: string;
  stateCreatedAt: string;
  originalSessionName: string;
}

export interface SessionCreationResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Service responsible for managing session creation during state restoration
 * Follows SRP by focusing only on session management operations
 */
export class SessionManager {
  constructor(private memoryService: MemoryService) {}

  /**
   * Create a continuation session for state restoration
   */
  async createContinuationSession(options: SessionCreationOptions): Promise<SessionCreationResult> {
    try {
      const {
        workspaceId,
        sessionName,
        sessionDescription,
        restorationGoal,
        stateName,
        stateCreatedAt,
        originalSessionName
      } = options;

      // Generate a descriptive session name if not provided
      const generatedSessionName = sessionName || 
        `Continuation from "${stateName}" (${stateCreatedAt})`;
      
      // Generate a descriptive session description if not provided
      const generatedDescription = sessionDescription || 
        `Session continuing from state "${stateName}" created during "${originalSessionName}". ${
          restorationGoal ? `\nGoal: ${restorationGoal}` : ''
        }`;
      
      // Create the continuation session
      const newSession = await this.memoryService.createSession({
        workspaceId,
        name: generatedSessionName,
        description: generatedDescription,
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0,
      });

      return {
        success: true,
        sessionId: newSession.id
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create continuation session: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get active session for workspace (if not creating continuation)
   */
  async getActiveSession(workspaceId: string): Promise<SessionCreationResult> {
    try {
      const activeSessions = await this.memoryService.getSessions(workspaceId, true);
      const sessionId = activeSessions.length > 0 ? activeSessions[0].id : 'unknown';

      return {
        success: true,
        sessionId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get active session: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle backward compatibility with activity embedder
   */
  async handleBackwardCompatibility(
    activityEmbedder: any,
    workspaceId: string,
    sessionName: string,
    sessionDescription: string,
    createContinuationSession: boolean
  ): Promise<void> {
    if (!activityEmbedder) return;

    try {
      if (createContinuationSession && typeof activityEmbedder.createSession === 'function') {
        await activityEmbedder.createSession(
          workspaceId,
          sessionName,
          sessionDescription
        );
      }
    } catch (error) {
      console.warn(`Failed to handle backward compatibility: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get session ID for non-continuation scenarios
   */
  async getSessionId(
    workspaceId: string,
    activityEmbedder: any,
    createContinuationSession: boolean
  ): Promise<string> {
    if (createContinuationSession) {
      // Session creation should have been handled separately
      return 'unknown';
    }

    try {
      const activeSessions = await this.memoryService.getSessions(workspaceId, true);
      return activeSessions.length > 0 ? 
        activeSessions[0].id : 
        (activityEmbedder && typeof activityEmbedder.getActiveSession === 'function' ? 
          activityEmbedder.getActiveSession(workspaceId) : 'unknown');
    } catch (error) {
      console.warn(`Failed to get session ID: ${error instanceof Error ? error.message : String(error)}`);
      return 'unknown';
    }
  }
}