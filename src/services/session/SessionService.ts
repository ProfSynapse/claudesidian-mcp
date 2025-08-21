import { SimpleMemoryService } from '../memory/SimpleMemoryService';

export interface SessionData {
  id: string;
  workspaceId: string;
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Simple session management service for immediate functionality.
 * Provides basic session tracking that can be upgraded to full functionality.
 */
export class SessionService {
  private sessions = new Map<string, SessionData>();
  
  constructor(private simpleMemoryService: SimpleMemoryService) {
  }
  
  /**
   * Create a new session
   */
  async createSession(sessionData: Omit<SessionData, 'id'> | SessionData): Promise<SessionData> {
    // Use provided ID if available, otherwise generate one
    const id = (sessionData as any).id || this.generateSessionId();
    const session: SessionData = {
      ...sessionData,
      id
    };
    
    console.log(`🚨 [SESSION-DEBUG] SessionService.createSession - using ID: "${id}"`);
    
    this.sessions.set(id, session);
    await this.simpleMemoryService.storeSession(id, session);
    
    console.log(`🚨 [SESSION-DEBUG] SessionService.createSession - stored in memory service`);
    
    // Session created
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
   * Update session data
   */
  async updateSession(session: SessionData): Promise<void> {
    this.sessions.set(session.id, session);
    await this.simpleMemoryService.storeSession(session.id, session);
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    // Note: SimpleMemoryService doesn't have delete methods, but we can clear from memory
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
  getStats(): { totalSessions: number } {
    const allSessions = Array.from(this.sessions.values());
    return {
      totalSessions: allSessions.length
    };
  }
}