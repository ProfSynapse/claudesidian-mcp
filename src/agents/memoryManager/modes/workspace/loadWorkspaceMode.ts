import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { 
  LoadWorkspaceParameters, 
  LoadWorkspaceResult
} from '../../../../database/workspace-types';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { MemoryService } from '../../../../database/services/MemoryService';
import { ClaudesidianPlugin } from '../utils/pluginTypes';
import { MetadataSearchService } from '../../../../database/services/MetadataSearchService';
import { sanitizePath } from '../../../../utils/pathUtils';
import { CacheManager } from '../../../../database/services/CacheManager';
import { DirectoryTreeBuilder, DirectoryTreeUtils } from '../../../../utils/directoryTreeUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';

/**
 * Mode to load a workspace as the active context
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private app: App;
  private plugin: Plugin;
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;
  private cacheManager: CacheManager | null = null;
  private metadataSearchService: MetadataSearchService;
  private directoryTreeBuilder: DirectoryTreeBuilder;
  
  /**
   * Create a new LoadWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'loadWorkspace',
      'Load Workspace',
      'Load a workspace as the active context',
      '1.0.0'
    );
    this.app = app;
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    this.metadataSearchService = new MetadataSearchService(app);
    this.directoryTreeBuilder = new DirectoryTreeBuilder(app);
    
    // Safely access the plugin services
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services) {
        if (pluginWithServices.services.workspaceService) {
          this.workspaceService = pluginWithServices.services.workspaceService;
        }
        if (pluginWithServices.services.memoryService) {
          this.memoryService = pluginWithServices.services.memoryService;
        }
        if (pluginWithServices.services.cacheManager) {
          this.cacheManager = pluginWithServices.services.cacheManager;
        }
      }
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: LoadWorkspaceParameters): Promise<LoadWorkspaceResult> {
    try {
      // Check if workspace service is available
      if (!this.workspaceService) {
        return this.prepareResult(false, undefined, 'Workspace service not available');
      }
      
      // Validate parameters
      if (!params.id) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      // Try to preload the workspace into cache
      if (this.cacheManager) {
        try {
          await this.cacheManager.preloadWorkspace(params.id);
        } catch (error) {
          console.warn('Failed to preload workspace into cache:', error);
        }
      }
      
      // Get the target workspace
      let workspace = await this.workspaceService.getWorkspace(params.id);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${params.id} not found`
        );
      }
      
      // If specificPhaseId is provided, navigate to that node
      if (params.specificPhaseId) {
        const specificPhase = await this.workspaceService.getWorkspace(params.specificPhaseId);
        if (!specificPhase) {
          return this.prepareResult(
            false, 
            undefined, 
            `Specific phase/task with ID ${params.specificPhaseId} not found`
          );
        }
        
        // Verify it's part of this workspace
        const rootId = specificPhase.path[0] || specificPhase.id;
        if (rootId !== params.id) {
          return this.prepareResult(
            false, 
            undefined, 
            `Specific phase/task with ID ${params.specificPhaseId} is not part of workspace ${params.id}`
          );
        }
        
        workspace = specificPhase;
      }
      
      // Update the last accessed timestamp
      await this.workspaceService.updateLastAccessed(workspace.id);
      
      // Context depth is handled elsewhere in the implementation
      // params.contextDepth is accessed via the parameter schema
      
      // Get immediate children if requested
      let children: Array<{id: string; name: string; hierarchyType: string}> | undefined = undefined;
      if (params.includeChildren) {
        children = [];
        
        // Get all child workspaces in one call
        const childWorkspaces = await this.workspaceService.getWorkspaces({
          parentId: workspace.id
        });
        
        for (const child of childWorkspaces) {
          children.push({
            id: child.id,
            name: child.name,
            hierarchyType: child.hierarchyType
          });
        }
      }
      
      // Generate workspace summary
      const summary = await this.generateWorkspaceSummary(workspace);
      
      // Gather context based on contextDepth
      const contextDepth = params.contextDepth || 'standard';
      
      // Get key context items - adjust limits based on context depth
      const recentFilesLimit = params.recentFilesLimit || 5;
      const recentFiles = await this.getRecentFiles(workspace, recentFilesLimit);
      const keyFiles = await this.getKeyFiles(workspace);
      
      // Get persisted associated notes directly from workspace
      const associatedNotes = workspace.associatedNotes || [];
      
      // Get sessions and states if requested depth allows
      const sessions = contextDepth !== 'minimal' ? 
        await this.getWorkspaceSessions(workspace.id) : [];
      const states = contextDepth === 'comprehensive' ? 
        await this.getWorkspaceStates(workspace.id) : [];
      
      // Create workspace context
      const workspaceContext = {
        workspaceId: workspace.id,
        workspacePath: [...workspace.path, workspace.id],
        activeWorkspace: true
      };

      // Get or create default key file instructions
      const keyFileInstructions = workspace.keyFileInstructions || 
        "Key files can be designated in two ways:\n" +
        "1. Add 'key: true' to the file's YAML frontmatter\n" +
        "2. Use a standard filename like readme.md, index.md, summary.md, or moc.md";
      
      // Generate directory structure if requested
      let directoryStructure = undefined;
      if (params.includeDirectoryStructure !== false) { // Default to true
        try {
          console.log('[LoadWorkspaceMode] Generating directory structure for workspace:', workspace.id);
          directoryStructure = await this.generateDirectoryStructure(workspace, params);
          console.log('[LoadWorkspaceMode] Directory structure generated successfully');
        } catch (error) {
          console.error('[LoadWorkspaceMode] Error generating directory structure:', error);
          // Continue without directory structure rather than failing
          directoryStructure = {
            rootTree: undefined,
            relatedTrees: undefined,
            stats: { totalFiles: 0, totalFolders: 0, keyFiles: 0, relatedFiles: 0, maxDepth: 0 },
            textView: `Error: ${(error as Error).message}`
          };
        }
      }
      
      // Prepare result
      return this.prepareResult(
        true,
        {
          workspace: {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            rootFolder: workspace.rootFolder,
            summary,
            hierarchyType: workspace.hierarchyType,
            path: workspace.path,
            keyFileInstructions,
            children
          },
          context: {
            recentFiles,
            keyFiles,
            relatedConcepts: [], // TODO: Implement concept extraction
            associatedNotes,
            sessions,
            states,
            directoryStructure
          }
        },
        undefined,
        extractContextFromParams(params),
        workspaceContext
      );
      
    } catch (error: any) {
      // Default key file instructions for error case
      const defaultKeyFileInstructions = 
        "Key files can be designated in two ways:\n" +
        "1. Add 'key: true' to the file's YAML frontmatter\n" +
        "2. Use a standard filename like readme.md, index.md, summary.md, or moc.md";
      
      return this.prepareResult(
        false,
        {
          workspace: undefined,
          context: {
            recentFiles: [],
            keyFiles: [],
            keyFileInstructions: defaultKeyFileInstructions,
            relatedConcepts: [],
            allFiles: [],
            associatedNotes: [],
            sessions: [],
            states: [],
            directoryStructure: undefined
          }
        },
        `Failed to load workspace: ${error.message}`
      );
    }
  }
  
  /**
   * Generate a summary of the workspace
   */
  private async generateWorkspaceSummary(workspace: {
    id: string;
    name: string;
    description?: string;
    rootFolder: string;
    hierarchyType: string;
    childWorkspaces: string[];
    status: string;
    activityHistory?: Array<{action: string; timestamp: number}>;
    path: string[];
  }): Promise<string> {
    // In a real implementation, this would analyze content and activity
    // to create a meaningful summary
    
    let summary = `${workspace.name}`;
    if (workspace.description) {
      summary += `: ${workspace.description}`;
    }
    
    // Add hierarchy information
    if (workspace.hierarchyType === 'workspace') {
      summary += ` (Main workspace with ${workspace.childWorkspaces.length} phases)`;
    } else if (workspace.hierarchyType === 'phase') {
      summary += ` (Phase with ${workspace.childWorkspaces.length} tasks)`;
    } else {
      summary += ` (Task)`;
    }
    
    // Add status
    summary += `. Status: ${workspace.status}.`;
    
    // Add activity summary
    const activities = workspace.activityHistory || [];
    if (activities.length > 0) {
      const lastActivity = activities[activities.length - 1];
      const lastDate = new Date(lastActivity.timestamp).toLocaleDateString();
      summary += ` Last activity: ${lastActivity.action} on ${lastDate}.`;
    }
    
    return summary;
  }
  
  /**
   * Get recent files for the workspace based on activity history and memory traces
   */
  private async getRecentFiles(workspace: {
    rootFolder: string;
    id: string;
  }, limit = 5): Promise<string[]> {
    // Try to use cached file index if available
    if (this.cacheManager) {
      const recentFiles = this.cacheManager.getRecentFiles(10, workspace.rootFolder);
      if (recentFiles.length > 0) {
        return recentFiles.map(f => f.path);
      }
    }
    const recentFiles: Array<{ path: string; timestamp: number }> = [];
    
    // 1. Get files from workspace activity history
    try {
      const fullWorkspace = await this.workspaceService?.getWorkspace(workspace.id);
      if (fullWorkspace && fullWorkspace.activityHistory) {
        for (const activity of fullWorkspace.activityHistory) {
          // Check for actions that reference files - using hierarchyPath for file paths
          if ((activity.action === 'edit' || activity.action === 'view' || activity.action === 'create') && 
              activity.hierarchyPath && activity.hierarchyPath.length > 0) {
            // Use the last element of hierarchyPath as the filePath (if it exists)
            const filePath = activity.hierarchyPath[activity.hierarchyPath.length - 1];
            if (filePath) {
              recentFiles.push({
                path: filePath,
                timestamp: activity.timestamp
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Error getting workspace activity history:', error);
    }
    
    // 2. Get files from memory traces
    if (this.memoryService) {
      try {
        const traces = await this.memoryService.getMemoryTraces(workspace.id, 20);
        
        for (const trace of traces) {
          if (trace.metadata && trace.metadata.relatedFiles) {
            for (const filePath of trace.metadata.relatedFiles) {
              if (filePath) {
                recentFiles.push({
                  path: filePath,
                  timestamp: trace.timestamp
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn('[LoadWorkspaceMode] Error getting memory traces:', error);
      }
    }
    
    // 3. Get files based on Obsidian's file stats
    
    // Normalize the workspace root folder path using our utility
    // Don't preserve leading slashes for consistent matching
    const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
      
    // Make sure the root folder ends with a slash for proper directory matching
    const rootFolderWithSlash = normalizedRootFolder.endsWith('/') ? 
      normalizedRootFolder : normalizedRootFolder + '/';
    
    const allFiles = this.app.vault.getMarkdownFiles()
      .filter(file => {
        // Normalize file path for consistent comparison using our utility
        const normalizedFilePath = sanitizePath(file.path, false);
        
        // Check if this file belongs to the workspace (exact match or in subfolder)
        return normalizedFilePath === normalizedRootFolder || 
               normalizedFilePath.startsWith(rootFolderWithSlash);
      });
    
    for (const file of allFiles) {
      const stat = file.stat;
      if (stat && stat.mtime) {
        // Add file with its modification time
        recentFiles.push({
          path: file.path,
          timestamp: stat.mtime
        });
      }
    }
    
    // Remove duplicates, keep most recent timestamp for each path
    const uniquePaths = new Map<string, number>();
    for (const file of recentFiles) {
      // If this path exists and has a newer timestamp, update it
      if (!uniquePaths.has(file.path) || uniquePaths.get(file.path)! < file.timestamp) {
        uniquePaths.set(file.path, file.timestamp);
      }
    }
    
    // Sort by timestamp, most recent first
    const result = Array.from(uniquePaths.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, limit);
    
    return result;
  }
  
  /**
   * Get key files for the workspace based on frontmatter and common file patterns
   */
  private async getKeyFiles(workspace: {
    rootFolder: string;
    id: string;
  }): Promise<string[]> {
    // Try to use cached file index if available
    if (this.cacheManager) {
      const keyFiles = this.cacheManager.getKeyFiles();
      const workspaceKeyFiles = keyFiles.filter((f: any) => 
        f.path.startsWith(workspace.rootFolder)
      );
      if (workspaceKeyFiles.length > 0) {
        return workspaceKeyFiles.map((f: any) => f.path);
      }
    }
    const keyFiles: string[] = [];
    
    try {
      // 1. Search for files with the "key: true" property
      const propertyFiles = await this.metadataSearchService.searchByProperty('key', 'true', {
        path: workspace.rootFolder,
        limit: 20
      });
      
      for (const file of propertyFiles) {
        keyFiles.push(file.path);
      }
      
      // 2. Add common key files by name pattern if in the workspace (case insensitive)
      const commonKeyFilePatterns = [
        /readme\.md$/i, 
        /index\.md$/i, 
        /summary\.md$/i, 
        /moc\.md$/i, 
        /map(?:\s|_|-)*of(?:\s|_|-)*contents\.md$/i
      ];
      
      // Normalize the workspace root folder path using our utility
      // Don't preserve leading slashes for consistent matching
      const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
      
      // Make sure the root folder ends with a slash for proper directory matching
      const rootFolderWithSlash = normalizedRootFolder.endsWith('/') ? 
        normalizedRootFolder : normalizedRootFolder + '/';
      
      const files = this.app.vault.getMarkdownFiles()
        .filter(file => {
          // Normalize file path for consistent comparison using our utility
          const normalizedFilePath = sanitizePath(file.path, false);
          
          // Check if this file belongs to the workspace (exact match or in subfolder)
          return normalizedFilePath === normalizedRootFolder || 
                 normalizedFilePath.startsWith(rootFolderWithSlash);
        });
        
      for (const file of files) {
        for (const pattern of commonKeyFilePatterns) {
          if (pattern.test(file.path) && !keyFiles.includes(file.path)) {
            keyFiles.push(file.path);
            break;
          }
        }
      }
    } catch (error) {
      console.warn('Error getting key files:', error);
    }
    
    return keyFiles;
  }
  
  
  /**
   * Get workspace sessions
   */
  private async getWorkspaceSessions(workspaceId: string): Promise<Array<{
    id: string;
    name: string;
    isActive: boolean;
    startTime: number;
    endTime?: number;
  }>> {
    const sessions: Array<{
      id: string;
      name: string;
      isActive: boolean;
      startTime: number;
      endTime?: number;
    }> = [];
    
    try {
      if (this.memoryService) {
        const workspaceSessions = await this.memoryService.getSessions(workspaceId);
        for (const session of workspaceSessions) {
          sessions.push({
            id: session.id,
            name: session.name || `Session ${new Date(session.startTime).toLocaleString()}`,
            isActive: session.isActive,
            startTime: session.startTime,
            endTime: session.endTime
          });
        }
      }
    } catch (error) {
      console.warn('Error getting workspace sessions:', error);
    }
    
    return sessions;
  }
  
  /**
   * Get workspace states/snapshots
   */
  private async getWorkspaceStates(workspaceId: string): Promise<Array<{
    id: string;
    name: string;
    timestamp: number;
  }>> {
    const states: Array<{
      id: string;
      name: string;
      timestamp: number;
    }> = [];
    
    try {
      if (this.memoryService) {
        const snapshots = await this.memoryService.getSnapshots(workspaceId);
        for (const snapshot of snapshots) {
          states.push({
            id: snapshot.id,
            name: snapshot.name,
            timestamp: snapshot.timestamp
          });
        }
      }
    } catch (error) {
      console.warn('Error getting workspace states:', error);
    }
    
    return states;
  }
  
  /**
   * Generate directory structure for the workspace
   */
  private async generateDirectoryStructure(workspace: {
    rootFolder: string;
    relatedFolders?: string[];
    relatedFiles?: string[];
  }, params: LoadWorkspaceParameters): Promise<any> {
    try {
      const maxDepth = params.directoryTreeMaxDepth || 0; // 0 = unlimited
      
      // Build the root directory tree
      const rootTree = await this.directoryTreeBuilder.buildTree(workspace.rootFolder, {
        maxDepth,
        includeMetadata: true,
        relatedFiles: workspace.relatedFiles || [],
        includeExtensions: ['md'] // Focus on markdown files for Obsidian
      });
      
      // Build trees for related folders
      const relatedTrees = [];
      if (workspace.relatedFolders && workspace.relatedFolders.length > 0) {
        for (const folderPath of workspace.relatedFolders) {
          const tree = await this.directoryTreeBuilder.buildTree(folderPath, {
            maxDepth,
            includeMetadata: true,
                relatedFiles: workspace.relatedFiles || [],
            includeExtensions: ['md']
          });
          if (tree) {
            relatedTrees.push(tree);
          }
        }
      }
      
      // Calculate statistics
      const totalStats = {
        totalFiles: 0,
        totalFolders: 0,
        relatedFiles: 0,
        maxDepth: 0
      };
      
      if (rootTree) {
        const rootStats = DirectoryTreeUtils.getTreeStats(rootTree);
        totalStats.totalFiles += rootStats.totalFiles;
        totalStats.totalFolders += rootStats.totalFolders;
        totalStats.relatedFiles += rootStats.relatedFiles;
        totalStats.maxDepth = Math.max(totalStats.maxDepth, rootStats.maxDepth);
      }
      
      for (const tree of relatedTrees) {
        const stats = DirectoryTreeUtils.getTreeStats(tree);
        totalStats.totalFiles += stats.totalFiles;
        totalStats.totalFolders += stats.totalFolders;
        totalStats.relatedFiles += stats.relatedFiles;
        totalStats.maxDepth = Math.max(totalStats.maxDepth, stats.maxDepth);
      }
      
      // Generate text representation
      let textView = '';
      if (rootTree) {
        textView += `📁 Root Folder: ${workspace.rootFolder}\n`;
        textView += DirectoryTreeUtils.treeToText(rootTree, '  ');
      }
      
      if (relatedTrees.length > 0) {
        textView += '\n📂 Related Folders:\n';
        for (const tree of relatedTrees) {
          textView += `\n📁 ${tree.path}\n`;
          textView += DirectoryTreeUtils.treeToText(tree, '  ');
        }
      }
      
      // Add related files that are not in any of the trees
      if (workspace.relatedFiles && workspace.relatedFiles.length > 0) {
        const filesInTrees = new Set<string>();
        
        // Collect all file paths from trees
        const collectFilePaths = (node: any) => {
          if (node.type === 'file') {
            filesInTrees.add(node.path);
          }
          if (node.children) {
            for (const child of node.children) {
              collectFilePaths(child);
            }
          }
        };
        
        if (rootTree) collectFilePaths(rootTree);
        for (const tree of relatedTrees) {
          collectFilePaths(tree);
        }
        
        // Find related files not in trees
        const isolatedFiles = workspace.relatedFiles.filter(filePath => 
          !filesInTrees.has(filePath)
        );
        
        if (isolatedFiles.length > 0) {
          textView += '\n🔗 Additional Related Files:\n';
          for (const filePath of isolatedFiles) {
            textView += `  📄 ${filePath}\n`;
          }
        }
      }
      
      return {
        rootTree,
        relatedTrees: relatedTrees.length > 0 ? relatedTrees : undefined,
        stats: totalStats,
        textView
      };
      
    } catch (error) {
      console.warn('Error generating directory structure:', error);
      return {
        rootTree: undefined,
        relatedTrees: undefined,
        stats: {
          totalFiles: 0,
          totalFolders: 0,
          keyFiles: 0,
          relatedFiles: 0,
          maxDepth: 0
        },
        textView: `Error generating directory structure: ${(error as Error).message}`
      };
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): Record<string, any> {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the workspace to load (REQUIRED)'
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'How much context to load'
        },
        includeChildren: {
          type: 'boolean',
          description: 'Whether to include child workspaces/phases/tasks'
        },
        specificPhaseId: {
          type: 'string',
          description: 'Load a specific phase/task instead of whole workspace'
        },
        includeDirectoryStructure: {
          type: 'boolean',
          description: 'Whether to include hierarchical directory structure (default: true)'
        },
        directoryTreeMaxDepth: {
          type: 'number',
          description: 'Maximum depth for directory tree traversal (0 = unlimited, default: 0)'
        },
        recentFilesLimit: {
          type: 'number',
          description: 'Maximum number of recent files to return (default: 5)'
        },
        ...commonSchema
      },
      required: ['id', 'sessionId', 'context']
    };
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): Record<string, any> {
    const baseSchema = super.getResultSchema();
    
    // Extend the base schema to include our specific data
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        workspace: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workspace ID' },
            name: { type: 'string', description: 'Workspace name' },
            description: { type: 'string', description: 'Workspace description' },
            rootFolder: { type: 'string', description: 'Root folder path' },
            summary: { type: 'string', description: 'Workspace summary' },
            hierarchyType: { 
              type: 'string', 
              enum: ['workspace', 'phase', 'task'],
              description: 'Hierarchy type of the workspace' 
            },
            keyFileInstructions: { 
              type: 'string', 
              description: 'Instructions for how to designate key files within this workspace' 
            },
            path: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Path from root workspace to this node' 
            },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Child ID' },
                  name: { type: 'string', description: 'Child name' },
                  hierarchyType: { 
                    type: 'string', 
                    enum: ['workspace', 'phase', 'task'],
                    description: 'Hierarchy type of the child' 
                  }
                }
              },
              description: 'Child workspaces/phases/tasks if requested'
            }
          }
        },
        context: {
          type: 'object',
          properties: {
            recentFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recently accessed files in the workspace, based on interaction history'
            },
            keyFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files marked with key: true in frontmatter or matching common patterns like readme.md'
            },
            relatedConcepts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related concepts and topics extracted from workspace content'
            },
            associatedNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'All notes associated with this workspace including files accessed during workspace sessions'
            },
            sessions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Session ID' },
                  name: { type: 'string', description: 'Session name' },
                  isActive: { type: 'boolean', description: 'Whether the session is active' },
                  startTime: { type: 'number', description: 'Session start timestamp' },
                  endTime: { type: 'number', description: 'Session end timestamp (if ended)' }
                }
              },
              description: 'Sessions associated with this workspace'
            },
            states: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'State ID' },
                  name: { type: 'string', description: 'State name' },
                  timestamp: { type: 'number', description: 'State creation timestamp' }
                }
              },
              description: 'Saved states associated with this workspace'
            },
            directoryStructure: {
              type: 'object',
              properties: {
                rootTree: {
                  type: 'object',
                  description: 'Hierarchical directory tree of the root folder'
                },
                relatedTrees: {
                  type: 'array',
                  items: { type: 'object' },
                  description: 'Directory trees for related folders'
                },
                stats: {
                  type: 'object',
                  properties: {
                    totalFiles: { type: 'number', description: 'Total number of files' },
                    totalFolders: { type: 'number', description: 'Total number of folders' },
                    keyFiles: { type: 'number', description: 'Number of key files' },
                    relatedFiles: { type: 'number', description: 'Number of related files' },
                    maxDepth: { type: 'number', description: 'Maximum depth of directory tree' }
                  },
                  description: 'Statistics about the directory structure'
                },
                textView: {
                  type: 'string',
                  description: 'Human-readable text representation of the directory tree'
                }
              },
              description: 'Complete directory structure information'
            }
          },
          required: ['recentFiles', 'keyFiles', 'relatedConcepts', 'associatedNotes', 'sessions', 'states']
        }
      }
    };
    
    return baseSchema;
  }
}