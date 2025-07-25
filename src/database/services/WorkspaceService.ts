import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceCollection } from '../collections/WorkspaceCollection';
import { ProjectWorkspace, HierarchyType, WorkspaceStatus, ItemStatus } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { EmbeddingService } from './EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

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
  }
  
  /**
   * Get all workspaces
   * @param params Optional filter parameters
   */
  async getWorkspaces(params?: {
    parentId?: string;
    hierarchyType?: HierarchyType;
    sortBy?: 'name' | 'created' | 'lastAccessed';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ProjectWorkspace[]> {
    let workspaces: ProjectWorkspace[] = [];
    
    if (params?.parentId) {
      workspaces = await this.collection.getWorkspacesByParent(params.parentId);
    } else if (params?.hierarchyType) {
      workspaces = await this.collection.getWorkspacesByType(params.hierarchyType);
    } else {
      workspaces = await this.collection.getAll();
    }
    
    // Apply sorting if requested
    if (params?.sortBy) {
      const sortOrder = params.sortOrder === 'desc' ? -1 : 1;
      workspaces.sort((a, b) => {
        if (params.sortBy === 'name') {
          return sortOrder * a.name.localeCompare(b.name);
        } else if (params.sortBy === 'created') {
          return sortOrder * (a.created - b.created);
        } else if (params.sortBy === 'lastAccessed') {
          return sortOrder * (a.lastAccessed - b.lastAccessed);
        }
        return 0;
      });
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
    
    // If this workspace has a parent, update the parent's children
    if (newWorkspace.parentId) {
      await this.addChildToParent(newWorkspace.parentId, newWorkspace.id);
    }
    
    return newWorkspace;
  }
  
  /**
   * Add a child workspace to a parent
   * @param parentId Parent workspace ID
   * @param childId Child workspace ID
   */
  private async addChildToParent(parentId: string, childId: string): Promise<void> {
    const parent = await this.collection.get(parentId);
    
    if (parent) {
      // Update parent's children if the child isn't already in the list
      if (!parent.childWorkspaces.includes(childId)) {
        await this.collection.update(parentId, {
          childWorkspaces: [...parent.childWorkspaces, childId],
          lastAccessed: Date.now()
        });
      }
    }
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
    
    // Handle parent ID changes
    if (updates.parentId !== undefined && updates.parentId !== workspace.parentId) {
      // Remove from old parent
      if (workspace.parentId) {
        const oldParent = await this.collection.get(workspace.parentId);
        if (oldParent) {
          await this.collection.update(workspace.parentId, {
            childWorkspaces: oldParent.childWorkspaces.filter(cid => cid !== id),
            lastAccessed: Date.now()
          });
        }
      }
      
      // Add to new parent
      if (updates.parentId) {
        await this.addChildToParent(updates.parentId, id);
      }
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
    deleteChildren?: boolean;
    preserveSettings?: boolean;
  }): Promise<void> {
    const workspace = await this.collection.get(id);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    // If deleteChildren is true, recursively delete child workspaces
    if (options?.deleteChildren && workspace.childWorkspaces.length > 0) {
      for (const childId of workspace.childWorkspaces) {
        await this.deleteWorkspace(childId, options);
      }
    } else if (workspace.childWorkspaces.length > 0) {
      // If not deleting children, update their parentId to the parent of this workspace
      for (const childId of workspace.childWorkspaces) {
        const child = await this.collection.get(childId);
        if (child) {
          await this.collection.update(childId, { parentId: workspace.parentId });
        }
      }
    }
    
    // Remove from parent's childWorkspaces
    if (workspace.parentId) {
      const parent = await this.collection.get(workspace.parentId);
      if (parent) {
        await this.collection.update(workspace.parentId, {
          childWorkspaces: parent.childWorkspaces.filter(cid => cid !== id),
          lastAccessed: Date.now()
        });
      }
    }
    
    // Delete the workspace
    await this.collection.delete(id);
  }
  
  /**
   * Add an activity to a workspace's history
   * @param workspaceId Workspace ID
   * @param activity Activity data
   */
  async addActivity(workspaceId: string, activity: ProjectWorkspace['activityHistory'][0]): Promise<void> {
    // Prevent recursive calls and implement rate limiting
    if (this.isRecordingActivity) {
      console.log(`[WorkspaceService] Skipping activity recording to prevent recursion for workspace ${workspaceId}`);
      return;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now - this.lastActivityTime < this.activityRateLimit) {
      console.log(`[WorkspaceService] Rate limiting activity recording for workspace ${workspaceId} (too frequent)`);
      return;
    }
    
    // Set flag and update timestamp
    this.isRecordingActivity = true;
    this.lastActivityTime = now;
    
    console.log(`[WorkspaceService] Adding activity to workspace ${workspaceId}:`, activity);
    
    try {
      const workspace = await this.collection.get(workspaceId);
      
      if (!workspace) {
        console.error(`[WorkspaceService] Workspace with ID ${workspaceId} not found`);
        this.isRecordingActivity = false; // Reset flag before throwing
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      console.log(`[WorkspaceService] Current activity history for workspace ${workspaceId} has ${workspace.activityHistory.length} entries`);
      
      // Add the activity and update last accessed
      const newHistory = [...workspace.activityHistory, activity];
      console.log(`[WorkspaceService] New activity history will have ${newHistory.length} entries`);
      
      await this.collection.update(workspaceId, {
        activityHistory: newHistory,
        lastAccessed: activity.timestamp
      });
      
      console.log(`[WorkspaceService] Successfully updated activity history for workspace ${workspaceId}`);
    } catch (error) {
      console.error(`[WorkspaceService] Failed to add activity to workspace ${workspaceId}:`, error);
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
  async recordActivity(workspaceId: string, activity: ProjectWorkspace['activityHistory'][0]): Promise<void> {
    // Prevent recursive calls and implement rate limiting
    if (this.isRecordingActivity) {
      console.log(`[WorkspaceService] Skipping recordActivity to prevent recursion for workspace ${workspaceId}`);
      return;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now - this.lastActivityTime < this.activityRateLimit) {
      console.log(`[WorkspaceService] Rate limiting recordActivity for workspace ${workspaceId} (too frequent)`);
      return;
    }
    
    console.log(`[WorkspaceService] Recording activity for workspace ${workspaceId}:`, activity);
    
    try {
      // First check if the workspace exists
      const workspace = await this.collection.get(workspaceId);
      
      if (!workspace) {
        console.error(`[WorkspaceService] Cannot record activity - workspace ${workspaceId} not found`);
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      // Extra verification - log current activity history
      console.log(`[WorkspaceService] Pre-verification: Workspace ${workspaceId} has ${workspace.activityHistory.length} activities`);
      
      // Add the activity (addActivity already handles the recursion flags)
      await this.addActivity(workspaceId, activity);
      
      // Only verify if we haven't hit recursion or rate limiting in addActivity
      if (!this.isRecordingActivity) {
        // Verify that the activity was added correctly by re-fetching the workspace
        const updatedWorkspace = await this.collection.get(workspaceId);
        
        if (updatedWorkspace) {
          console.log(`[WorkspaceService] Post-verification: Workspace ${workspaceId} now has ${updatedWorkspace.activityHistory.length} activities`);
          
          // Check if the most recent activity matches
          if (updatedWorkspace.activityHistory.length > 0) {
            const lastActivity = updatedWorkspace.activityHistory[updatedWorkspace.activityHistory.length - 1];
            console.log(`[WorkspaceService] Last activity: action=${lastActivity.action}, timestamp=${lastActivity.timestamp}`);
          }
        } else {
          console.error(`[WorkspaceService] Failed to verify activity addition - workspace ${workspaceId} not found after update`);
        }
      }
    } catch (error) {
      console.error(`[WorkspaceService] Error in recordActivity: ${error instanceof Error ? error.message : String(error)}`);
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
    status: WorkspaceStatus, 
    notes?: string
  ): Promise<void> {
    const workspace = await this.collection.get(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    // Map string status to ItemStatus type
    const itemStatus: ItemStatus = 
      status === 'completed' ? 'completed' : 
      status === 'paused' ? 'in_progress' : 
      'not_started';
      
    const completionStatus = { 
      ...workspace.completionStatus,
      [itemId]: {
        status: itemStatus,
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
   * Get a workspace by path
   * @param path Path to search for
   */
  async getWorkspaceByPath(path: string[]): Promise<ProjectWorkspace | undefined> {
    return this.collection.getWorkspaceByPath(path);
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
      console.warn(`[WorkspaceService] Cannot add associated note - workspace ${workspaceId} not found`);
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
      
      console.log(`[WorkspaceService] Added associated note ${filePath} to workspace ${workspaceId}`);
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
    
    console.log(`[WorkspaceService] Removed associated note ${filePath} from workspace ${workspaceId}`);
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
}