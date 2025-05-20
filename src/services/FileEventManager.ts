import { App, Plugin, TAbstractFile, TFile, debounce } from 'obsidian';
import { MemoryService } from '../database/services/MemoryService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { EventManager } from './EventManager';
import { HierarchyType } from '../database/workspace-types';
import { sanitizePath } from '../utils/pathUtils';

/**
 * File event structure for change tracking
 */
interface FileEvent {
  path: string;
  type: 'create' | 'modify' | 'delete';
  timestamp: number;
  workspaceIds: string[];
}

/**
 * Cache item for workspace-file relationship
 */
interface FileCacheItem {
  workspaceIds: string[];
  timestamp: number;
  path: string;
}

/**
 * Service for tracking file events and updating workspaces accordingly
 */
export class FileEventManager {
  // Track current active sessions for memory trace recording
  private activeSessions: Record<string, string> = {}; // workspaceId -> sessionId
  
  // Service references
  private memoryService: MemoryService;
  private workspaceService: WorkspaceService;
  private eventManager: EventManager;
  
  // Event handlers
  private fileCreatedHandler: (file: TAbstractFile) => void;
  private fileModifiedHandler: (file: TAbstractFile) => void;
  private fileDeletedHandler: (file: TAbstractFile) => void;
  private sessionCreateHandler: (data: any) => void;
  private sessionEndHandler: (data: any) => void;
  
  // For TypeScript compatibility with debounce
  private pendingEventsProcessor: () => Promise<void>;
  
  
  // File-workspace relationship cache
  private fileWorkspaceCache: Map<string, FileCacheItem> = new Map();
  private cacheExpiry = 30 * 60 * 1000; // 30 minutes
  
  // Cache for workspace roots for faster lookups
  private workspaceRoots: Map<string, { id: string, rootFolder: string }> = new Map();
  
  // Event queue for batch processing
  private pendingEvents: FileEvent[] = [];
  private isProcessingEvents = false;
  
  /**
   * Create a new FileEventManager
   * @param app Obsidian app instance
   * @param plugin Plugin instance
   * @param memoryService Memory service instance 
   * @param workspaceService Workspace service instance
   * @param eventManager Event manager instance
   */
  constructor(
    private app: App,
    _plugin: Plugin, // Remove private to fix unused warning
    memoryService: MemoryService,
    workspaceService: WorkspaceService,
    eventManager: EventManager
  ) {
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
    this.eventManager = eventManager;
    
    // Initialize the event handlers
    this.fileCreatedHandler = this.handleFileCreated.bind(this);
    this.fileModifiedHandler = this.handleFileModified.bind(this);
    this.fileDeletedHandler = this.handleFileDeleted.bind(this);
    this.sessionCreateHandler = this.handleSessionCreate.bind(this);
    this.sessionEndHandler = this.handleSessionEnd.bind(this);
    
    
    // Load workspace roots for faster lookups
    this.refreshWorkspaceRoots();
    
    // Original method implementation 
    this.pendingEventsProcessor = this.processPendingEvents.bind(this);
    
    // Create a debounced version of the processing function
    const debouncedProcess = debounce(() => {
      // Call the actual implementation directly
      this.pendingEventsProcessor();
      // Return void to satisfy the Promise<void> return type
      return Promise.resolve();
    }, 2000);
    
    // Override with debounced version
    this.processPendingEvents = async () => {
      await debouncedProcess();
      return Promise.resolve();
    };
  }
  
  /**
   * Initialize the file event manager
   * This sets up the event listeners and caches
   */
  async initialize(): Promise<void> {
    console.log("Initializing FileEventManager");
    
    // Register event listeners
    this.registerEventListeners();
    
    // Load active sessions for memory trace recording
    await this.refreshActiveSessions();
    
    console.log("FileEventManager initialized");
  }
  
  /**
   * Unload the file event manager
   * This cleans up event listeners and caches
   */
  unload(): void {
    // Unregister event listeners
    this.unregisterEventListeners();
    
    // Clear caches
    this.fileWorkspaceCache.clear();
    this.workspaceRoots.clear();
    this.activeSessions = {};
    
    // Process any remaining events
    if (this.pendingEvents.length > 0) {
      this.processPendingEvents();
    }
  }
  
  /**
   * Register event listeners for file events
   */
  private registerEventListeners(): void {
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.on('create', this.fileCreatedHandler);
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.on('modify', this.fileModifiedHandler);
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.on('delete', this.fileDeletedHandler);
    
    // Subscribe to session events to update active sessions
    this.eventManager.on('session:create', this.sessionCreateHandler);
    this.eventManager.on('session:end', this.sessionEndHandler);
  }
  
  /**
   * Unregister event listeners for file events
   */
  private unregisterEventListeners(): void {
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.off('create', this.fileCreatedHandler);
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.off('modify', this.fileModifiedHandler);
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.off('delete', this.fileDeletedHandler);
    
    // Unsubscribe from session events
    this.eventManager.off('session:create', this.sessionCreateHandler);
    this.eventManager.off('session:end', this.sessionEndHandler);
  }
  
  /**
   * Handle session creation event
   * @param data Session data
   */
  private handleSessionCreate(data: { id: string; workspaceId: string }): void {
    this.activeSessions[data.workspaceId] = data.id;
  }
  
  /**
   * Handle session end event
   * @param data Session data
   */
  private handleSessionEnd(data: { id: string; workspaceId: string }): void {
    // Only remove if this is the current active session
    if (this.activeSessions[data.workspaceId] === data.id) {
      delete this.activeSessions[data.workspaceId];
    }
  }
  
  /**
   * Refresh the list of active sessions from the memory service
   */
  private async refreshActiveSessions(): Promise<void> {
    try {
      const activeSessions = await this.memoryService.getActiveSessions();
      
      // Reset the active sessions map
      this.activeSessions = {};
      
      // Populate the map with active sessions
      for (const session of activeSessions) {
        this.activeSessions[session.workspaceId] = session.id;
      }
    } catch (error) {
      console.error("Error refreshing active sessions:", error);
    }
  }
  
  /**
   * Refresh the cache of workspace roots for faster lookups
   */
  private async refreshWorkspaceRoots(): Promise<void> {
    try {
      console.log(`[FileEventManager] Refreshing workspace roots cache`);
      
      // Clear the current cache
      this.workspaceRoots.clear();
      
      // Get all workspaces
      const workspaces = await this.workspaceService.getWorkspaces();
      console.log(`[FileEventManager] Found ${workspaces.length} total workspaces`);
      
      // Populate the cache
      for (const workspace of workspaces) {
        if (workspace.rootFolder) {
          console.log(`[FileEventManager] Adding workspace to cache: id=${workspace.id}, name=${workspace.name}, rootFolder=${workspace.rootFolder}`);
          this.workspaceRoots.set(workspace.id, {
            id: workspace.id,
            rootFolder: workspace.rootFolder
          });
        } else {
          console.warn(`[FileEventManager] Workspace ${workspace.id} has no rootFolder, skipping`);
        }
      }
      
      console.log(`[FileEventManager] Loaded ${this.workspaceRoots.size} workspace roots for file tracking`);
    } catch (error) {
      console.error("[FileEventManager] Error refreshing workspace roots:", error);
    }
  }
  
  /**
   * Handle file creation event
   * @param file The created file
   */
  private handleFileCreated(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === 'md') {
      this.queueFileEvent({
        path: file.path,
        type: 'create',
        timestamp: Date.now(),
        workspaceIds: []
      });
    }
  }
  
  /**
   * Handle file modification event
   * @param file The modified file
   */
  private handleFileModified(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === 'md') {
      this.queueFileEvent({
        path: file.path,
        type: 'modify',
        timestamp: Date.now(),
        workspaceIds: []
      });
    }
  }
  
  /**
   * Handle file deletion event
   * @param file The deleted file
   */
  private handleFileDeleted(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === 'md') {
      // For deleted files, we need to use the cached workspace IDs
      // since we can't determine them after deletion
      const cachedItem = this.fileWorkspaceCache.get(file.path);
      const workspaceIds = cachedItem ? cachedItem.workspaceIds : [];
      
      this.queueFileEvent({
        path: file.path,
        type: 'delete',
        timestamp: Date.now(),
        workspaceIds: workspaceIds
      });
      
      // Remove from cache
      this.fileWorkspaceCache.delete(file.path);
    }
  }
  
  /**
   * Queue a file event for processing
   * @param event The file event to queue
   */
  private queueFileEvent(event: FileEvent): void {
    this.pendingEvents.push(event);
    this.processPendingEvents();
  }
  
  /**
   * Process pending file events
   * This is debounced to avoid processing too many events at once
   */
  private async processPendingEvents(): Promise<void> {
    if (this.isProcessingEvents || this.pendingEvents.length === 0) {
      return Promise.resolve();
    }
    
    this.isProcessingEvents = true;
    
    try {
      console.log(`Processing ${this.pendingEvents.length} pending file events`);
      
      // Capture events to process in this batch
      const events = [...this.pendingEvents];
      this.pendingEvents = [];
      
      // Process each event
      for (const event of events) {
        await this.processFileEvent(event);
      }
    } catch (error) {
      console.error("Error processing file events:", error);
    } finally {
      this.isProcessingEvents = false;
      
      // If new events were added during processing, schedule another run
      if (this.pendingEvents.length > 0) {
        // Call the processor directly to avoid circular reference
        setTimeout(() => this.pendingEventsProcessor(), 0);
      }
    }
    
    return Promise.resolve();
  }
  
  /**
   * Process a single file event
   * @param event The file event to process
   */
  private async processFileEvent(event: FileEvent): Promise<void> {
    try {
      console.log(`[FileEventManager] Processing ${event.type} event for ${event.path}`);
      
      // Determine which workspaces this file belongs to
      const workspaceIds = await this.findWorkspacesForFile(event.path);
      console.log(`[FileEventManager] File ${event.path} belongs to ${workspaceIds.length} workspaces:`, workspaceIds);
      
      // Store in cache for future lookups
      this.fileWorkspaceCache.set(event.path, {
        workspaceIds,
        timestamp: Date.now(),
        path: event.path
      });
      
      // Update event with workspace IDs
      event.workspaceIds = workspaceIds;
      
      // No workspaces found, skip further processing
      if (workspaceIds.length === 0) {
        console.log(`[FileEventManager] No workspaces found for ${event.path}, skipping activity recording`);
        return;
      }
      
      // For each workspace, record the activity
      for (const workspaceId of workspaceIds) {
        console.log(`[FileEventManager] Recording ${event.type} activity for workspace ${workspaceId}`);
        await this.recordWorkspaceActivity(workspaceId, event);
      }
      
      // Emit an event for other components to react to
      this.eventManager.emit('file:activity', {
        path: event.path,
        type: event.type,
        workspaceIds: event.workspaceIds,
        timestamp: event.timestamp
      });
      console.log(`[FileEventManager] Emitted file:activity event for ${event.path}`);
    } catch (error) {
      console.error(`[FileEventManager] Error processing file event for ${event.path}:`, error);
    }
  }
  
  /**
   * Find workspaces that a file belongs to
   * @param filePath The file path to check
   * @returns Array of workspace IDs
   */
  private async findWorkspacesForFile(filePath: string): Promise<string[]> {
    console.log(`[FileEventManager] Finding workspaces for file: ${filePath}`);
    
    // Check cache first
    const cachedItem = this.fileWorkspaceCache.get(filePath);
    if (cachedItem && Date.now() - cachedItem.timestamp < this.cacheExpiry) {
      console.log(`[FileEventManager] Using cached workspace IDs for ${filePath}:`, cachedItem.workspaceIds);
      return cachedItem.workspaceIds;
    }
    
    // If cache is empty or stale, rebuild the workspace roots cache
    if (this.workspaceRoots.size === 0) {
      console.log(`[FileEventManager] Workspace roots cache is empty, refreshing...`);
      await this.refreshWorkspaceRoots();
    }
    
    console.log(`[FileEventManager] Workspace roots cache has ${this.workspaceRoots.size} entries`);
    
    const result: string[] = [];
    
    // Find all workspaces that contain this file based on rootFolder
    for (const [id, workspace] of this.workspaceRoots.entries()) {
      console.log(`[FileEventManager] Checking if ${filePath} is in workspace ${id} with root folder ${workspace.rootFolder}`);
      
      // Normalize both paths to ensure consistent comparison using our utility
      // Don't preserve leading slashes for consistent matching
      const normalizedFilePath = sanitizePath(filePath, false);
      const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
      
      // Make sure the root folder ends with a slash for exact directory matching
      const rootFolderWithSlash = normalizedRootFolder.endsWith('/') 
        ? normalizedRootFolder 
        : normalizedRootFolder + '/';
      
      console.log(`[FileEventManager] Normalized paths - file: ${normalizedFilePath}, root: ${normalizedRootFolder}, matching with: ${rootFolderWithSlash}`);
      
      // Check if the file is in this workspace's root folder
      // Either an exact match or the file path starts with the root folder followed by a slash
      if (normalizedFilePath === normalizedRootFolder || 
          normalizedFilePath.startsWith(rootFolderWithSlash)) {
        console.log(`[FileEventManager] Match found: ${filePath} is in workspace ${id}`);
        result.push(id);
      }
    }
    
    console.log(`[FileEventManager] Found ${result.length} workspaces for file ${filePath}:`, result);
    return result;
  }
  
  /**
   * Record a file activity in a workspace's history
   * @param workspaceId Workspace ID
   * @param event File event
   */
  private async recordWorkspaceActivity(workspaceId: string, event: FileEvent): Promise<void> {
    try {
      // Map event type to action, ensuring it matches allowed action types
      const action = event.type === 'create' ? 'create' :
                     event.type === 'modify' ? 'edit' :
                     'view'; // Use 'view' instead of 'delete' for delete events as a workaround
      
      console.log(`[FileEventManager] Recording activity for workspace ${workspaceId}: action=${action}, file=${event.path}`);
      
      try {
        // Record in workspace activity history
        await this.workspaceService.recordActivity(workspaceId, {
          action, 
          timestamp: event.timestamp,
          hierarchyPath: [event.path],
          toolName: 'fileEventManager'
        });
        console.log(`[FileEventManager] Successfully recorded activity in workspace ${workspaceId}`);
      } catch (activityError) {
        console.error(`[FileEventManager] Failed to record activity in workspace ${workspaceId}:`, activityError);
      }
      
      // Record memory trace if there's an active session for this workspace
      const sessionId = this.activeSessions[workspaceId];
      if (sessionId) {
        console.log(`[FileEventManager] Found active session ${sessionId} for workspace ${workspaceId}, recording memory trace`);
        try {
          await this.recordMemoryTrace(workspaceId, sessionId, event);
          console.log(`[FileEventManager] Successfully recorded memory trace for session ${sessionId}`);
        } catch (traceError) {
          console.error(`[FileEventManager] Failed to record memory trace for session ${sessionId}:`, traceError);
        }
      } else {
        console.log(`[FileEventManager] No active session found for workspace ${workspaceId}, skipping memory trace recording`);
      }
    } catch (error) {
      console.error(`[FileEventManager] Error recording workspace activity for ${workspaceId}:`, error);
      // Don't throw - continue processing other workspaces
    }
  }
  
  /**
   * Record a memory trace for a file event
   * @param workspaceId Workspace ID
   * @param sessionId Session ID
   * @param event File event
   */
  private async recordMemoryTrace(workspaceId: string, sessionId: string, event: FileEvent): Promise<void> {
    try {
      // Create content based on event type
      const actionText = event.type === 'create' ? 'Created' :
                         event.type === 'modify' ? 'Modified' :
                         'Deleted';
      
      const content = `${actionText} file: ${event.path}`;
      
      // Get file content if available (for create and modify events)
      let fileContent: string | undefined;
      if (event.type !== 'delete') {
        try {
          const file = this.app.vault.getAbstractFileByPath(event.path);
          if (file instanceof TFile) {
            fileContent = await this.app.vault.read(file);
            // Truncate content to avoid huge traces
            if (fileContent.length > 500) {
              fileContent = fileContent.substring(0, 500) + '...';
            }
          }
        } catch (err) {
          // Ignore errors reading file content
          console.warn(`Could not read content for ${event.path}:`, err);
        }
      }
      
      // Map to valid activity types and context levels
      const activityType = event.type === 'create' || event.type === 'modify' ? 'research' : 'research';
      const contextLevel: HierarchyType = 'workspace'; // Use workspace as the context level
      
      // Store the memory trace
      await this.memoryService.storeMemoryTrace({
        workspaceId,
        workspacePath: [workspaceId], // Simplified path
        contextLevel,
        activityType,
        content: fileContent 
          ? `${content}\n\nContent preview:\n${fileContent}`
          : content,
        metadata: {
          tool: 'FileEventManager',
          params: { path: event.path },
          result: { success: true },
          relatedFiles: [event.path]
        },
        sessionId,
        timestamp: event.timestamp,
        importance: event.type === 'create' ? 0.8 : 0.6, // Create events are more important
        tags: ['file', event.type]
      });
    } catch (error) {
      console.error(`Error recording memory trace for ${event.path}:`, error);
      // Don't throw - this is a non-critical operation
    }
  }
  
  /**
   * Manually update a file's activity in its associated workspaces
   * @param filePath File path
   * @param action Action type ('view', 'edit', 'create', 'delete')
   * @returns Promise resolving to the workspaces that were updated
   */
  async updateFileActivity(
    filePath: string,
    action: 'view' | 'edit' | 'create'
  ): Promise<string[]> {
    // Find workspaces for this file
    const workspaceIds = await this.findWorkspacesForFile(filePath);
    
    if (workspaceIds.length === 0) {
      return [];
    }
    
    const timestamp = Date.now();
    
    // Record activity in each workspace
    for (const workspaceId of workspaceIds) {
      await this.workspaceService.recordActivity(workspaceId, {
        action, // Valid actions: 'view', 'edit', 'create', 'tool'
        timestamp,
        hierarchyPath: [filePath],
        toolName: 'fileEventManager'
      });
    }
    
    // Update cache
    this.fileWorkspaceCache.set(filePath, {
      workspaceIds,
      timestamp,
      path: filePath
    });
    
    return workspaceIds;
  }
  
  /**
   * Get the workspaces that a file belongs to
   * @param filePath File path
   * @returns Promise resolving to workspace IDs
   */
  async getWorkspacesForFile(filePath: string): Promise<string[]> {
    return this.findWorkspacesForFile(filePath);
  }
  
  /**
   * Get detailed information about a file's relationship to workspaces
   * @param filePath File path
   * @returns Promise resolving to workspace details
   */
  async getFileWorkspaceDetails(filePath: string): Promise<Array<{
    id: string;
    name: string;
    rootFolder: string;
    path: string[];
  }>> {
    const workspaceIds = await this.findWorkspacesForFile(filePath);
    
    if (workspaceIds.length === 0) {
      return [];
    }
    
    // Get full workspace details
    const workspaces: Array<{
      id: string;
      name: string;
      rootFolder: string;
      path: string[];
    }> = [];
    
    for (const id of workspaceIds) {
      const workspace = await this.workspaceService.getWorkspace(id);
      if (workspace) {
        workspaces.push({
          id: workspace.id,
          name: workspace.name,
          rootFolder: workspace.rootFolder,
          path: workspace.path || []
        });
      }
    }
    
    return workspaces;
  }
  
  /**
   * Purge expired items from the file cache
   */
  purgeExpiredCache(): void {
    const now = Date.now();
    const expiredPaths: string[] = [];
    
    for (const [path, item] of this.fileWorkspaceCache.entries()) {
      if (now - item.timestamp > this.cacheExpiry) {
        expiredPaths.push(path);
      }
    }
    
    // Remove expired items
    for (const path of expiredPaths) {
      this.fileWorkspaceCache.delete(path);
    }
    
    console.log(`Purged ${expiredPaths.length} expired items from file-workspace cache`);
  }
}