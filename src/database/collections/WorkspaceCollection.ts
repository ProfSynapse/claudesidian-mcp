import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { ProjectWorkspace } from '../workspace-types';
import { EmbeddingService } from '../services/EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collection manager for project workspaces
 */
export class WorkspaceCollection extends BaseChromaCollection<ProjectWorkspace> {
  private embeddingService?: EmbeddingService;

  /**
   * Create a new workspace collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  constructor(vectorStore: IVectorStore, embeddingService?: EmbeddingService) {
    super(vectorStore, 'workspaces');
    this.embeddingService = embeddingService;
  }
  
  /**
   * Extract ID from a workspace
   * @param workspace Workspace object
   * @returns Workspace ID
   */
  protected extractId(workspace: ProjectWorkspace): string {
    return workspace.id;
  }
  
  /**
   * Convert a workspace to storage format
   * @param workspace Workspace object
   * @returns Storage object
   */
  protected async itemToStorage(workspace: ProjectWorkspace): Promise<{
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }> {
    // For workspaces, we'll create a simple text representation for embedding
    const document = this.workspaceToDocument(workspace);
    
    // Extract important metadata fields for filtering and searching
    const metadata = {
      name: workspace.name,
      description: workspace.description || '',
      hierarchyType: workspace.hierarchyType,
      parentId: workspace.parentId || '',
      rootFolder: workspace.rootFolder,
      created: workspace.created,
      lastAccessed: workspace.lastAccessed,
      status: workspace.status,
      
      // Path array converted to string for filtering
      path: workspace.path.join('/'),
      
      // Store child IDs as a string for filtering
      childWorkspaces: workspace.childWorkspaces.join(','),
      
      // Store associated notes
      associatedNotes: workspace.associatedNotes ? workspace.associatedNotes.join(',') : '',
      
      // Store other complex fields as JSON
      relatedFiles: workspace.relatedFiles ? JSON.stringify(workspace.relatedFiles) : '',
      relevanceSettings: JSON.stringify(workspace.relevanceSettings),
      activityHistory: JSON.stringify(workspace.activityHistory),
      preferences: workspace.preferences ? JSON.stringify(workspace.preferences) : '',
      checkpoints: workspace.checkpoints ? JSON.stringify(workspace.checkpoints) : '',
      completionStatus: JSON.stringify(workspace.completionStatus),
      
      // Metadata field for searching
      isWorkspace: true,
    };
    
    // Generate real embedding if service is available, otherwise use placeholder
    let embedding: number[];
    if (this.embeddingService && this.embeddingService.areEmbeddingsEnabled()) {
      try {
        embedding = await this.embeddingService.getEmbedding(document) || [];
      } catch (error) {
        console.warn('Failed to generate embedding for workspace, using placeholder:', error);
        embedding = this.generateSimpleEmbedding(document);
      }
    } else {
      embedding = this.generateSimpleEmbedding(document);
    }
    
    return {
      id: workspace.id,
      embedding,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to workspace
   * @param storage Storage object
   * @returns Workspace object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    // If no metadata is provided, we'll create a minimal workspace
    if (!storage.metadata) {
      return {
        id: storage.id,
        name: 'Unknown Workspace',
        created: Date.now(),
        lastAccessed: Date.now(),
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
      };
    }
    
    // Reconstruct the workspace from metadata and document
    return {
      id: storage.id,
      name: storage.metadata.name,
      description: storage.metadata.description || undefined,
      created: storage.metadata.created,
      lastAccessed: storage.metadata.lastAccessed,
      hierarchyType: storage.metadata.hierarchyType,
      parentId: storage.metadata.parentId || undefined,
      childWorkspaces: storage.metadata.childWorkspaces ? 
        storage.metadata.childWorkspaces.split(',').filter((id: string) => id) : [],
      path: storage.metadata.path ? storage.metadata.path.split('/') : [],
      rootFolder: storage.metadata.rootFolder,
      relatedFolders: storage.metadata.relatedFolders ? 
        JSON.parse(storage.metadata.relatedFolders) : [],
      relatedFiles: storage.metadata.relatedFiles ? 
        JSON.parse(storage.metadata.relatedFiles) : undefined,
      associatedNotes: storage.metadata.associatedNotes ? 
        storage.metadata.associatedNotes.split(',').filter((note: string) => note) : undefined,
      relevanceSettings: storage.metadata.relevanceSettings ? 
        JSON.parse(storage.metadata.relevanceSettings) : {
          folderProximityWeight: 0.3,
          recencyWeight: 0.4,
          frequencyWeight: 0.3
        },
      activityHistory: storage.metadata.activityHistory ? 
        JSON.parse(storage.metadata.activityHistory) : [],
      preferences: storage.metadata.preferences ? 
        JSON.parse(storage.metadata.preferences) : undefined,
      projectPlan: storage.metadata.projectPlan || undefined,
      checkpoints: storage.metadata.checkpoints ? 
        JSON.parse(storage.metadata.checkpoints) : undefined,
      completionStatus: storage.metadata.completionStatus ? 
        JSON.parse(storage.metadata.completionStatus) : {},
      status: storage.metadata.status
    };
  }
  
  /**
   * Create a document string representation of a workspace
   * @param workspace Workspace object
   * @returns Document string
   */
  private workspaceToDocument(workspace: ProjectWorkspace): string {
    // Create a text representation for embedding
    let document = `Workspace: ${workspace.name}\n`;
    
    if (workspace.description) {
      document += `Description: ${workspace.description}\n`;
    }
    
    document += `Type: ${workspace.hierarchyType}\n`;
    document += `Path: ${workspace.path.join('/')}\n`;
    document += `Root Folder: ${workspace.rootFolder}\n`;
    document += `Status: ${workspace.status}\n`;
    
    if (workspace.projectPlan) {
      document += `Project Plan: ${workspace.projectPlan}\n`;
    }
    
    // Add checkpoint information
    if (workspace.checkpoints && workspace.checkpoints.length > 0) {
      document += 'Checkpoints:\n';
      workspace.checkpoints.forEach(checkpoint => {
        document += `- ${checkpoint.description} (${checkpoint.completed ? 'Completed' : 'Pending'})\n`;
      });
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
   * Create a new workspace
   * @param workspace Workspace data without ID
   * @returns Created workspace with generated ID
   */
  async createWorkspace(workspace: Omit<ProjectWorkspace, 'id'>): Promise<ProjectWorkspace> {
    const id = uuidv4();
    const newWorkspace: ProjectWorkspace = {
      ...workspace,
      id,
      created: workspace.created || Date.now(),
      lastAccessed: workspace.lastAccessed || Date.now()
    };
    
    await this.add(newWorkspace);
    return newWorkspace;
  }
  
  /**
   * Get workspaces by parent ID
   * @param parentId Parent workspace ID
   * @returns Child workspaces
   */
  async getWorkspacesByParent(parentId: string): Promise<ProjectWorkspace[]> {
    return this.getAll({
      where: { parentId }
    });
  }
  
  /**
   * Get workspaces by hierarchy type
   * @param hierarchyType Hierarchy type
   * @returns Workspaces of the specified type
   */
  async getWorkspacesByType(hierarchyType: string): Promise<ProjectWorkspace[]> {
    return this.getAll({
      where: { hierarchyType }
    });
  }
  
  /**
   * Get workspace by path
   * @param path Workspace path array
   * @returns Workspace if found
   */
  async getWorkspaceByPath(path: string[]): Promise<ProjectWorkspace | undefined> {
    const pathString = path.join('/');
    
    const workspaces = await this.getAll({
      where: { path: pathString }
    });
    
    return workspaces.length > 0 ? workspaces[0] : undefined;
  }
  
  /**
   * Update last accessed timestamp
   * @param id Workspace ID
   */
  async updateLastAccessed(id: string): Promise<void> {
    const workspace = await this.get(id);
    
    if (workspace) {
      await this.update(id, {
        lastAccessed: Date.now()
      });
    }
  }
}