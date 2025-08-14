import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceSession } from '../types/session/SessionTypes';
import { EmbeddingService } from '../services/core/EmbeddingService';
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
    
    // Extract essential metadata fields for filtering and searching
    const metadata = {
      workspaceId: session.workspaceId,
      name: session.name || '',
      description: session.description || '',
      
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
        workspaceId: ''
      };
    }
    
    // Reconstruct the session from metadata
    return {
      id: storage.id,
      workspaceId: storage.metadata.workspaceId,
      name: storage.metadata.name || undefined,
      description: storage.metadata.description || undefined
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
    const dimension = this.embeddingService?.getDimensions?.() || (() => { 
      throw new Error('Cannot generate embedding: no embedding service configured or dimensions not available'); 
    })();
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
      id,
      workspaceId: session.workspaceId || 'default-workspace',
      name: session.name,
      description: session.description
    };
    
    await this.add(newSession);
    return newSession;
  }
  
  /**
   * Get sessions for a workspace
   * @param workspaceId Workspace ID
   * @returns Sessions for the workspace
   */
  async getSessionsByWorkspace(workspaceId: string): Promise<WorkspaceSession[]> {
    const sessions = await this.getAll({
      where: { workspaceId }
    });
    
    return sessions;
  }
}