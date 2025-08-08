/**
 * LoadWorkspaceMode - Robust workspace loading with comprehensive service integration and error handling
 */

import { BaseMode } from '../../../baseMode';
import { LoadWorkspaceParameters, LoadWorkspaceResult } from '../../../../database/types/workspace/ParameterTypes';
import { WorkspaceService } from "../../services/WorkspaceService";
import { App } from 'obsidian';
import { createServiceIntegration } from '../../utils/ServiceIntegration';
import { memoryManagerErrorHandler, createMemoryManagerError } from '../../utils/ErrorHandling';

/**
 * Robust workspace loading with comprehensive service integration, error handling, and performance monitoring
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;

  constructor(app: App) {
    super(
      'loadWorkspace',
      'Load Workspace',
      'Load a workspace and return actionable context',
      '2.0.0'
    );
    
    this.app = app;
    this.serviceIntegration = createServiceIntegration(app, {
      logLevel: 'warn',
      maxRetries: 2,
      fallbackBehavior: 'warn'
    });
  }

  /**
   * Execute workspace loading with robust service integration and comprehensive error handling
   */
  async execute(params: LoadWorkspaceParameters): Promise<LoadWorkspaceResult> {
    const startTime = Date.now();
    
    try {
      // Validate required parameters
      if (!params.id) {
        const error = memoryManagerErrorHandler.handleValidationError(
          'Load Workspace',
          'loadWorkspace',
          'id',
          params.id,
          'Workspace ID is required to load a workspace'
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      // Get workspace service with comprehensive error handling
      const serviceResult = await this.serviceIntegration.getWorkspaceService();
      if (!serviceResult.success || !serviceResult.service) {
        const error = memoryManagerErrorHandler.handleServiceUnavailable(
          'Load Workspace',
          'loadWorkspace',
          'WorkspaceService',
          serviceResult.error,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      const workspaceService = serviceResult.service;
      
      // Get the workspace with error handling
      let workspace;
      try {
        workspace = await workspaceService.getWorkspace(params.id);
        if (!workspace) {
          const error = memoryManagerErrorHandler.handleNotFound(
            'Load Workspace',
            'loadWorkspace',
            'Workspace',
            params.id,
            params
          );
          return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
        }
        console.log(`[LoadWorkspaceMode] Workspace ${params.id} loaded successfully`);
      } catch (loadError) {
        console.error('[LoadWorkspaceMode] Failed to load workspace:', loadError);
        const error = memoryManagerErrorHandler.handleUnexpected(
          'Load Workspace',
          'loadWorkspace',
          loadError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      // If it's a new workspace with our context structure, return enhanced briefing
      if (workspace.context) {
        const context = workspace.context;
        
        // Build actionable briefing
        const briefing = `${context.purpose}. Current goal: ${context.currentGoal}. Status: ${context.status}`;
        
        // Get all workflows
        const workflows = context.workflows.length > 0 ? context.workflows : [];
        
        // Extract key files into flat structure
        const keyFiles: Record<string, string> = {};
        context.keyFiles.forEach((category: any) => {
          Object.assign(keyFiles, category.files);
        });
        
        // Join preferences into readable string (handle empty array)
        const preferences = context.preferences.length > 0 ? context.preferences.join(', ') : 'No preferences set yet';
        
        // Get current directory structure
        const directoryStructure = await this.getDirectoryStructure(workspace.rootFolder);
        
        // Get recent files within workspace scope
        const recentFiles = await this.getRecentFilesInWorkspace(workspace.rootFolder);
        
        // Generate validation prompt based on workspace state
        const validationPrompt = this.generateValidationPrompt(context, directoryStructure);
        
        const result = this.prepareResult(true, {
          purpose: context.purpose,
          currentGoal: context.currentGoal,
          status: context.status,
          context: briefing,
          workflows: workflows,
          keyFiles: keyFiles,
          preferences: preferences,
          agents: context.agents || [],
          nextActions: context.nextActions,
          directoryStructure: directoryStructure,
          recentFiles: recentFiles,
          validationPrompt: validationPrompt,
          performance: {
            totalDuration: Date.now() - startTime,
            serviceAccessTime: serviceResult.diagnostics?.duration || 0,
            workspaceLoadTime: Date.now() - startTime, // Approximation
            directoryStructureTime: 0 // Could be measured
          }
        }, undefined, `Workspace ${params.id} loaded successfully`, this.getInheritedWorkspaceContext(params) || undefined);
        
        console.log(`[LoadWorkspaceMode] Workspace loaded successfully in ${Date.now() - startTime}ms`);
        return result;
      }
      
      // For legacy workspaces, return basic information
      const legacyBriefing = workspace.description || `Workspace: ${workspace.name}`;
      
      // Get directory structure for legacy workspaces too
      const directoryStructure = await this.getDirectoryStructure(workspace.rootFolder);
      
      // Get recent files for legacy workspaces too
      const recentFiles = await this.getRecentFilesInWorkspace(workspace.rootFolder);
      
      const result = this.prepareResult(true, {
        purpose: workspace.description || `Workspace: ${workspace.name}`,
        currentGoal: 'Define workspace goals and structure',
        status: 'Legacy workspace - needs structured context',
        context: legacyBriefing,
        workflows: [],
        keyFiles: {},
        preferences: 'No preferences defined',
        agents: [],
        nextActions: ['Set up workspace with structured context'],
        directoryStructure: directoryStructure,
        recentFiles: recentFiles,
        validationPrompt: 'This appears to be a legacy workspace. Would you like to upgrade it with structured context (purpose, workflows, keyFiles)?',
        performance: {
          totalDuration: Date.now() - startTime,
          serviceAccessTime: serviceResult.diagnostics?.duration || 0,
          workspaceLoadTime: Date.now() - startTime, // Approximation
          directoryStructureTime: 0 // Could be measured
        }
      }, undefined, `Legacy workspace ${params.id} loaded successfully`, this.getInheritedWorkspaceContext(params) || undefined);
      
      console.log(`[LoadWorkspaceMode] Legacy workspace loaded successfully in ${Date.now() - startTime}ms`);
      return result;
      
    } catch (error) {
      console.error(`[LoadWorkspaceMode] Unexpected error after ${Date.now() - startTime}ms:`, error);
      return createMemoryManagerError<LoadWorkspaceResult>(
        'Load Workspace',
        'loadWorkspace',
        error,
        params.workspaceContext,
        params
      );
    }
  }

  /**
   * Get directory structure for workspace folder
   */
  private async getDirectoryStructure(rootFolder: string): Promise<Record<string, any>> {
    try {
      const folder = this.app.vault.getAbstractFileByPath(rootFolder);
      if (!folder || !('children' in folder)) {
        return { [rootFolder]: 'Folder not found or empty' };
      }

      const buildStructure = (folderItem: any): Record<string, any> => {
        const structure: Record<string, any> = {};
        
        if ('children' in folderItem && Array.isArray(folderItem.children)) {
          for (const child of folderItem.children) {
            if ('children' in child) {
              // It's a folder
              structure[child.name + '/'] = buildStructure(child);
            } else {
              // It's a file
              structure[child.name] = 'file';
            }
          }
        }
        
        return structure;
      };

      return { [rootFolder + '/']: buildStructure(folder) };
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Error scanning directory structure:', error);
      return { [rootFolder]: 'Error scanning directory' };
    }
  }

  /**
   * Get recent files within workspace scope
   */
  private async getRecentFilesInWorkspace(rootFolder: string): Promise<Array<{path: string; lastModified: number; lastOpened?: number}>> {
    try {
      const recentFiles: Array<{path: string; lastModified: number; lastOpened?: number}> = [];
      
      // Get all files in workspace folder (recursively)
      const workspaceFiles = await this.getAllFilesInFolder(rootFolder);
      
      // Filter to .md files and get their modification times
      const markdownFiles = workspaceFiles.filter(file => file.endsWith('.md'));
      
      for (const filePath of markdownFiles) {
        try {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file && 'stat' in file && file.stat) {
            const lastModified = (file.stat as any).mtime;
            
            // Get last opened time if available (from Obsidian's recent files)
            let lastOpened: number | undefined;
            try {
              // Check if file is in recent files list (app.workspace.recentFileTracker if available)
              const recentFileTracker = (this.app.workspace as any).recentFileTracker;
              if (recentFileTracker && recentFileTracker.recentFiles) {
                const recentFile = recentFileTracker.recentFiles.find((rf: any) => rf.path === filePath);
                if (recentFile && recentFile.timestamp) {
                  lastOpened = recentFile.timestamp;
                }
              }
            } catch (error) {
              // Ignore errors accessing recent file tracker
            }
            
            recentFiles.push({
              path: filePath,
              lastModified,
              lastOpened
            });
          }
        } catch (error) {
          // Skip files that can't be accessed
          continue;
        }
      }
      
      // Sort by most recent activity (opened time if available, otherwise modified time)
      recentFiles.sort((a, b) => {
        const aTime = a.lastOpened || a.lastModified;
        const bTime = b.lastOpened || b.lastModified;
        return bTime - aTime;
      });
      
      // Return top 10 most recent files
      return recentFiles.slice(0, 10);
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Error getting recent files:', error);
      return [];
    }
  }

  /**
   * Get all files in a folder recursively
   */
  private async getAllFilesInFolder(folderPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const processFolder = (folder: any) => {
      if ('children' in folder && Array.isArray(folder.children)) {
        for (const child of folder.children) {
          if ('children' in child) {
            // It's a folder, recurse
            processFolder(child);
          } else {
            // It's a file
            files.push(child.path);
          }
        }
      }
    };
    
    try {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (folder && 'children' in folder) {
        processFolder(folder);
      }
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Error accessing folder:', folderPath, error);
    }
    
    return files;
  }

  /**
   * Generate validation prompt based on workspace context and directory structure
   */
  private generateValidationPrompt(context: any, directoryStructure: Record<string, any>): string {
    const prompts: string[] = [];
    
    // Check if keyFiles match actual directory structure
    const flattenedFiles = this.flattenDirectoryStructure(directoryStructure);
    const trackedFiles = new Set<string>();
    context.keyFiles.forEach((category: any) => {
      Object.values(category.files).forEach((filePath: any) => trackedFiles.add(filePath));
    });
    
    const untrackedFiles = flattenedFiles.filter(file => !trackedFiles.has(file) && file.endsWith('.md'));
    
    if (untrackedFiles.length > 0) {
      prompts.push(`Found ${untrackedFiles.length} untracked .md files. Update keyFiles?`);
    }
    
    if (context.preferences.length === 0) {
      prompts.push('Add user preferences based on workspace patterns?');
    }
    
    if (context.agents.length === 0) {
      prompts.push('Associate any agents with this workspace?');
    }
    
    if (context.status === 'Starting workspace setup') {
      prompts.push('Update workspace status based on current progress?');
    }
    
    return prompts.length > 0 
      ? `Based on this workspace: ${prompts.join(' ')}`
      : 'Workspace looks well-organized. Any updates needed?';
  }

  /**
   * Flatten directory structure to get list of all file paths
   */
  private flattenDirectoryStructure(structure: Record<string, any>, basePath: string = ''): string[] {
    const files: string[] = [];
    
    for (const [name, value] of Object.entries(structure)) {
      const fullPath = basePath ? `${basePath}/${name}` : name;
      
      if (typeof value === 'object' && value !== null) {
        // It's a directory, recurse
        files.push(...this.flattenDirectoryStructure(value, fullPath.replace('/', '')));
      } else if (value === 'file') {
        // It's a file
        files.push(fullPath.replace(/\/$/, ''));
      }
    }
    
    return files;
  }

  /**
   * Get parameter schema for MCP
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workspace ID to load'
        },
        // Legacy fields for backward compatibility
        includeChildren: {
          type: 'boolean',
          description: 'Include child workspaces in the result',
          default: false
        },
        includeFileDetails: {
          type: 'boolean',
          description: 'Include detailed file information',
          default: true
        },
        includeDirectoryStructure: {
          type: 'boolean',
          description: 'Include directory structure',
          default: true
        },
        includeSessionContext: {
          type: 'boolean',
          description: 'Include session and state context',
          default: true
        }
      },
      required: ['id']
    };
  }

  /**
   * Get result schema for MCP
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              description: 'Workspace purpose/goal'
            },
            currentGoal: {
              type: 'string',
              description: 'Current specific goal'
            },
            status: {
              type: 'string',
              description: 'Current workspace status'
            },
            context: {
              type: 'string',  
              description: 'Actionable workspace briefing'
            },
            workflows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  when: { type: 'string' },
                  steps: { type: 'array', items: { type: 'string' } }
                }
              },
              description: 'All workflows defined for this workspace'
            },
            keyFiles: {
              type: 'object',
              description: 'Important files as key-value pairs'
            },
            preferences: {
              type: 'string',
              description: 'User preferences for this workspace'
            },
            agents: {
              type: 'array',
              items: { type: 'object' },
              description: 'Associated agents'
            },
            nextActions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recommended next actions'
            },
            directoryStructure: {
              type: 'object',
              description: 'Current directory structure of workspace folder'
            },
            recentFiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path relative to vault' },
                  lastModified: { type: 'number', description: 'Last modification timestamp' },
                  lastOpened: { type: 'number', description: 'Last opened timestamp (optional)' }
                }
              },
              description: 'Recently modified/opened files within workspace (max 10)'
            },
            validationPrompt: {
              type: 'string',
              description: 'Suggestions for workspace updates or validation'
            }
          },
          required: ['purpose', 'currentGoal', 'status', 'context', 'workflows', 'keyFiles', 'preferences', 'agents', 'nextActions', 'directoryStructure', 'recentFiles', 'validationPrompt']
        },
        error: { type: 'string' }
      },
      required: ['success']
    };
  }
}