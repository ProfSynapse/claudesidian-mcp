/**
 * Location: /src/agents/memoryManager/modes/workspaces/CreateWorkspaceMode.ts
 * Purpose: Consolidated workspace creation mode
 * 
 * This file consolidates the original createWorkspaceMode.ts functionality
 * 
 * Used by: MemoryManager agent for workspace creation operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { createServiceIntegration } from '../../services/ValidationService';

// Import types from existing workspace mode
import { 
    CreateWorkspaceParameters, 
    CreateWorkspaceResult
} from '../../../../database/types/workspace/ParameterTypes';
import { ProjectWorkspace, WorkspaceContext } from '../../../../database/types/workspace/WorkspaceTypes';
import { WorkspaceService } from "../../services/WorkspaceService";
import { createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Consolidated CreateWorkspaceMode - simplified from original
 */
export class CreateWorkspaceMode extends BaseMode<CreateWorkspaceParameters, CreateWorkspaceResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    
    constructor(private agent: MemoryManagerAgent) {
        super(
            'createWorkspace',
            'Create Workspace',
            'Create a new workspace with structured context data',
            '2.0.0'
        );

        this.app = agent.getApp();
        this.serviceIntegration = createServiceIntegration(this.app, {
            logLevel: 'warn',
            maxRetries: 2,
            fallbackBehavior: 'warn'
        });
    }
    
    async execute(params: CreateWorkspaceParameters): Promise<CreateWorkspaceResult> {
        const startTime = Date.now();
        
        try {
            // Get workspace service
            const serviceResult = await this.serviceIntegration.getWorkspaceService();
            if (!serviceResult.success || !serviceResult.service) {
                return this.prepareResult(false, {}, `Workspace service not available: ${serviceResult.error}`);
            }
            
            const workspaceService = serviceResult.service;
            
            // Validate required fields
            const validationErrors = this.serviceIntegration.validateWorkspaceCreationParams(params);
            if (validationErrors.length > 0) {
                const firstError = validationErrors[0];
                return this.prepareResult(false, {}, `Validation error - ${firstError.field}: ${firstError.requirement}`);
            }
            
            // Ensure root folder exists
            try {
                const folder = this.app.vault.getAbstractFileByPath(params.rootFolder);
                if (!folder) {
                    await this.app.vault.createFolder(params.rootFolder);
                }
            } catch (folderError) {
                console.warn(`Could not create root folder: ${folderError}`);
            }
            
            // Auto-detect key files
            const autoDetectedKeyFiles = await this.detectKeyFiles(params.rootFolder);
            
            // Build workspace context
            const context: WorkspaceContext = {
                purpose: params.purpose,
                currentGoal: params.currentGoal,
                status: params.status || 'Starting workspace setup',
                workflows: params.workflows,
                keyFiles: autoDetectedKeyFiles,
                preferences: params.preferences || [],
                agents: params.agents || [],
            };
            
            // Create workspace data
            const now = Date.now();
            const workspaceData: Omit<ProjectWorkspace, 'id'> = {
                name: params.name,
                context: context,
                rootFolder: params.rootFolder,
                created: now,
                lastAccessed: now,
                description: params.description,
                relatedFolders: params.relatedFolders || [],
                relatedFiles: params.relatedFiles || [],
                associatedNotes: [],
                keyFileInstructions: params.keyFileInstructions,
                activityHistory: [{
                    timestamp: now,
                    action: 'create',
                    toolName: 'CreateWorkspaceMode',
                    context: `Created workspace: ${params.purpose}`
                }],
                preferences: params.preferences ? { userPreferences: params.preferences } : undefined,
                projectPlan: undefined,
                checkpoints: [],
                completionStatus: {}
            };
            
            // Save workspace
            const newWorkspace = await workspaceService.createWorkspace(workspaceData);
            
            // Generate validation prompt
            const validationPrompt = this.generatePostCreationPrompt(params, autoDetectedKeyFiles);
            
            return this.prepareResult(true, {
                workspaceId: newWorkspace.id,
                workspace: newWorkspace,
                validationPrompt: validationPrompt
            }, undefined, `Created workspace "${params.name}" with purpose: ${params.purpose}`);
            
        } catch (error) {
            return this.prepareResult(false, {}, createErrorMessage('Error creating workspace: ', error));
        }
    }
    
    /**
     * Auto-detect key files in workspace folder
     */
    private async detectKeyFiles(rootFolder: string): Promise<Array<{category: string; files: Record<string, string>}>> {
        try {
            const detectedFiles: Record<string, string> = {};
            
            const folder = this.app.vault.getAbstractFileByPath(rootFolder);
            if (folder && 'children' in folder && Array.isArray(folder.children)) {
                for (const child of folder.children as any[]) {
                    if (child.path.endsWith('.md')) {
                        const fileName = child.name.toLowerCase();
                        
                        if (['index.md', 'readme.md', 'summary.md', 'moc.md', 'overview.md'].includes(fileName)) {
                            detectedFiles[fileName.replace('.md', '')] = child.path;
                        }
                        
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
            
            return [{
                category: 'Key Files',
                files: detectedFiles
            }];
            
        } catch (error) {
            console.warn('Error detecting key files:', error);
            return [{ category: 'Key Files', files: {} }];
        }
    }

    private generatePostCreationPrompt(params: CreateWorkspaceParameters, autoDetectedKeyFiles: Array<{category: string; files: Record<string, string>}>): string {
        const prompts: string[] = [];
        
        const keyFileCount = autoDetectedKeyFiles.find(category => category.category === 'Key Files');
        const keyFiles = keyFileCount ? Object.keys(keyFileCount.files).length : 0;
        
        if (keyFiles > 0) {
            prompts.push(`Auto-detected ${keyFiles} key files in the workspace.`);
        } else {
            prompts.push('No key files detected. Create index.md, readme.md, or add "key: true" to file frontmatter to designate key files.');
        }
        
        if (!params.preferences || params.preferences.length === 0) {
            prompts.push('Consider adding user preferences as you work in this workspace.');
        }
        
        if (!params.agents || params.agents.length === 0) {
            prompts.push('You can associate AI agents with this workspace for specific tasks.');
        }
        
        prompts.push('Load the workspace to see the current directory structure and validate the setup.');
        
        return prompts.length > 0 
            ? `Workspace created successfully! ${prompts.join(' ')}`
            : 'Workspace created successfully! Load it to see the current directory structure.';
    }

    getParameterSchema(): any {
        return {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Workspace name (REQUIRED)' },
                rootFolder: { type: 'string', description: 'Root folder path for this workspace (REQUIRED)' },
                purpose: { type: 'string', description: 'What is this workspace for? (REQUIRED)' },
                currentGoal: { type: 'string', description: 'What are you trying to accomplish right now? (REQUIRED)' },
                status: { type: 'string', description: 'Current state of progress' },
                workflows: {
                    type: 'array',
                    description: 'Workflows for different situations (REQUIRED)',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            when: { type: 'string' },
                            steps: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['name', 'when', 'steps']
                    },
                    minItems: 1
                },
                preferences: { type: 'array', items: { type: 'string' }, description: 'User preferences' },
                agents: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            when: { type: 'string' },
                            purpose: { type: 'string' }
                        },
                        required: ['name', 'when', 'purpose']
                    }
                },
                description: { type: 'string' },
                relatedFolders: { type: 'array', items: { type: 'string' } },
                relatedFiles: { type: 'array', items: { type: 'string' } },
                keyFileInstructions: { type: 'string' }
            },
            required: ['name', 'rootFolder', 'purpose', 'currentGoal', 'workflows']
        };
    }
    
    getResultSchema(): any {
        return {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        workspaceId: { type: 'string' },
                        workspace: { type: 'object' },
                        validationPrompt: { type: 'string' }
                    }
                }
            }
        };
    }
}