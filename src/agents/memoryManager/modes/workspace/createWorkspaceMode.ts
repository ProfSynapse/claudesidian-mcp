import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { 
  CreateWorkspaceParameters, 
  CreateWorkspaceResult
} from '../../../../database/types/workspace/ParameterTypes';
import { ProjectWorkspace, WorkspaceContext } from '../../../../database/types/workspace/WorkspaceTypes';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { createServiceIntegration } from '../../utils/ServiceIntegration';
import { memoryManagerErrorHandler, createMemoryManagerError } from '../../utils/ErrorHandling';

/**
 * Mode to create a new workspace with robust service integration and error handling
 */
export class CreateWorkspaceMode extends BaseMode<CreateWorkspaceParameters, CreateWorkspaceResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;
  
  constructor(app: App) {
    super(
      'createWorkspace',
      'Create Workspace',
      'Create a new workspace with structured context data',
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
   * Get workspace service with robust error handling and retry logic
   */
  private async getWorkspaceService(): Promise<WorkspaceService | null> {
    const result = await this.serviceIntegration.getWorkspaceService();
    
    if (!result.success) {
    }
    
    return result.service;
  }
  
  /**
   * Execute the mode - validate LLM input and create workspace with robust error handling
   */
  async execute(params: CreateWorkspaceParameters): Promise<CreateWorkspaceResult> {
    const startTime = Date.now();
    
    try {
      // Get workspace service with comprehensive error handling
      const serviceResult = await this.serviceIntegration.getWorkspaceService();
      if (!serviceResult.success || !serviceResult.service) {
        const error = memoryManagerErrorHandler.handleServiceUnavailable(
          'Create Workspace',
          'createWorkspace',
          'WorkspaceService',
          serviceResult.error,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      const workspaceService = serviceResult.service;
      
      // Validate required fields with structured error handling
      const validationErrors = this.validateParameters(params);
      if (validationErrors.length > 0) {
        const firstError = validationErrors[0];
        const error = memoryManagerErrorHandler.handleValidationError(
          'Create Workspace',
          'createWorkspace',
          firstError.field,
          firstError.value,
          firstError.requirement,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      console.log('[CreateWorkspaceMode] Parameter validation successful');
      
      // Ensure root folder exists
      try {
        const folder = this.app.vault.getAbstractFileByPath(params.rootFolder);
        if (!folder) {
          await this.app.vault.createFolder(params.rootFolder);
        }
      } catch (folderError) {
        console.warn(`Could not create root folder: ${folderError}`);
        // Continue anyway - folder might exist or user can create manually
      }
      
      // Auto-detect keyFiles (no LLM input needed)
      const autoDetectedKeyFiles = await this.detectKeyFiles(params.rootFolder);
      
      // Build the workspace context from LLM input
      const context: WorkspaceContext = {
        purpose: params.purpose,
        currentGoal: params.currentGoal,
        status: params.status || 'Starting workspace setup',
        workflows: params.workflows,
        keyFiles: autoDetectedKeyFiles,
        preferences: params.preferences || [],
        agents: params.agents || [],
        nextActions: params.nextActions
      };
      
      // Create the simple workspace
      const now = Date.now();
      const workspaceData: Omit<ProjectWorkspace, 'id'> = {
        name: params.name,
        context: context,
        rootFolder: params.rootFolder,
        created: now,
        lastAccessed: now,
        
        // Legacy fields for backward compatibility (optional)
        description: params.description,
        hierarchyType: params.hierarchyType || 'workspace',
        parentId: params.parentId,
        childWorkspaces: [],
        path: [],
        relatedFolders: params.relatedFolders || [],
        relatedFiles: params.relatedFiles || [],
        associatedNotes: [],
        keyFileInstructions: params.keyFileInstructions,
        relevanceSettings: {
          folderProximityWeight: 0.5,
          recencyWeight: 0.7,
          frequencyWeight: 0.3
        },
        activityHistory: [{
          timestamp: now,
          action: 'create',
          toolName: 'CreateWorkspaceMode',
          context: `Created workspace: ${params.purpose}`
        }],
        preferences: params.preferences ? { userPreferences: params.preferences } : undefined,
        projectPlan: undefined,
        checkpoints: [],
        completionStatus: {},
        status: 'active'
      };
      
      // Save the workspace with error handling
      console.log('[CreateWorkspaceMode] Creating workspace in service...');
      let newWorkspace: ProjectWorkspace;
      try {
        newWorkspace = await workspaceService.createWorkspace(workspaceData);
        console.log(`[CreateWorkspaceMode] Workspace created successfully with ID: ${newWorkspace.id}`);
      } catch (createError) {
        console.error('[CreateWorkspaceMode] Failed to create workspace:', createError);
        const error = memoryManagerErrorHandler.handleUnexpected(
          'Create Workspace',
          'createWorkspace',
          createError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, {});
      }
      
      // Generate post-creation validation prompt
      const validationPrompt = this.generatePostCreationPrompt(params, autoDetectedKeyFiles);
      
      const result = this.prepareResult(
        true,
        {
          workspaceId: newWorkspace.id,
          workspace: newWorkspace,
          validationPrompt: validationPrompt,
          performance: {
            totalDuration: Date.now() - startTime,
            serviceAccessTime: serviceResult.diagnostics?.duration || 0,
            validationTime: 0, // Could be measured if needed
            creationTime: Date.now() - startTime // Approximation
          }
        },
        undefined,
        `Created workspace "${params.name}" with purpose: ${params.purpose}`,
        this.getInheritedWorkspaceContext(params) || undefined
      );
      
      console.log(`[CreateWorkspaceMode] Operation completed successfully in ${Date.now() - startTime}ms`);
      return result;
      
    } catch (error: any) {
      console.error(`[CreateWorkspaceMode] Unexpected error after ${Date.now() - startTime}ms:`, error);
      return createMemoryManagerError<CreateWorkspaceResult>(
        'Create Workspace',
        'createWorkspace',
        error,
        params.workspaceContext,
        params
      );
    }
  }
  
  /**
   * Validate workspace creation parameters
   */
  private validateParameters(params: CreateWorkspaceParameters): Array<{field: string; value: any; requirement: string}> {
    const errors: Array<{field: string; value: any; requirement: string}> = [];
    
    if (!params.name) {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'Workspace name is required and must be a non-empty string'
      });
    }
    
    if (!params.rootFolder) {
      errors.push({
        field: 'rootFolder',
        value: params.rootFolder,
        requirement: 'Root folder path is required for workspace organization'
      });
    }
    
    if (!params.purpose) {
      errors.push({
        field: 'purpose',
        value: params.purpose,
        requirement: 'Workspace purpose is required. Provide a clear description of what this workspace is for (e.g., "Apply for marketing manager positions")'
      });
    }
    
    if (!params.currentGoal) {
      errors.push({
        field: 'currentGoal',
        value: params.currentGoal,
        requirement: 'Current goal is required. Specify what you are trying to accomplish right now (e.g., "Submit 10 applications this week")'
      });
    }
    
    if (!params.workflows || params.workflows.length === 0) {
      errors.push({
        field: 'workflows',
        value: params.workflows,
        requirement: 'At least one workflow is required. Provide workflows with name, when to use, and steps (e.g., [{"name": "New Application", "when": "When applying to new position", "steps": ["Research company", "Customize cover letter", "Apply", "Track"]}])'
      });
    }
    
    if (!params.nextActions || params.nextActions.length === 0) {
      errors.push({
        field: 'nextActions',
        value: params.nextActions,
        requirement: 'Next actions are required. Provide specific next steps to take (e.g., ["Follow up on Google application", "Apply to Stripe position"])'
      });
    }
    
    return errors;
  }
  
  /**
   * Get the parameter schema - prompts LLM to provide complete structure
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workspace name (REQUIRED)'
        },
        rootFolder: {
          type: 'string',
          description: 'Root folder path for this workspace (REQUIRED)'
        },
        purpose: {
          type: 'string',
          description: 'What is this workspace for? (REQUIRED) Example: "Apply for marketing manager positions"'
        },
        currentGoal: {
          type: 'string',
          description: 'What are you trying to accomplish right now? (REQUIRED) Example: "Submit 10 applications this week"'
        },
        status: {
          type: 'string',
          description: 'What\'s the current state of progress? Example: "5 sent, 2 pending responses (Google, Meta), need 5 more"'
        },
        workflows: {
          type: 'array',
          description: 'Workflows for different situations (REQUIRED)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Workflow name like "New Application" or "Follow-up"' },
              when: { type: 'string', description: 'When to use this workflow like "When applying to new position"' },
              steps: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Step-by-step process like ["Research company", "Customize cover letter", "Apply", "Track"]'
              }
            },
            required: ['name', 'when', 'steps']
          },
          minItems: 1
        },
        // keyFiles are auto-detected from directory structure
        // To create key files: name files index.md, readme.md, summary.md, moc.md, overview.md 
        // OR add 'key: true' to any file's frontmatter
        preferences: {
          type: 'array',
          description: 'User preferences as actionable guidelines (optional - can be added later)',
          items: { type: 'string' },
          example: '["Use professional tone", "Focus on tech companies", "Keep cover letters under 300 words"]'
        },
        agents: {
          type: 'array',
          description: 'Agents to associate with this workspace (optional)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Agent name like "CoverLetterAgent"' },
              when: { type: 'string', description: 'When to use like "When customizing cover letters"' },
              purpose: { type: 'string', description: 'What it does like "Adapts letters to job requirements"' }
            },
            required: ['name', 'when', 'purpose']
          }
        },
        nextActions: {
          type: 'array',
          description: 'Next actions to take (REQUIRED)',
          items: { type: 'string' },
          minItems: 1,
          example: '["Follow up on Google application", "Apply to Stripe position", "Update LinkedIn profile"]'
        },
        
        // Legacy fields for backward compatibility
        description: { type: 'string', description: 'Optional description' },
        relatedFolders: { type: 'array', items: { type: 'string' }, description: 'Additional related folders' },
        relatedFiles: { type: 'array', items: { type: 'string' }, description: 'Additional individual files' },
        hierarchyType: { type: 'string', enum: ['workspace', 'phase', 'task'], description: 'Type of hierarchy node' },
        parentId: { type: 'string', description: 'Parent workspace ID if applicable' },
        keyFileInstructions: { type: 'string', description: 'Instructions for key file designation' }
      },
      required: ['name', 'rootFolder', 'purpose', 'currentGoal', 'workflows', 'nextActions']
    };
  }
  
  /**
   * Auto-detect key files in workspace folder
   * Scans for index.md, readme.md, files with 'key: true' metadata
   */
  private async detectKeyFiles(rootFolder: string): Promise<Array<{category: string; files: Record<string, string>}>> {
    try {
      const detectedFiles: Record<string, string> = {};
      
      // Get all files in the root folder
      const folder = this.app.vault.getAbstractFileByPath(rootFolder);
      if (folder && 'children' in folder && Array.isArray(folder.children)) {
        for (const child of folder.children as any[]) {
          if (child.path.endsWith('.md')) {
            const fileName = child.name.toLowerCase();
            
            // Check for standard key file names
            if (['index.md', 'readme.md', 'summary.md', 'moc.md', 'overview.md'].includes(fileName)) {
              detectedFiles[fileName.replace('.md', '')] = child.path;
            }
            
            // Check for 'key: true' in frontmatter
            try {
              if ('cachedData' in child && child.cachedData?.frontmatter?.key === true) {
                detectedFiles[child.name.replace('.md', '')] = child.path;
              }
            } catch (error) {
              // Ignore frontmatter parsing errors
            }
          }
        }
      }
      
      // Return detected files in structured format
      if (Object.keys(detectedFiles).length > 0) {
        return [{
          category: 'Key Files',
          files: detectedFiles
        }];
      }
      
      // Return empty structure if no key files found
      return [{
        category: 'Key Files',
        files: {}
      }];
    } catch (error) {
      console.warn('[CreateWorkspaceMode] Error detecting key files:', error);
      return [{
        category: 'Key Files',
        files: {}
      }];
    }
  }

  /**
   * Generate post-creation validation prompt
   */
  private generatePostCreationPrompt(params: CreateWorkspaceParameters, autoDetectedKeyFiles: Array<{category: string; files: Record<string, string>}>): string {
    const prompts: string[] = [];
    
    // Check if keyFiles were auto-detected
    const keyFilesCategory = autoDetectedKeyFiles.find(category => category.category === 'Key Files');
    const keyFileCount = keyFilesCategory ? Object.keys(keyFilesCategory.files).length : 0;
    
    if (keyFileCount > 0) {
      prompts.push(`Auto-detected ${keyFileCount} key files in the workspace.`);
    } else {
      prompts.push('No key files detected. Create index.md, readme.md, or add "key: true" to file frontmatter to designate key files.');
    }
    
    // Check if preferences were provided
    if (!params.preferences || params.preferences.length === 0) {
      prompts.push('Consider adding user preferences as you work in this workspace.');
    }
    
    // Check if agents were provided  
    if (!params.agents || params.agents.length === 0) {
      prompts.push('You can associate AI agents with this workspace for specific tasks.');
    }
    
    // Always suggest loading the workspace to see current state
    prompts.push('Load the workspace to see the current directory structure and validate the setup.');
    
    return prompts.length > 0 
      ? `Workspace created successfully! ${prompts.join(' ')}`
      : 'Workspace created successfully! Load it to see the current directory structure.';
  }

  /**
   * Get the result schema
   */
  getResultSchema(): any {
    const baseSchema = super.getResultSchema();
    
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'ID of the created workspace'
        },
        workspace: {
          type: 'object',
          description: 'The full workspace object that was created'
        },
        validationPrompt: {
          type: 'string',
          description: 'Post-creation validation suggestions and next steps'
        }
      },
      required: ['workspaceId', 'workspace', 'validationPrompt']
    };
    
    return baseSchema;
  }
}