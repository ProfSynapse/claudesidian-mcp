import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceSession } from '../workspace-types';
import { EmbeddingService } from '../services/EmbeddingService';
import { generateSessionId } from '../../utils/sessionUtils';

/**
 * Collection manager for workspace sessions
 */
export class SessionCollection extends BaseChromaCollection<WorkspaceSession> {
  private embeddingService?: EmbeddingService;

  /**
   * Create a new session collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  constructor(vectorStore: IVectorStore, embeddingService?: EmbeddingService) {
    super(vectorStore, 'sessions');
    this.embeddingService = embeddingService;
  }
  
  /**
   * Extract ID from a session
   * @param session Session object
   * @returns Session ID
   */
  protected extractId(session: WorkspaceSession): string {
    return session.id;
  }
  
  /**
   * Convert a session to storage format
   * @param session Session object
   * @returns Storage object
   */
  protected async itemToStorage(session: WorkspaceSession): Promise<{
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }> {
    // Create a text representation for embedding
    const document = this.sessionToDocument(session);
    
    // Extract important metadata fields for filtering and searching
    const metadata = {
      workspaceId: session.workspaceId,
      startTime: session.startTime,
      endTime: session.endTime || 0,
      isActive: session.isActive,
      name: session.name || '',
      description: session.description || '',
      toolCalls: session.toolCalls,
      activitySummary: session.activitySummary || '',
      
      // Metadata field for searching
      isSession: true,
    };
    
    // Generate real embedding if service is available, otherwise use placeholder
    let embedding: number[];
    if (this.embeddingService && this.embeddingService.areEmbeddingsEnabled()) {
      try {
        embedding = await this.embeddingService.getEmbedding(document) || [];
      } catch (error) {
        console.warn('Failed to generate embedding for session, using placeholder:', error);
        embedding = this.generateSimpleEmbedding(document);
      }
    } else {
      embedding = this.generateSimpleEmbedding(document);
    }
    
    return {
      id: session.id,
      embedding,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to session
   * @param storage Storage object
   * @returns Session object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): WorkspaceSession {
    // If no metadata is provided, we'll create a minimal session
    if (!storage.metadata) {
      return {
        id: storage.id,
        workspaceId: '',
        startTime: Date.now(),
        isActive: false,
        toolCalls: 0
      };
    }
    
    // Reconstruct the session from metadata
    return {
      id: storage.id,
      workspaceId: storage.metadata.workspaceId,
      startTime: storage.metadata.startTime,
      endTime: storage.metadata.endTime > 0 ? storage.metadata.endTime : undefined,
      isActive: storage.metadata.isActive,
      name: storage.metadata.name || undefined,
      description: storage.metadata.description || undefined,
      toolCalls: storage.metadata.toolCalls,
      activitySummary: storage.metadata.activitySummary || undefined
    };
  }
  
  /**
   * Create a document string representation of a session
   * @param session Session object
   * @returns Document string
   */
  private sessionToDocument(session: WorkspaceSession): string {
    // Create a text representation for embedding
    let document = `Session: ${session.name || session.id}\n`;
    
    if (session.description) {
      document += `Description: ${session.description}\n`;
    }
    
    document += `Workspace: ${session.workspaceId}\n`;
    document += `Status: ${session.isActive ? 'Active' : 'Completed'}\n`;
    document += `Started: ${new Date(session.startTime).toISOString()}\n`;
    
    if (session.endTime) {
      document += `Ended: ${new Date(session.endTime).toISOString()}\n`;
    }
    
    document += `Tool Calls: ${session.toolCalls}\n`;
    
    if (session.activitySummary) {
      document += `Summary: ${session.activitySummary}\n`;
    }
    
    return document;
  }
  
  /**
   * Generate a simple embedding from text
   * @param text Text to embed
   * @returns Embedding vector
   */
  private generateSimpleEmbedding(text: string): number[] {
    // This is a placeholder that creates a simple embedding
    // In production, use a proper embedding model
    const dimension = 1536; // Standard embedding dimension
    const vector = new Array(dimension).fill(0);
    
    // Generate some variation based on the text content
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const position = i % dimension;
      vector[position] += charCode / 1000;
    }
    
    // Normalize to unit length
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (norm === 0) {
      return vector;
    }
    
    return vector.map(val => val / norm);
  }
  
  /**
   * Create a new session
   * @param session Session data (with optional ID)
   * @returns Created session with ID (either provided or generated)
   */
  async createSession(session: Partial<WorkspaceSession>): Promise<WorkspaceSession> {
    // Use provided ID or generate a standardized one
    const id = session.id || generateSessionId();
    
    const newSession: WorkspaceSession = {
      ...session,
      id,
      workspaceId: session.workspaceId || 'default-workspace',
      startTime: session.startTime || Date.now(),
      isActive: session.isActive !== undefined ? session.isActive : true,
      toolCalls: session.toolCalls || 0
    };
    
    await this.add(newSession);
    return newSession;
  }
  
  /**
   * Get sessions for a workspace
   * @param workspaceId Workspace ID
   * @param activeOnly Only return active sessions
   * @returns Sessions for the workspace
   */
  async getSessionsByWorkspace(workspaceId: string, activeOnly: boolean = false): Promise<WorkspaceSession[]> {
    const where: Record<string, any> = { workspaceId };
    
    if (activeOnly) {
      where.isActive = true;
    }
    
    const sessions = await this.getAll({
      where,
      sortBy: 'startTime',
      sortOrder: 'desc'
    });
    
    return sessions;
  }
  
  /**
   * Get all active sessions across all workspaces
   * @returns All active sessions
   */
  async getActiveSessions(): Promise<WorkspaceSession[]> {
    const sessions = await this.getAll({
      where: { isActive: true },
      sortBy: 'startTime',
      sortOrder: 'desc'
    });
    
    return sessions;
  }
  
  /**
   * End an active session
   * @param id Session ID
   * @param summary Optional session summary
   */
  async endSession(id: string, summary?: string): Promise<void> {
    const session = await this.get(id);
    
    if (session && session.isActive) {
      await this.update(id, {
        isActive: false,
        endTime: Date.now(),
        activitySummary: summary
      });
    }
  }
  
  /**
   * Increment tool call count for a session
   * @param id Session ID
   */
  async incrementToolCalls(id: string): Promise<void> {
    const session = await this.get(id);
    
    if (session) {
      await this.update(id, {
        toolCalls: session.toolCalls + 1
      });
    }
  }
}