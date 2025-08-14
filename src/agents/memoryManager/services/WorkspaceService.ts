import { Plugin } from 'obsidian';
import { IVectorStore } from '../../../database/interfaces/IVectorStore';
import { WorkspaceCollection } from '../../../database/collections/WorkspaceCollection';
import { ProjectWorkspace, ItemStatus } from '../../../database/workspace-types';
import { VectorStoreFactory } from '../../../database/factory/VectorStoreFactory';
import { EmbeddingService } from '../../../database/services/core/EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Constants for the global workspace
 */
export const GLOBAL_WORKSPACE_ID = 'global-workspace-default';
export const GLOBAL_WORKSPACE_NAME = 'Global Workspace';
export const GLOBAL_WORKSPACE_DESCRIPTION = 'Default workspace for global states and general work that doesn\'t belong to a specific workspace';

/**
 * Service for managing workspaces
 */
export class WorkspaceService {
  /**
   * Workspace collection
   */
  private collection: WorkspaceCollection;
  
  /**
   * Flag to prevent recursive activity recording
   */
  private isRecordingActivity = false;
  
  /**
   * Track last activity timestamp to limit frequency
   */
  private lastActivityTime = 0;
  
  /**
   * Minimum interval between activity recordings (in ms)
   */
  private activityRateLimit = 1000; // 1 second
  
  /**
   * Create a new workspace service
   * @param _plugin Plugin instance (unused but kept for API compatibility)
   * @param vectorStore Vector store instance
   * @param embeddingService Embedding service for real embeddings
   */
  constructor(_plugin: Plugin, vectorStore: IVectorStore, embeddingService: EmbeddingService) {
    this.collection = VectorStoreFactory.createWorkspaceCollection(vectorStore, embeddingService);
  }
  
  /**
   * Initialize the workspace service
   */
  async initialize(): Promise<void> {
    await this.collection.initialize();
    await this.ensureGlobalWorkspaceExists();
  }

  /**
   * Ensure the global workspace exists, creating it if necessary
   */
  private async ensureGlobalWorkspaceExists(): Promise<void> {
    try {
      // Check if global workspace already exists
      const existingGlobal = await this.collection.get(GLOBAL_WORKSPACE_ID);
      
      if (!existingGlobal) {
        
        // Create the global workspace
        const globalWorkspace: ProjectWorkspace = {
          id: GLOBAL_WORKSPACE_ID,
          name: GLOBAL_WORKSPACE_NAME,
          description: GLOBAL_WORKSPACE_DESCRIPTION,
          created: Date.now(),
          lastAccessed: Date.now(),
          rootFolder: '/', // Root of the vault
          relatedFolders: [],
          activityHistory: [],
          completionStatus: {},
          // Modern workspace context
          context: {
            purpose: 'Default workspace for general work and global states',
            currentGoal: 'Organize and manage vault-wide activities',
            status: 'Active and available for global state management',
            workflows: [
              {
                name: 'general-note-taking',
                when: 'For general notes and documentation',
                steps: ['Create note', 'Add content', 'Organize in folders']
              },
              {
                name: 'cross-workspace-research',
                when: 'For research that spans multiple workspaces',
                steps: ['Identify topics', 'Gather sources', 'Synthesize findings']
              }
            ],
            keyFiles: [
              {
                category: 'System',
                files: {
                  'Root': 'Vault root directory - all global content'
                }
              }
            ],
            preferences: [],
            agents: [],
          }
        };
        
        await this.collection.add(globalWorkspace);
      } else {
      }
    } catch (error) {
      // Don't throw - this should not prevent the service from initializing
    }
  }

  /**
   * Get the global workspace ID (for use by other services)
   */
  getGlobalWorkspaceId(): string {
    return GLOBAL_WORKSPACE_ID;
  }
  
  /**
   * Get all workspaces
   * Enhanced with comprehensive logging and error handling
   * @param params Optional filter parameters
   */
  async getWorkspaces(params?: {
    sortBy?: 'name' | 'created' | 'lastAccessed';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ProjectWorkspace[]> {
    
    let workspaces: ProjectWorkspace[] = [];
    
    try {
      // First, check collection status
      const count = await this.collection.count();
      
      if (count === 0) {
        return [];
      }
      
      // Retrieve all workspaces
      workspaces = await this.collection.getAll();
      
      
      // Log workspace details for debugging
      if (workspaces.length > 0) {
      } else {
      }
      
      // Apply sorting if requested
      if (params?.sortBy && workspaces.length > 0) {
        const sortOrder = params.sortOrder === 'desc' ? -1 : 1;
        
        workspaces.sort((a, b) => {
          try {
            if (params.sortBy === 'name') {
              return sortOrder * (a.name || '').localeCompare(b.name || '');
            } else if (params.sortBy === 'created') {
              return sortOrder * ((a.created || 0) - (b.created || 0));
            } else if (params.sortBy === 'lastAccessed') {
              return sortOrder * ((a.lastAccessed || 0) - (b.lastAccessed || 0));
            }
            return 0;
          } catch (sortError) {
            return 0;
          }
        });
        
      }
      
    } catch (error) {
      
      // Return empty array on error to prevent breaking the UI
      workspaces = [];
    }
    
    return workspaces;
  }
  
  /**
   * Get a specific workspace by ID
   * @param id Workspace ID
   */
  async getWorkspace(id: string): Promise<ProjectWorkspace | undefined> {
    return this.collection.get(id);
  }
  
  /**
   * Create a new workspace
   * @param workspace Workspace data
   */
  async createWorkspace(workspace: Omit<ProjectWorkspace, 'id'>): Promise<ProjectWorkspace> {
    const newWorkspace = await this.collection.createWorkspace(workspace);
    return newWorkspace;
  }
  
  
  /**
   * Update an existing workspace
   * @param id Workspace ID
   * @param updates Partial workspace data to update
   */
  async updateWorkspace(id: string, updates: Partial<ProjectWorkspace>): Promise<void> {
    const workspace = await this.collection.get(id);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    // Update the workspace
    await this.collection.update(id, {
      ...updates,
      lastAccessed: Date.now()
    });
  }
  
  /**
   * Delete a workspace
   * @param id Workspace ID
   * @param options Delete options
   */
  async deleteWorkspace(id: string, options?: {
    preserveSettings?: boolean;
  }): Promise<void> {
    const workspace = await this.collection.get(id);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    // Delete the workspace
    await this.collection.delete(id);
  }
  
  /**
   * Add an activity to a workspace's history
   * @param workspaceId Workspace ID
   * @param activity Activity data
   */
  async addActivity(workspaceId: string, activity: NonNullable<ProjectWorkspace['activityHistory']>[0]): Promise<void> {
    // Prevent recursive calls and implement rate limiting
    if (this.isRecordingActivity) {
      return;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now - this.lastActivityTime < this.activityRateLimit) {
      return;
    }
    
    // Set flag and update timestamp
    this.isRecordingActivity = true;
    this.lastActivityTime = now;
    
    
    try {
      const workspace = await this.collection.get(workspaceId);
      
      if (!workspace) {
        this.isRecordingActivity = false; // Reset flag before throwing
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      
      // Add the activity and update last accessed
      const newHistory = [...(workspace.activityHistory || []), activity];
      
      await this.collection.update(workspaceId, {
        activityHistory: newHistory,
        lastAccessed: activity.timestamp
      });
      
    } catch (error) {
      throw error;
    } finally {
      // Always reset the flag when done
      this.isRecordingActivity = false;
    }
  }
  
  /**
   * Record an activity to a workspace's history (alias to addActivity for API consistency)
   * @param workspaceId Workspace ID
   * @param activity Activity data
   */
  async recordActivity(workspaceId: string, activity: NonNullable<ProjectWorkspace['activityHistory']>[0]): Promise<void> {
    // Prevent recursive calls and implement rate limiting
    if (this.isRecordingActivity) {
      return;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now - this.lastActivityTime < this.activityRateLimit) {
      return;
    }
    
    
    try {
      // First check if the workspace exists
      const workspace = await this.collection.get(workspaceId);
      
      if (!workspace) {
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      // Extra verification - log current activity history
      
      // Add the activity (addActivity already handles the recursion flags)
      await this.addActivity(workspaceId, activity);
      
      // Only verify if we haven't hit recursion or rate limiting in addActivity
      if (!this.isRecordingActivity) {
        // Verify that the activity was added correctly by re-fetching the workspace
        const updatedWorkspace = await this.collection.get(workspaceId);
        
        if (updatedWorkspace) {
        } else {
        }
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Add a checkpoint to a workspace
   * @param workspaceId Workspace ID
   * @param checkpoint Checkpoint data
   */
  async addCheckpoint(workspaceId: string, checkpoint: {
    date: number;
    description: string;
    completed: boolean;
    hierarchyPath?: string[];
  }): Promise<string> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    // Generate ID for the checkpoint
    const checkpointId = uuidv4();
    
    // Add checkpoint with ID
    const newCheckpoint = {
      ...checkpoint,
      id: checkpointId
    };
    
    const checkpoints = workspace.checkpoints || [];
    
    await this.collection.update(workspaceId, {
      checkpoints: [...checkpoints, newCheckpoint],
      lastAccessed: Date.now()
    });
    
    return checkpointId;
  }
  
  /**
   * Update a checkpoint's completion status
   * @param workspaceId Workspace ID
   * @param checkpointId Checkpoint ID
   * @param completed Whether the checkpoint is completed
   */
  async updateCheckpoint(workspaceId: string, checkpointId: string, completed: boolean): Promise<void> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    const checkpoints = workspace.checkpoints || [];
    const updatedCheckpoints = checkpoints.map(cp => 
      cp.id === checkpointId ? { ...cp, completed } : cp
    );
    
    await this.collection.update(workspaceId, {
      checkpoints: updatedCheckpoints,
      lastAccessed: Date.now()
    });
  }
  
  /**
   * Update completion status for a workspace item
   * @param workspaceId Workspace ID
   * @param itemId Item ID
   * @param status New status
   * @param notes Optional completion notes
   */
  async updateCompletionStatus(
    workspaceId: string, 
    itemId: string, 
    status: ItemStatus, 
    notes?: string
  ): Promise<void> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
      
    const completionStatus = { 
      ...workspace.completionStatus,
      [itemId]: {
        status: status,
        completedDate: status === 'completed' ? Date.now() : undefined,
        completionNotes: notes
      }
    };
    
    await this.collection.update(workspaceId, {
      completionStatus,
      lastAccessed: Date.now()
    });
  }
  
  
  /**
   * Update last accessed timestamp for a workspace
   * @param id Workspace ID
   */
  async updateLastAccessed(id: string): Promise<void> {
    await this.collection.updateLastAccessed(id);
  }
  
  /**
   * Add an associated note to a workspace (files outside workspace folder that have been accessed)
   * @param workspaceId Workspace ID
   * @param filePath Path to the external file
   */
  async addAssociatedNote(workspaceId: string, filePath: string): Promise<void> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      return;
    }
    
    // Initialize associatedNotes if it doesn't exist (for existing workspaces)
    const associatedNotes = workspace.associatedNotes || [];
    
    // Only add if not already present
    if (!associatedNotes.includes(filePath)) {
      await this.collection.update(workspaceId, {
        associatedNotes: [...associatedNotes, filePath],
        lastAccessed: Date.now()
      });
      
    }
  }
  
  /**
   * Remove an associated note from a workspace
   * @param workspaceId Workspace ID
   * @param filePath Path to the file to remove
   */
  async removeAssociatedNote(workspaceId: string, filePath: string): Promise<void> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    const associatedNotes = workspace.associatedNotes || [];
    const updatedNotes = associatedNotes.filter(note => note !== filePath);
    
    await this.collection.update(workspaceId, {
      associatedNotes: updatedNotes,
      lastAccessed: Date.now()
    });
    
  }
  
  /**
   * Get all associated notes for a workspace
   * @param workspaceId Workspace ID
   * @returns Array of file paths
   */
  async getAssociatedNotes(workspaceId: string): Promise<string[]> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    return workspace.associatedNotes || [];
  }
  
  /**
   * Get diagnostic information about workspace storage
   * Enhanced debugging for backward compatibility issues
   * @returns Diagnostic information about workspace collection
   */
  async getDiagnostics(): Promise<any> {
    
    try {
      const diagnostics = await this.collection.getDiagnosticInfo();
      return diagnostics;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        totalItems: 0,
        sampleItems: [],
        formatAnalysis: { legacyCount: 0, modernCount: 0, invalidCount: 0 }
      };
    }
  }
}