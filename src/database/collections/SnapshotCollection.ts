import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceStateSnapshot } from '../workspace-types';
import { EmbeddingService } from '../services/core/EmbeddingService';
import { WorkspaceContext } from '../types/workspace/WorkspaceTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collection manager for workspace state snapshots
 */
export class SnapshotCollection extends BaseChromaCollection<WorkspaceStateSnapshot> {
  private embeddingService?: EmbeddingService;

  /**
   * Create a new snapshot collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  constructor(vectorStore: IVectorStore, embeddingService?: EmbeddingService) {
    super(vectorStore, 'snapshots');
    this.embeddingService = embeddingService;
  }
  
  /**
   * Extract ID from a snapshot
   * @param snapshot Snapshot object
   * @returns Snapshot ID
   */
  protected extractId(snapshot: WorkspaceStateSnapshot): string {
    return snapshot.id;
  }
  
  /**
   * Convert a snapshot to storage format
   * @param snapshot Snapshot object
   * @returns Storage object
   */
  protected async itemToStorage(snapshot: WorkspaceStateSnapshot): Promise<{
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }> {
    // Create a text representation for embedding
    const document = this.snapshotToDocument(snapshot);
    
    // Extract important metadata fields for filtering and searching
    const metadata = {
      workspaceId: snapshot.workspaceId,
      sessionId: snapshot.sessionId,
      timestamp: snapshot.timestamp,
      name: snapshot.name,
      description: snapshot.description || '',
      
      // Store workspace data as serialized JSON
      workspaceData: JSON.stringify(snapshot.state?.workspace || {}),
      recentTraces: JSON.stringify(snapshot.state?.recentTraces || []),
      contextFiles: JSON.stringify(snapshot.state?.contextFiles || []),
      stateMetadata: JSON.stringify(snapshot.state?.metadata || {}),
      
      // Metadata field for searching
      isSnapshot: true,
    };
    
    // Generate real embedding if service is available, otherwise use placeholder
    let embedding: number[];
    if (this.embeddingService && this.embeddingService.areEmbeddingsEnabled()) {
      try {
        embedding = await this.embeddingService.getEmbedding(document) || [];
      } catch (error) {
        console.warn('Failed to generate embedding for snapshot, using placeholder:', error);
        embedding = this.generateSimpleEmbedding(document);
      }
    } else {
      embedding = this.generateSimpleEmbedding(document);
    }
    
    return {
      id: snapshot.id,
      embedding,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to snapshot
   * @param storage Storage object
   * @returns Snapshot object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): WorkspaceStateSnapshot {
    // If no metadata is provided, we'll create a minimal snapshot
    if (!storage.metadata) {
      const now = Date.now();
      return {
        id: storage.id,
        workspaceId: '',
        sessionId: '',
        timestamp: now,
        name: 'Unknown Snapshot',
        created: now,
        snapshot: {
          workspaceContext: {
            purpose: 'Unknown snapshot',
            currentGoal: 'Unknown goal',
            status: 'Unknown status',
            workflows: [],
            keyFiles: [{
              category: 'Unknown',
              files: {}
            }],
            preferences: [],
            agents: [],
          } as WorkspaceContext,
          conversationContext: 'Unknown snapshot',
          activeTask: 'Unknown',
          activeFiles: [],
          nextSteps: [],
          reasoning: 'Unknown snapshot'
        },
        state: {
          workspace: {
            id: '',
            name: '',
            created: 0,
            lastAccessed: 0,
            rootFolder: '/',
            relatedFolders: [],
            activityHistory: [],
            completionStatus: {}
          },
          recentTraces: [],
          contextFiles: [],
          metadata: {}
        }
      };
    }
    
    // Reconstruct the snapshot from metadata
    return {
      id: storage.id,
      workspaceId: storage.metadata.workspaceId,
      sessionId: storage.metadata.sessionId,
      timestamp: storage.metadata.timestamp,
      name: storage.metadata.name,
      created: storage.metadata.timestamp,
      snapshot: {
        workspaceContext: {
          purpose: 'Restored snapshot',
          currentGoal: 'Restore state',
          status: 'Restored',
          workflows: [],
          keyFiles: [{
            category: 'Restored',
            files: {}
          }],
          preferences: [],
          agents: [],
        } as WorkspaceContext,
        conversationContext: storage.metadata.description || 'Restored snapshot',
        activeTask: 'Restored operation',
        activeFiles: [],
        nextSteps: [],
        reasoning: storage.metadata.description || 'Restored snapshot'
      },
      description: storage.metadata.description || undefined,
      state: {
        workspace: JSON.parse(storage.metadata.workspaceData),
        recentTraces: JSON.parse(storage.metadata.recentTraces),
        contextFiles: JSON.parse(storage.metadata.contextFiles),
        metadata: JSON.parse(storage.metadata.stateMetadata)
      }
    };
  }
  
  /**
   * Create a document string representation of a snapshot
   * @param snapshot Snapshot object
   * @returns Document string
   */
  private snapshotToDocument(snapshot: WorkspaceStateSnapshot): string {
    // Create a text representation for embedding
    let document = `Snapshot: ${snapshot.name}\n`;
    
    if (snapshot.description) {
      document += `Description: ${snapshot.description}\n`;
    }
    
    document += `Workspace: ${snapshot.workspaceId} (${snapshot.state?.workspace?.name || 'Unknown'})\n`;
    document += `Session: ${snapshot.sessionId}\n`;
    document += `Created: ${new Date(snapshot.timestamp || Date.now()).toISOString()}\n`;
    
    // Add context files
    if ((snapshot.state?.contextFiles?.length || 0) > 0) {
      document += 'Context Files:\n';
      (snapshot.state?.contextFiles || []).forEach(file => {
        document += `- ${file}\n`;
      });
    }
    
    // Add workspace metadata if available
    if (snapshot.state?.workspace?.name) {
      document += `Workspace Name: ${snapshot.state.workspace.name}\n`;
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
   * Create a new snapshot
   * @param snapshot Snapshot data without ID
   * @returns Created snapshot with generated ID
   */
  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    const id = uuidv4();
    const newSnapshot: WorkspaceStateSnapshot = {
      ...snapshot,
      id,
      timestamp: snapshot.timestamp || Date.now()
    };
    
    await this.add(newSnapshot);
    return newSnapshot;
  }
  
  /**
   * Get snapshots for a workspace
   * @param workspaceId Workspace ID
   * @param sessionId Optional session ID filter
   * @returns Snapshots for the workspace
   */
  async getSnapshotsByWorkspace(workspaceId: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    const where: Record<string, any> = { workspaceId };
    
    if (sessionId) {
      where.sessionId = sessionId;
    }
    
    const snapshots = await this.getAll({
      where,
      sortBy: 'timestamp',
      sortOrder: 'desc'
    });
    
    return snapshots;
  }
  
  /**
   * Get snapshots for a session with optional workspace filtering
   * @param sessionId Session ID
   * @param workspaceId Optional workspace ID for additional filtering
   * @returns Snapshots for the session, optionally filtered by workspace
   */
  async getSnapshotsBySession(sessionId: string, workspaceId?: string): Promise<WorkspaceStateSnapshot[]> {
    console.log(`SnapshotCollection.getSnapshotsBySession called with sessionId: ${sessionId}, workspaceId: ${workspaceId || 'none'}`);
    try {
      const where: Record<string, any> = { sessionId };
      
      // Add workspace filtering if provided
      if (workspaceId) {
        where.workspaceId = workspaceId;
      }
      
      const snapshots = await this.getAll({
        where,
        sortBy: 'timestamp',
        sortOrder: 'desc'
      });
      
      console.log(`Found ${snapshots.length} snapshots for session ${sessionId}${workspaceId ? ` in workspace ${workspaceId}` : ''}`);
      return snapshots;
    } catch (error) {
      console.error(`Error in getSnapshotsBySession for ${sessionId}${workspaceId ? ` in workspace ${workspaceId}` : ''}:`, error);
      throw error;
    }
  }
  
}