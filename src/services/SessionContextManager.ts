import { CommonResult } from '../types';
import { logger } from '../utils/logger';
import { parseWorkspaceContext } from '../utils/contextUtils';
import { generateSessionId, isStandardSessionId } from '../utils/sessionUtils';

/**
 * Interface for workspace context
 */
export interface WorkspaceContext {
  workspaceId: string;
  workspacePath?: string[];
  activeWorkspace?: boolean;
}

/**
 * SessionContextManager
 * 
 * Provides a centralized service for managing and persisting workspace context
 * across tool calls within sessions. This helps maintain context continuity
 * without requiring explicit context passing between every operation.
 */
export class SessionContextManager {
  // Reference to session service for database validation
  private sessionService: any = null;
  
  // Map of sessionId -> workspace context
  private sessionContextMap: Map<string, WorkspaceContext> = new Map();
  
  // Default workspace context for new sessions (global)
  private defaultWorkspaceContext: WorkspaceContext | null = null;
  
  // Set of session IDs that have already received instructions
  private instructedSessions: Set<string> = new Set();
  
  /**
   * Set the session service for database validation
   * This is called during plugin initialization
   */
  setSessionService(sessionService: any): void {
    this.sessionService = sessionService;
    logger.systemLog('[SESSION-DEBUG] SessionService injected into SessionContextManager');
  }
  
  /**
   * Get workspace context for a specific session
   * 
   * @param sessionId The session ID to retrieve context for
   * @returns The workspace context for the session, or null if not found
   */
  getWorkspaceContext(sessionId: string): WorkspaceContext | null {
    return this.sessionContextMap.get(sessionId) || this.defaultWorkspaceContext;
  }
  
  /**
   * Set workspace context for a specific session
   * 
   * @param sessionId The session ID to set context for
   * @param context The workspace context to associate with the session
   */
  setWorkspaceContext(sessionId: string, context: WorkspaceContext): void {
    if (!sessionId) {
      logger.systemWarn('Attempted to set workspace context with empty sessionId');
      return;
    }
    
    if (!context.workspaceId) {
      logger.systemWarn('Attempted to set workspace context with empty workspaceId');
      return;
    }
    
    this.sessionContextMap.set(sessionId, context);
    logger.systemLog(`Set workspace context for session ${sessionId}: ${context.workspaceId}`);
  }
  
  /**
   * Set the default workspace context used for new sessions
   * 
   * @param context The default workspace context or null to clear
   */
  setDefaultWorkspaceContext(context: WorkspaceContext | null): void {
    this.defaultWorkspaceContext = context;
    if (context) {
      logger.systemLog(`Set default workspace context: ${context.workspaceId}`);
    } else {
      logger.systemLog('Cleared default workspace context');
    }
  }
  
  /**
   * Clear workspace context for a specific session
   * 
   * @param sessionId The session ID to clear context for
   */
  clearWorkspaceContext(sessionId: string): void {
    this.sessionContextMap.delete(sessionId);
  }
  
  /**
   * Update workspace context from a result
   * Extracts and saves workspace context from mode execution results
   * 
   * @param sessionId The session ID to update context for
   * @param result The result containing workspace context
   */
  updateFromResult(sessionId: string, result: CommonResult): void {
    if (!result.workspaceContext || !result.workspaceContext.workspaceId) {
      return;
    }
    
    this.setWorkspaceContext(sessionId, result.workspaceContext);
  }
  
  /**
   * Apply workspace context to parameters if not already specified
   * 
   * @param sessionId The session ID to get context for
   * @param params The parameters to apply context to
   * @returns The parameters with workspace context applied
   */
  applyWorkspaceContext<T extends { workspaceContext?: WorkspaceContext }>(
    sessionId: string, 
    params: T
  ): T {
    // Don't override existing context if specified
    const parsedContext = parseWorkspaceContext(params.workspaceContext);
  if (parsedContext?.workspaceId) {
      return params;
    }
    
    const context = this.getWorkspaceContext(sessionId);
    if (!context) {
      return params;
    }
    
    // Create new params object to avoid mutation
    return {
      ...params,
      workspaceContext: context
    };
  }
  
  /**
   * Check if workspace context exists for a session
   * 
   * @param sessionId The session ID to check
   * @returns True if context exists for the session
   */
  hasWorkspaceContext(sessionId: string): boolean {
    return this.sessionContextMap.has(sessionId);
  }
  
  /**
   * Get all active sessions with their workspace contexts
   * 
   * @returns Map of all session IDs to their workspace contexts
   */
  getAllSessionContexts(): Map<string, WorkspaceContext> {
    return new Map(this.sessionContextMap);
  }
  
  /**
   * Clear all session contexts
   */
  clearAll(): void {
    this.sessionContextMap.clear();
    this.defaultWorkspaceContext = null;
  }
  
  /**
   * Set the memory service for session validation
   * 
   * @param memoryService The memory service instance
   */
  setMemoryService(_memoryService: any): void {
    // Placeholder for future implementation
    // Memory service will be used for session validation in future releases
  }
  
  /**
   * Validate a session ID and auto-create session if needed
   * 
   * @param sessionId The session ID to validate (can be friendly name or standard ID)
   * @param sessionDescription Optional session description for auto-creation
   * @returns Object with validated session ID and creation status
   */
  async validateSessionId(sessionId: string, sessionDescription?: string): Promise<{id: string, created: boolean}> {
    console.log(`🚨 [SESSION-DEBUG] SessionContextManager.validateSessionId - Input: "${sessionId}"`);
    logger.systemLog(`[SESSION-DEBUG] SessionContextManager.validateSessionId - Input: "${sessionId}"`);
    
    // If no session ID is provided, generate a new one in our standard format
    if (!sessionId) {
      logger.systemWarn('[SESSION-DEBUG] Empty sessionId provided for validation, generating a new one');
      const newId = generateSessionId();
      await this.createAutoSession(newId, 'Default Session', sessionDescription);
      logger.systemLog(`[SESSION-DEBUG] Generated new session ID: "${newId}"`);
      return {id: newId, created: true};
    }
    
    // If the session ID doesn't match our standard format, it's a friendly name - create session
    if (!isStandardSessionId(sessionId)) {
      logger.systemLog(`[SESSION-DEBUG] Creating new session with friendly name: "${sessionId}"`);
      const newId = generateSessionId();
      await this.createAutoSession(newId, sessionId, sessionDescription);
      logger.systemLog(`[SESSION-DEBUG] Created session "${newId}" for friendly name "${sessionId}"`);
      return {id: newId, created: true};
    }
    
    // Session ID is in standard format - check if it exists in database
    console.log(`🚨 SessionService available: ${!!this.sessionService}`);
    if (this.sessionService) {
      try {
        console.log(`🚨 [SESSION-DEBUG] Checking if session "${sessionId}" exists in database`);
        logger.systemLog(`[SESSION-DEBUG] Checking if session "${sessionId}" exists in database`);
        const existingSession = await this.sessionService.getSession(sessionId);
        console.log(`🚨 [SESSION-DEBUG] Database lookup result:`, existingSession ? 'FOUND' : 'NOT FOUND');
        if (existingSession) {
          console.log(`🚨 [SESSION-DEBUG] Session "${sessionId}" found in database - reusing existing session`);
          logger.systemLog(`[SESSION-DEBUG] Session "${sessionId}" found in database - reusing existing session`);
          return {id: sessionId, created: false};
        } else {
          console.log(`🚨 [SESSION-DEBUG] Session "${sessionId}" not found in database - creating new session with this ID`);
          logger.systemLog(`[SESSION-DEBUG] Session "${sessionId}" not found in database - creating new session with this ID`);
          await this.createAutoSession(sessionId, `Session ${sessionId}`, sessionDescription);
          return {id: sessionId, created: true};
        }
      } catch (error) {
        console.log(`🚨 [SESSION-DEBUG] Error checking session existence:`, error);
        logger.systemWarn(`[SESSION-DEBUG] Error checking session existence: ${error instanceof Error ? error.message : String(error)}`);
        // Fallback to returning the session ID without verification
        return {id: sessionId, created: false};
      }
    } else {
      console.log(`🚨 [SESSION-DEBUG] SessionService not available - cannot validate session existence`);
      logger.systemWarn('[SESSION-DEBUG] SessionService not available - cannot validate session existence');
      // Return the original sessionId if it's already in our standard format
      logger.systemLog(`[SESSION-DEBUG] Returning existing standard session ID: "${sessionId}"`);
      return {id: sessionId, created: false};
    }
  }

  /**
   * Auto-create a session with given parameters
   * 
   * @param sessionId Generated standard session ID
   * @param sessionName Friendly name provided by LLM
   * @param sessionDescription Optional session description
   */
  private async createAutoSession(sessionId: string, sessionName: string, sessionDescription?: string): Promise<void> {
    console.log(`🚨 [SESSION-DEBUG] createAutoSession called: ${sessionId}, name: "${sessionName}"`);
    logger.systemLog(`Auto-created session: ${sessionId} with name "${sessionName}" and description "${sessionDescription || 'No description'}"`);
    
    // Create session using the injected session service
    if (this.sessionService) {
      try {
        console.log(`🚨 [SESSION-DEBUG] Creating session in database...`);
        const sessionData = {
          name: sessionName,
          description: sessionDescription || '',
          workspaceId: 'default-workspace',
          id: sessionId
        };
        
        const createdSession = await this.sessionService.createSession(sessionData);
        console.log(`🚨 [SESSION-DEBUG] Session created successfully:`, createdSession ? 'SUCCESS' : 'FAILED');
        logger.systemLog(`Session ${sessionId} successfully created in database`);
      } catch (error) {
        console.log(`🚨 [SESSION-DEBUG] Error creating session:`, error);
        logger.systemError(error as Error, `Failed to create session ${sessionId}`);
      }
    } else {
      console.log(`🚨 [SESSION-DEBUG] SessionService not available - session not saved to database`);
      logger.systemWarn(`SessionService not available - session ${sessionId} not saved to database`);
    }
  }
  
  /**
   * Update session description if it has changed
   * 
   * @param sessionId Standard session ID
   * @param sessionDescription New session description
   */
  async updateSessionDescription(sessionId: string, sessionDescription: string): Promise<void> {
    console.log(`🚨 [SESSION-DEBUG] updateSessionDescription called: ${sessionId}, description: "${sessionDescription}"`);
    logger.systemLog(`Updating session description for ${sessionId}: "${sessionDescription}"`);
    
    // Update session using the injected session service
    if (this.sessionService) {
      try {
        console.log(`🚨 [SESSION-DEBUG] Updating session description in database...`);
        // Note: This assumes the session service has an updateSession method
        // If not, we may need to use a different method
        await this.sessionService.updateSession?.(sessionId, { description: sessionDescription });
        console.log(`🚨 [SESSION-DEBUG] Session description updated successfully`);
        logger.systemLog(`Session ${sessionId} description updated in database`);
      } catch (error) {
        console.log(`🚨 [SESSION-DEBUG] Error updating session description:`, error);
        logger.systemError(error as Error, `Failed to update session ${sessionId} description`);
      }
    } else {
      console.log(`🚨 [SESSION-DEBUG] SessionService not available - description update not saved`);
      logger.systemWarn(`SessionService not available - session ${sessionId} description update not saved`);
    }
  }

  /**
   * Check if a session ID appears to be generated by Claude or not in our standard format
   * 
   * @param sessionId The session ID to check
   * @returns Boolean indicating if this appears to be a non-standard ID
   */
  isNonStandardSessionId(sessionId: string): boolean {
    return !isStandardSessionId(sessionId);
  }
  
  /**
   * Check if a session has already received instructions
   * 
   * @param sessionId The session ID to check
   * @returns Whether instructions have been sent for this session
   */
  hasReceivedInstructions(sessionId: string): boolean {
    return this.instructedSessions.has(sessionId);
  }
  
  /**
   * Mark a session as having received instructions
   * 
   * @param sessionId The session ID to mark
   */
  markInstructionsReceived(sessionId: string): void {
    this.instructedSessions.add(sessionId);
    logger.systemLog(`Marked session ${sessionId} as having received instructions`);
  }
}