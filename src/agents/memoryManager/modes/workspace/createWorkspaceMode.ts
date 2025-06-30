import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { 
  CreateWorkspaceParameters, 
  CreateWorkspaceResult,
  ProjectWorkspace,
  WorkspaceStatus
} from '../../../../database/workspace-types';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { createErrorMessage } from '../../../../utils/errorUtils';

// Define a custom interface for the Claudesidian plugin
import { ClaudesidianPlugin } from '../utils/pluginTypes';
import { extractContextFromParams } from '../../../../utils/contextUtils';

/**
 * Mode to create a new workspace
 */
export class CreateWorkspaceMode extends BaseMode<CreateWorkspaceParameters, CreateWorkspaceResult> {
  private plugin: Plugin;
  private workspaceService: WorkspaceService | null = null;
  
  /**
   * Create a new CreateWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createWorkspace',
      'Create Workspace',
      'Create a new workspace, phase, or task',
      '1.0.0'
    );
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    
    // Safely access the workspace service
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services && pluginWithServices.services.workspaceService) {
        this.workspaceService = pluginWithServices.services.workspaceService;
      }
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: CreateWorkspaceParameters): Promise<CreateWorkspaceResult> {
    try {
      // Check if workspace service is available
      if (!this.workspaceService) {
        return this.prepareResult(false, undefined, 'Workspace service not available');
      }
      
      // Validate parameters
      if (!params.name) {
        return this.prepareResult(false, undefined, 'Workspace name is required');
      }
      
      if (!params.rootFolder) {
        return this.prepareResult(false, undefined, 'Root folder is required');
      }
      
      // Check if the root folder exists and create it if it doesn't
      try {
        // Try to get folder utility from the plugin
        let folderCreated = false;
        const plugin = this.plugin as any;
        
        if (plugin?.app) {
          const app = plugin.app;
          
          // Check if FileOperations utility is available
          if (typeof app.plugins.getPlugin('claudesidian-mcp')?.services?.FileOperations?.ensureFolder === 'function') {
            const FileOperations = app.plugins.getPlugin('claudesidian-mcp').services.FileOperations;
            await FileOperations.ensureFolder(app, params.rootFolder);
            folderCreated = true;
          } 
          // Try to import FileOperations if it's not available as a service
          else {
            try {
              // Try to dynamically import the FileOperations class
              const { FileOperations } = await import('../../../vaultManager/utils/FileOperations');
              await FileOperations.ensureFolder(app, params.rootFolder);
              folderCreated = true;
            } catch (importError) {
              // Fallback to basic folder creation if import fails
              const folder = app.vault.getAbstractFileByPath(params.rootFolder);
              if (!folder) {
                await app.vault.createFolder(params.rootFolder);
              }
              folderCreated = true;
            }
          }
        }
        
        if (!folderCreated) {
          console.log(`Attempted to create root folder '${params.rootFolder}' but could not access the required utilities.`);
        }
      } catch (folderError) {
        console.error(`Error ensuring root folder exists: ${folderError}`);
        // Continue with workspace creation even if folder creation fails
        // The folder might already exist or the user might need to create it manually
      }
      
      // Determine hierarchy type and path
      const hierarchyType = params.hierarchyType || 'workspace';
      let path: string[] = [];
      let parentWorkspace: ProjectWorkspace | undefined;
      
      // If this is a child workspace, get the parent and validate
      if (params.parentId && hierarchyType !== 'workspace') {
        parentWorkspace = await this.workspaceService.getWorkspace(params.parentId);
        
        if (!parentWorkspace) {
          return this.prepareResult(
            false, 
            undefined, 
            `Parent workspace with ID ${params.parentId} not found`
          );
        }
        
        // Phases can only be parented by workspaces
        if (hierarchyType === 'phase' && parentWorkspace.hierarchyType !== 'workspace') {
          return this.prepareResult(
            false, 
            undefined, 
            'A phase can only be created under a workspace, not another phase or task'
          );
        }
        
        // Tasks can only be parented by phases
        if (hierarchyType === 'task' && parentWorkspace.hierarchyType !== 'phase') {
          return this.prepareResult(
            false, 
            undefined, 
            'A task can only be created under a phase, not a workspace or another task'
          );
        }
        
        // Build the path based on parent
        path = [...parentWorkspace.path, params.parentId];
      }
      
      // Create the workspace object
      const now = Date.now();
      
      // Use context parameter to enhance the description if provided
      let enhancedDescription = params.description || '';
      const contextString = typeof params.context === 'string' ? params.context : 
                           (typeof params.context === 'object' && params.context?.toolContext ? params.context.toolContext : '');
      if (contextString && (!enhancedDescription || enhancedDescription.trim() === '')) {
        enhancedDescription = contextString;
      } else if (contextString && enhancedDescription) {
        // If both exist, append context to description with a separator if not already included
        if (!enhancedDescription.includes(contextString)) {
          enhancedDescription = `${enhancedDescription}\n\nPurpose: ${contextString}`;
        }
      }
      
      // Add information about root folder to the description if appropriate
      if (params.rootFolder && !enhancedDescription.includes(params.rootFolder)) {
        enhancedDescription = `${enhancedDescription}\n\nRoot folder: ${params.rootFolder}`;
      }
      
      // Define default key file instructions if not provided
      const defaultKeyFileInstructions = 
        "Key files can be designated in two ways:\n" +
        "1. Add 'key: true' to the file's YAML frontmatter\n" +
        "2. Use a standard filename like readme.md, index.md, summary.md, or moc.md";
      
      const workspaceData: Omit<ProjectWorkspace, 'id'> = {
        name: params.name,
        description: enhancedDescription,
        created: now,
        lastAccessed: now,
        
        // Hierarchy information
        hierarchyType,
        parentId: params.parentId,
        childWorkspaces: [],
        path,
        
        // Context boundaries
        rootFolder: params.rootFolder,
        relatedFolders: params.relatedFolders || [],
        relatedFiles: params.relatedFiles || [],
        associatedNotes: [], // Initialize empty array for automatically tracked external files
        
        // Instructions for key files
        keyFileInstructions: params.keyFileInstructions || defaultKeyFileInstructions,
        
        // Memory parameters
        relevanceSettings: {
          folderProximityWeight: 0.5,
          recencyWeight: 0.7,
          frequencyWeight: 0.3
        },
        
        // Activity history
        activityHistory: [{
          timestamp: now,
          action: 'create',
          toolName: 'CreateWorkspaceMode',
          // Store the context in activity history including root folder information
          context: params.context ? 
            `${params.context} (Root folder: ${params.rootFolder})` : 
            `Workspace created with root folder: ${params.rootFolder}`
        }],
        
        // User preferences
        preferences: params.preferences || {},
        
        // Progress tracking
        completionStatus: {},
        
        // Overall status
        status: 'active' as WorkspaceStatus
      };
      
      // Save the workspace using the workspace service
      const newWorkspace = await this.workspaceService.createWorkspace(workspaceData);
      
      const workspaceContext = {
        workspaceId: newWorkspace.id,
        workspacePath: [...path, newWorkspace.id]
      };

      // Pass the context from parameters to result  
      const resultContextString = typeof params.context === 'string' ? 
        `Created workspace "${params.name}" with purpose: ${params.context}` :
        (typeof params.context === 'object' && params.context?.toolContext ? 
          `Created workspace "${params.name}" with purpose: ${params.context.toolContext}` :
          `Created workspace "${params.name}"`);
        
      return this.prepareResult(
        true,
        {
          workspaceId: newWorkspace.id,
          workspace: newWorkspace
        },
        undefined,
        resultContextString,
        workspaceContext
      );
      
    } catch (error: any) {
      return this.prepareResult(
        false, 
        undefined,
        createErrorMessage('Failed to create workspace: ', error)
      );
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the workspace (REQUIRED)'
        },
        description: {
          type: 'string',
          description: 'Optional description of the workspace'
        },
        context: {
          type: 'string',
          description: 'Purpose or goal of this workspace - IMPORTANT: This will be stored with the workspace and used in memory operations',
          minLength: 1
        },
        rootFolder: {
          type: 'string',
          description: 'Root folder path for this workspace (REQUIRED)'
        },
        relatedFolders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional related folders'
        },
        relatedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional individual files to include in workspace context (paths relative to vault root)'
        },
        keyFileInstructions: {
          type: 'string',
          description: 'Instructions for how to designate key files within this workspace - these will be provided to AI to help it correctly work with key files'
        },
        preferences: {
          type: 'object',
          description: 'Custom workspace settings'
        },
        hierarchyType: {
          type: 'string',
          enum: ['workspace', 'phase', 'task'],
          description: 'Type of hierarchy node (default: workspace)'
        },
        parentId: {
          type: 'string',
          description: 'Parent workspace/phase ID if applicable'
        }
      },
      required: ['name', 'rootFolder']
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode, which includes common result properties
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'ID of the created workspace'
        },
        workspace: {
          type: 'object',
          description: 'The full workspace object that was created',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { 
              type: 'string',
              description: 'Workspace description including purpose/goal'
            },
            hierarchyType: { 
              type: 'string',
              enum: ['workspace', 'phase', 'task']
            },
            path: {
              type: 'array',
              items: { type: 'string' }
            },
            // Other workspace properties omitted for brevity
          }
        },
        purpose: {
          type: 'string',
          description: 'The purpose or goal of this workspace, extracted from context parameter'
        }
      },
      required: ['workspaceId', 'workspace']
    };
    
    // Modify the context property description
    if (baseSchema.properties.context) {
      baseSchema.properties.context.description = 'The purpose and context of this workspace creation';
    }
    
    return baseSchema;
  }
}