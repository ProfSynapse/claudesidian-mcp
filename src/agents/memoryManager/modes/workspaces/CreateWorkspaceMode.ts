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
import { WorkspaceService } from '../../../../services/WorkspaceService';
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
            
            // Handle dedicated agent setup
            let dedicatedAgent: { agentId: string; agentName: string } | undefined = undefined;
            if (params.dedicatedAgentId) {
                try {
                    // Get the agent name from CustomPromptStorageService
                    const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
                    if (plugin?.agentManager) {
                        const agentManagerAgent = plugin.agentManager.getAgent('agentManager');
                        if (agentManagerAgent?.storageService) {
                            const agent = agentManagerAgent.storageService.getPromptById(params.dedicatedAgentId);
                            if (agent) {
                                dedicatedAgent = {
                                    agentId: agent.id,
                                    agentName: agent.name
                                };
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Could not retrieve agent name for ID ${params.dedicatedAgentId}:`, error);
                }
            }

            // Combine provided key files with auto-detected ones
            const providedKeyFiles = params.keyFiles || [];
            const autoDetectedKeyFiles = await this.detectSimpleKeyFiles(params.rootFolder);
            const allKeyFiles = [...new Set([...providedKeyFiles, ...autoDetectedKeyFiles])]; // Remove duplicates

            // Build workspace context
            const context: WorkspaceContext = {
                purpose: params.purpose,
                currentGoal: params.currentGoal,
                workflows: params.workflows,
                keyFiles: allKeyFiles,
                preferences: params.preferences || '',
                ...(dedicatedAgent && { dedicatedAgent })
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
                preferences: undefined, // Legacy field - preferences now stored in context
                projectPlan: undefined,
                checkpoints: [],
                completionStatus: {}
            };
            
            // Save workspace
            const newWorkspace = await workspaceService.createWorkspace(workspaceData);
            
            // Generate validation prompt
            const validationPrompt = this.generatePostCreationPrompt(params, allKeyFiles);
            
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
     * Auto-detect key files in workspace folder (simple array format)
     */
    private async detectSimpleKeyFiles(rootFolder: string): Promise<string[]> {
        try {
            const detectedFiles: string[] = [];

            const folder = this.app.vault.getAbstractFileByPath(rootFolder);
            if (folder && 'children' in folder && Array.isArray(folder.children)) {
                for (const child of folder.children as any[]) {
                    if (child.path.endsWith('.md')) {
                        const fileName = child.name.toLowerCase();

                        // Auto-detect common key files
                        if (['index.md', 'readme.md', 'summary.md', 'moc.md', 'overview.md'].includes(fileName)) {
                            detectedFiles.push(child.path);
                        }

                        try {
                            // Check for frontmatter key: true
                            if ('cachedData' in child && child.cachedData?.frontmatter?.key === true) {
                                detectedFiles.push(child.path);
                            }
                        } catch (error) {
                            // Ignore frontmatter parsing errors
                        }
                    }
                }
            }

            return detectedFiles;

        } catch (error) {
            console.warn('Error detecting key files:', error);
            return [];
        }
    }

    private generatePostCreationPrompt(params: CreateWorkspaceParameters, allKeyFiles: string[]): string {
        const prompts: string[] = [];

        if (allKeyFiles.length > 0) {
            prompts.push(`Setup complete with ${allKeyFiles.length} key files identified.`);
        } else {
            prompts.push('No key files detected. Create index.md, readme.md, or add "key: true" to file frontmatter to designate key files.');
        }

        if (!params.preferences || params.preferences.length === 0) {
            prompts.push('Consider adding user preferences as you work in this workspace.');
        }

        if (!params.dedicatedAgentId) {
            prompts.push('You can assign a dedicated AI agent to this workspace for specialized assistance.');
        } else {
            prompts.push('Dedicated agent configured for this workspace.');
        }

        prompts.push('Load the workspace to see the current directory structure and validate the setup.');

        return prompts.length > 0
            ? `Workspace created successfully! ${prompts.join(' ')}`
            : 'Workspace created successfully! Load it to see the current directory structure.';
    }

    getParameterSchema(): any {
        const customSchema = {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Workspace name (REQUIRED)' },
                rootFolder: { type: 'string', description: 'Root folder path for this workspace (REQUIRED)' },
                purpose: { type: 'string', description: 'What is this workspace for? (REQUIRED)' },
                currentGoal: { type: 'string', description: 'What are you trying to accomplish right now? (REQUIRED)' },
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
                keyFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Simple list of key file paths for this workspace'
                },
                preferences: {
                    type: 'string',
                    description: 'User preferences as a single text field'
                },
                dedicatedAgentId: {
                    type: 'string',
                    description: 'ID of dedicated agent for this workspace (systemPrompt included when loading)'
                },
                description: { type: 'string' },
                relatedFolders: { type: 'array', items: { type: 'string' } },
                relatedFiles: { type: 'array', items: { type: 'string' } },
                keyFileInstructions: { type: 'string' }
            },
            required: ['name', 'rootFolder', 'purpose', 'currentGoal', 'workflows']
        };
        
        return this.getMergedSchema(customSchema);
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