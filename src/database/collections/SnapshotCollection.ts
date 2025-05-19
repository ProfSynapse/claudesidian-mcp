import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceStateSnapshot } from '../workspace-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collection manager for workspace state snapshots
 */
export class SnapshotCollection extends BaseChromaCollection<WorkspaceStateSnapshot> {
  /**
   * Create a new snapshot collection
   * @param vectorStore Vector store instance
   */
  constructor(vectorStore: IVectorStore) {
    super(vectorStore, 'snapshots');
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
  protected itemToStorage(snapshot: WorkspaceStateSnapshot): {
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  } {
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
      workspaceData: JSON.stringify(snapshot.state.workspace),
      recentTraces: JSON.stringify(snapshot.state.recentTraces),
      contextFiles: JSON.stringify(snapshot.state.contextFiles),
      stateMetadata: JSON.stringify(snapshot.state.metadata),
      
      // Metadata field for searching
      isSnapshot: true,
    };
    
    // Generate a simple embedding from the document
    const embedding = this.generateSimpleEmbedding(document);
    
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
      return {
        id: storage.id,
        workspaceId: '',
        sessionId: '',
        timestamp: Date.now(),
        name: 'Unknown Snapshot',
        state: {
          workspace: {
            id: '',
            name: '',
            created: 0,
            lastAccessed: 0,
            hierarchyType: 'workspace',
            childWorkspaces: [],
            path: [],
            rootFolder: '/',
            relatedFolders: [],
            relevanceSettings: {
              folderProximityWeight: 0.3,
              recencyWeight: 0.4,
              frequencyWeight: 0.3
            },
            activityHistory: [],
            completionStatus: {},
            status: 'active'
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
    
    document += `Workspace: ${snapshot.workspaceId} (${snapshot.state.workspace.name})\n`;
    document += `Session: ${snapshot.sessionId}\n`;
    document += `Created: ${new Date(snapshot.timestamp).toISOString()}\n`;
    
    // Add context files
    if (snapshot.state.contextFiles.length > 0) {
      document += 'Context Files:\n';
      snapshot.state.contextFiles.forEach(file => {
        document += `- ${file}\n`;
      });
    }
    
    // Add workspace metadata
    document += `Status: ${snapshot.state.workspace.status}\n`;
    document += `Hierarchy: ${snapshot.state.workspace.hierarchyType}\n`;
    
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
   * Get snapshots for a session
   * @param sessionId Session ID
   * @returns Snapshots for the session
   */
  async getSnapshotsBySession(sessionId: string): Promise<WorkspaceStateSnapshot[]> {
    console.log(`SnapshotCollection.getSnapshotsBySession called with sessionId: ${sessionId}`);
    try {
      const snapshots = await this.getAll({
        where: { sessionId },
        sortBy: 'timestamp',
        sortOrder: 'desc'
      });
      
      console.log(`Found ${snapshots.length} snapshots for session ${sessionId}`);
      return snapshots;
    } catch (error) {
      console.error(`Error in getSnapshotsBySession for ${sessionId}:`, error);
      throw error;
    }
  }
  
}