import { SimpleMemoryService } from '../memory/SimpleMemoryService';

export interface SessionData {
  id: string;
  workspaceId: string;
  name: string;
  isActive: boolean;
  toolCalls: number;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Simple session management service for immediate functionality.
 * Provides basic session tracking that can be upgraded to full functionality.
 */
export class SessionService {
  private sessions = new Map<string, SessionData>();
  private activeSessionId: string | null = null;
  
  constructor(private simpleMemoryService: SimpleMemoryService) {
    console.log('[SessionService] Simple session service initialized');
  }
  
  /**
   * Create a new session
   */
  async createSession(sessionData: Omit<SessionData, 'id'>): Promise<SessionData> {
    const id = this.generateSessionId();
    const session: SessionData = {
      ...sessionData,
      id,
      startTime: sessionData.startTime || Date.now()
    };
    
    this.sessions.set(id, session);
    await this.simpleMemoryService.storeSession(id, session);
    
    if (session.isActive) {
      this.activeSessionId = id;
    }
    
    console.log(`[SessionService] Created session ${id} for workspace ${session.workspaceId}`);
    return session;
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Try to load from memory service
      session = await this.simpleMemoryService.getSession(sessionId);
      if (session) {
        this.sessions.set(sessionId, session);
      }
    }
    return session || null;
  }
  
  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionData[]> {
    const memorySessions = await this.simpleMemoryService.getAllSessions();
    // Merge with in-memory sessions
    for (const session of memorySessions) {
      if (!this.sessions.has(session.id)) {
        this.sessions.set(session.id, session);
      }
    }
    return Array.from(this.sessions.values());
  }
  
  /**
   * Get active session
   */
  async getActiveSession(): Promise<SessionData | null> {
    if (this.activeSessionId) {
      return await this.getSession(this.activeSessionId);
    }
    return null;
  }
  
  /**
   * Set session as active
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      this.activeSessionId = sessionId;
      session.isActive = true;
      await this.updateSession(session);
    }
  }
  
  /**
   * Update session data
   */
  async updateSession(session: SessionData): Promise<void> {
    this.sessions.set(session.id, session);
    await this.simpleMemoryService.storeSession(session.id, session);
  }
  
  /**
   * Increment tool call count for session
   */
  async incrementToolCalls(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.toolCalls += 1;
      await this.updateSession(session);
    }
  }
  
  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.isActive = false;
      session.endTime = Date.now();
      await this.updateSession(session);
      
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
    }
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    // Note: SimpleMemoryService doesn't have delete methods, but we can clear from memory
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }
  
  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get session statistics
   */
  getStats(): { totalSessions: number; activeSessions: number } {
    const allSessions = Array.from(this.sessions.values());
    return {
      totalSessions: allSessions.length,
      activeSessions: allSessions.filter(s => s.isActive).length
    };
  }
}