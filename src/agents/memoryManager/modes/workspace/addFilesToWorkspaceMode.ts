import { App, Plugin, TFile, TFolder } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { 
  AddFilesToWorkspaceParameters, 
  AddFilesToWorkspaceResult
} from '../../../../database/workspace-types';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { ClaudesidianPlugin } from '../utils/pluginTypes';
import { sanitizePath } from '../../../../utils/pathUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';

/**
 * Mode to add files to an existing workspace
 * Provides a simplified interface for adding individual files or entire folders
 */
export class AddFilesToWorkspaceMode extends BaseMode<AddFilesToWorkspaceParameters, AddFilesToWorkspaceResult> {
  private app: App;
  
  /**
   * Create a new AddFilesToWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'addFilesToWorkspace',
      'Add Files to Workspace',
      'Add individual files or folders to an existing workspace',
      '1.0.0'
    );
    this.app = app;
  }
  
  /**
   * Get workspace service asynchronously
   */
  private async getWorkspaceService(): Promise<WorkspaceService | null> {
    const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as ClaudesidianPlugin;
    if (!plugin) {
      return null;
    }
    
    try {
      return await plugin.getService<WorkspaceService>('workspaceService');
    } catch (error) {
      console.warn('[AddFilesToWorkspaceMode] Failed to get workspace service:', error);
      return null;
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: AddFilesToWorkspaceParameters): Promise<AddFilesToWorkspaceResult> {
    console.log('[AddFilesToWorkspaceMode] ===== EXECUTION START =====');
    console.log('[AddFilesToWorkspaceMode] Input params:', JSON.stringify(params, null, 2));
    console.log('[AddFilesToWorkspaceMode] App available:', !!this.app);
    
    try {
      // Get workspace service asynchronously
      const workspaceService = await this.getWorkspaceService();
      
      // Check if workspace service is available
      if (!workspaceService) {
        const errorResult = {
          filesAdded: 0,
          foldersAdded: 0,
          addedFiles: [],
          failedFiles: [],
          workspace: {
            id: params.workspaceId || '',
            name: 'Unknown',
            totalFiles: 0,
            totalRelatedFiles: 0
          }
        };
        console.log('[AddFilesToWorkspaceMode] Returning error result:', errorResult);
        return this.prepareResult(false, errorResult, 'Workspace service not available');
      }
      
      console.log('[AddFilesToWorkspaceMode] Workspace service check passed');
      
      // Validate parameters
      if (!params.workspaceId) {
        console.log('[AddFilesToWorkspaceMode] ERROR: Missing workspaceId parameter');
        return this.prepareResult(false, {
          filesAdded: 0,
          foldersAdded: 0,
          addedFiles: [],
          failedFiles: [],
          workspace: {
            id: params.workspaceId || '',
            name: 'Unknown',
            totalFiles: 0,
            totalRelatedFiles: 0
          }
        }, 'Workspace ID is required');
      }
      
      if (!params.files && !params.folders) {
        return this.prepareResult(false, {
          filesAdded: 0,
          foldersAdded: 0,
          addedFiles: [],
          failedFiles: [],
          workspace: {
            id: params.workspaceId || '',
            name: 'Unknown',
            totalFiles: 0,
            totalRelatedFiles: 0
          }
        }, 'Either files or folders must be specified');
      }
      
      // Get the target workspace
      console.log('[AddFilesToWorkspaceMode] Attempting to get workspace:', params.workspaceId);
      let workspace;
      try {
        workspace = await workspaceService.getWorkspace(params.workspaceId);
        console.log('[AddFilesToWorkspaceMode] Workspace retrieved:', !!workspace);
        if (workspace) {
          console.log('[AddFilesToWorkspaceMode] Workspace details:', {
            id: workspace.id,
            name: workspace.name,
            rootFolder: workspace.rootFolder,
            relatedFiles: workspace.relatedFiles?.length || 0,
            relatedFolders: workspace.relatedFolders?.length || 0
          });
        }
      } catch (error) {
        console.error('[AddFilesToWorkspaceMode] ERROR getting workspace:', error);
        throw new Error(`Failed to retrieve workspace: ${(error as Error).message}`);
      }
      
      if (!workspace) {
        console.log('[AddFilesToWorkspaceMode] ERROR: Workspace not found:', params.workspaceId);
        return this.prepareResult(false, {
          filesAdded: 0,
          foldersAdded: 0,
          addedFiles: [],
          failedFiles: [],
          workspace: {
            id: params.workspaceId,
            name: 'Unknown',
            totalFiles: 0,
            totalRelatedFiles: 0
          }
        }, `Workspace with ID ${params.workspaceId} not found`);
      }
      
      const addAsRelated = params.addAsRelated !== false; // Default to true
      const markAsKeyFiles = params.markAsKeyFiles || false;
      
      console.log('[AddFilesToWorkspaceMode] Processing options:', {
        addAsRelated,
        markAsKeyFiles,
        filesCount: params.files?.length || 0,
        foldersCount: params.folders?.length || 0
      });
      
      const addedFiles: string[] = [];
      const failedFiles: Array<{ path: string; reason: string }> = [];
      let filesAdded = 0;
      let foldersAdded = 0;
      
      // Process individual files
      if (params.files && params.files.length > 0) {
        console.log('[AddFilesToWorkspaceMode] Processing files:', params.files);
        for (const filePath of params.files) {
          console.log('[AddFilesToWorkspaceMode] Processing file:', filePath);
          try {
            const result = await this.addFileToWorkspace(
              workspace, 
              filePath, 
              addAsRelated, 
              markAsKeyFiles
            );
            
            if (result.success) {
              addedFiles.push(filePath);
              filesAdded++;
            } else {
              failedFiles.push({ path: filePath, reason: result.reason || 'Unknown error' });
            }
          } catch (error: any) {
            failedFiles.push({ 
              path: filePath, 
              reason: `Error adding file: ${error.message}` 
            });
          }
        }
      }
      
      // Process folders
      if (params.folders && params.folders.length > 0) {
        for (const folderPath of params.folders) {
          try {
            const result = await this.addFolderToWorkspace(
              workspace, 
              folderPath, 
              addAsRelated
            );
            
            if (result.success) {
              addedFiles.push(...result.addedFiles);
              filesAdded += result.addedFiles.length;
              foldersAdded++;
            } else {
              failedFiles.push({ path: folderPath, reason: result.reason || 'Unknown error' });
            }
          } catch (error: any) {
            failedFiles.push({ 
              path: folderPath, 
              reason: `Error adding folder: ${error.message}` 
            });
          }
        }
      }
      
      // Update the workspace if any files were added
      console.log('[AddFilesToWorkspaceMode] Processing complete. Summary:', {
        filesAdded,
        foldersAdded,
        addedFilesCount: addedFiles.length,
        failedFilesCount: failedFiles.length
      });
      
      if (addedFiles.length > 0) {
        console.log('[AddFilesToWorkspaceMode] Updating workspace with new files/folders');
        try {
          await workspaceService.updateWorkspace(workspace.id, {
            relatedFiles: workspace.relatedFiles || [],
            relatedFolders: workspace.relatedFolders || []
          });
          console.log('[AddFilesToWorkspaceMode] Workspace updated successfully');
        } catch (error: any) {
          console.error('[AddFilesToWorkspaceMode] Failed to update workspace:', error);
          // Don't fail the entire operation if workspace update fails
          console.warn('Continuing despite workspace update failure');
        }
      } else {
        console.log('[AddFilesToWorkspaceMode] No files added, skipping workspace update');
      }
      
      // Get updated workspace info
      console.log('[AddFilesToWorkspaceMode] Getting final workspace info');
      let updatedWorkspace, totalFiles, totalRelatedFiles;
      try {
        updatedWorkspace = await workspaceService.getWorkspace(params.workspaceId);
        totalFiles = await this.countWorkspaceFiles(updatedWorkspace || workspace);
        totalRelatedFiles = (updatedWorkspace?.relatedFiles || []).length;
        console.log('[AddFilesToWorkspaceMode] Final counts:', { totalFiles, totalRelatedFiles });
      } catch (error) {
        console.error('[AddFilesToWorkspaceMode] Error getting final workspace info:', error);
        // Use fallback values
        totalFiles = 0;
        totalRelatedFiles = 0;
      }
      
      const result = {
        filesAdded,
        foldersAdded,
        addedFiles,
        failedFiles,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          totalFiles,
          totalRelatedFiles
        }
      };
      
      console.log('[AddFilesToWorkspaceMode] ===== EXECUTION SUCCESS =====');
      console.log('[AddFilesToWorkspaceMode] Final result:', result);
      
      return this.prepareResult(true, result);
      
    } catch (error: any) {
      console.error('[AddFilesToWorkspaceMode] ===== EXECUTION FAILED =====');
      console.error('[AddFilesToWorkspaceMode] Error details:', error);
      console.error('[AddFilesToWorkspaceMode] Error stack:', error.stack);
      
      const errorResult = {
        filesAdded: 0,
        foldersAdded: 0,
        addedFiles: [],
        failedFiles: [],
        workspace: {
          id: params.workspaceId || '',
          name: 'Unknown',
          totalFiles: 0,
          totalRelatedFiles: 0
        }
      };
      
      console.log('[AddFilesToWorkspaceMode] Returning error result:', errorResult);
      return this.prepareResult(false, errorResult, `Failed to add files to workspace: ${error.message}`);
    }
  }
  
  /**
   * Add a single file to the workspace
   */
  private async addFileToWorkspace(
    workspace: any, 
    filePath: string, 
    addAsRelated: boolean,
    markAsKeyFile: boolean
  ): Promise<{ success: boolean; reason?: string }> {
    console.log('[AddFilesToWorkspaceMode] addFileToWorkspace called for:', filePath);
    
    let normalizedPath;
    try {
      normalizedPath = sanitizePath(filePath, false);
      console.log('[AddFilesToWorkspaceMode] Normalized path:', normalizedPath);
    } catch (error) {
      console.error('[AddFilesToWorkspaceMode] Error normalizing path:', error);
      return { success: false, reason: `Invalid file path: ${filePath}` };
    }
    
    // Check if file exists
    let file;
    try {
      file = this.app.vault.getAbstractFileByPath(normalizedPath);
      console.log('[AddFilesToWorkspaceMode] File lookup result:', !!file, file?.constructor.name);
    } catch (error) {
      console.error('[AddFilesToWorkspaceMode] Error getting file:', error);
      return { success: false, reason: `Error accessing file: ${(error as Error).message}` };
    }
    
    if (!file || !(file instanceof TFile)) {
      console.log('[AddFilesToWorkspaceMode] File not found or not a TFile:', { file: !!file, isTFile: file instanceof TFile });
      return { success: false, reason: 'File not found or is not a file' };
    }
    
    // Check if file is already in workspace
    const existingRelatedFiles = workspace.relatedFiles || [];
    if (existingRelatedFiles.includes(normalizedPath)) {
      return { success: false, reason: 'File is already in workspace related files' };
    }
    
    // Check if file is in root folder
    const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
    const rootFolderWithSlash = normalizedRootFolder.endsWith('/') ? 
      normalizedRootFolder : normalizedRootFolder + '/';
    
    if (normalizedPath === normalizedRootFolder || normalizedPath.startsWith(rootFolderWithSlash)) {
      return { success: false, reason: 'File is already in workspace root folder' };
    }
    
    if (addAsRelated) {
      // Add to related files
      workspace.relatedFiles = workspace.relatedFiles || [];
      workspace.relatedFiles.push(normalizedPath);
      
      // Mark as key file if requested
      if (markAsKeyFile) {
        try {
          await this.markFileAsKey(file);
        } catch (error) {
          console.warn(`Failed to mark file ${normalizedPath} as key file:`, error);
        }
      }
      
      return { success: true };
    } else {
      // For now, we don't support moving files to root folder
      // This would require more complex logic and user confirmation
      return { 
        success: false, 
        reason: 'Moving files to root folder is not yet supported. Use addAsRelated: true instead.' 
      };
    }
  }
  
  /**
   * Add a folder to the workspace
   */
  private async addFolderToWorkspace(
    workspace: any, 
    folderPath: string, 
    addAsRelated: boolean
  ): Promise<{ success: boolean; reason?: string; addedFiles: string[] }> {
    const normalizedPath = sanitizePath(folderPath, false);
    
    // Check if folder exists
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!folder || !(folder instanceof TFolder)) {
      return { 
        success: false, 
        reason: 'Folder not found or is not a folder',
        addedFiles: []
      };
    }
    
    // Check if folder is already in related folders
    const existingRelatedFolders = workspace.relatedFolders || [];
    if (existingRelatedFolders.includes(normalizedPath)) {
      return { 
        success: false, 
        reason: 'Folder is already in workspace related folders',
        addedFiles: []
      };
    }
    
    if (addAsRelated) {
      // Add to related folders
      workspace.relatedFolders = workspace.relatedFolders || [];
      workspace.relatedFolders.push(normalizedPath);
      
      // Get list of files in the folder for reporting
      const addedFiles = this.getFilesInFolder(normalizedPath);
      
      return { success: true, addedFiles };
    } else {
      return { 
        success: false, 
        reason: 'Moving folders to root folder is not yet supported. Use addAsRelated: true instead.',
        addedFiles: []
      };
    }
  }
  
  /**
   * Mark a file as a key file by adding key: true to frontmatter
   */
  private async markFileAsKey(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      
      // Check if file already has frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (frontmatterMatch) {
        // File has frontmatter, check if key property exists
        const frontmatter = frontmatterMatch[1];
        const restOfContent = frontmatterMatch[2];
        
        if (/key\s*:/i.test(frontmatter)) {
          // Key property exists, update it
          const updatedFrontmatter = frontmatter.replace(/key\s*:\s*[^\n]*/i, 'key: true');
          const newContent = `---\n${updatedFrontmatter}\n---\n${restOfContent}`;
          await this.app.vault.modify(file, newContent);
        } else {
          // Key property doesn't exist, add it
          const newContent = `---\n${frontmatter}\nkey: true\n---\n${restOfContent}`;
          await this.app.vault.modify(file, newContent);
        }
      } else {
        // File doesn't have frontmatter, add it
        const newContent = `---\nkey: true\n---\n\n${content}`;
        await this.app.vault.modify(file, newContent);
      }
    } catch (error) {
      console.warn(`Failed to mark file ${file.path} as key file:`, error);
      throw error;
    }
  }
  
  /**
   * Get all markdown files in a folder
   */
  private getFilesInFolder(folderPath: string): string[] {
    const normalizedPath = sanitizePath(folderPath, false);
    const folderWithSlash = normalizedPath.endsWith('/') ? 
      normalizedPath : normalizedPath + '/';
    
    return this.app.vault.getMarkdownFiles()
      .filter(file => {
        const normalizedFilePath = sanitizePath(file.path, false);
        return normalizedFilePath === normalizedPath || 
               normalizedFilePath.startsWith(folderWithSlash);
      })
      .map(file => file.path);
  }
  
  /**
   * Count total files in workspace
   */
  private async countWorkspaceFiles(workspace: any): Promise<number> {
    let count = 0;
    
    // Count files in root folder
    count += this.getFilesInFolder(workspace.rootFolder).length;
    
    // Count files in related folders
    if (workspace.relatedFolders) {
      for (const folderPath of workspace.relatedFolders) {
        count += this.getFilesInFolder(folderPath).length;
      }
    }
    
    // Count individual related files
    if (workspace.relatedFiles) {
      count += workspace.relatedFiles.length;
    }
    
    return count;
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): Record<string, any> {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace to modify (REQUIRED)'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of individual file paths to add to the workspace'
        },
        folders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of folder paths to add to the workspace (all files in these folders will be included)'
        },
        addAsRelated: {
          type: 'boolean',
          description: 'Whether to add files to relatedFiles (true) or try to move them to rootFolder (false). Default: true (safer option)',
          default: true
        },
        markAsKeyFiles: {
          type: 'boolean',
          description: 'Whether to mark added files as key files by adding key: true to their frontmatter',
          default: false
        },
        ...commonSchema
      },
      required: ['workspaceId']
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
        filesAdded: {
          type: 'number',
          description: 'Number of individual files successfully added'
        },
        foldersAdded: {
          type: 'number',
          description: 'Number of folders successfully added'
        },
        addedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of all file paths that were successfully added'
        },
        failedFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path of the file that failed to add' },
              reason: { type: 'string', description: 'Reason why the file failed to add' }
            }
          },
          description: 'List of files that failed to add with reasons'
        },
        workspace: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workspace ID' },
            name: { type: 'string', description: 'Workspace name' },
            totalFiles: { type: 'number', description: 'Total number of files in workspace after update' },
            totalRelatedFiles: { type: 'number', description: 'Number of files in the relatedFiles array' }
          },
          description: 'Updated workspace summary information'
        }
      },
      required: ['filesAdded', 'foldersAdded', 'addedFiles', 'failedFiles', 'workspace']
    };
    
    return baseSchema;
  }
}