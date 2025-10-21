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
                return this.prepareResult(false, {
                    error: `Workspace service not available: ${serviceResult.error}`,
                    suggestions: [
                        'Check that the plugin is properly initialized',
                        'Try reloading the plugin'
                    ]
                }, `Workspace service not available: ${serviceResult.error}`, params.context);
            }
            
            const workspaceService = serviceResult.service;
            
            // Validate required fields
            const validationErrors = this.serviceIntegration.validateWorkspaceCreationParams(params);
            if (validationErrors.length > 0) {
                const errorMessages = validationErrors.map(e => `${e.field}: ${e.requirement}`).join(', ');
                return this.prepareResult(false, {
                    error: `Validation failed: ${errorMessages}`,
                    validationErrors: validationErrors,
                    parameterHints: '💡 Required parameters: name, rootFolder, purpose, currentGoal, workflows (array with name, when, steps)',
                    suggestions: [
                        'Ensure all required parameters are provided',
                        'Check that workflows is an array with at least one workflow',
                        'Each workflow must have name, when, and steps properties',
                        'steps should be a single string with steps separated by \\n (newline characters)'
                    ],
                    providedParams: params
                }, `Validation error - ${errorMessages}`, params.context);
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
            const errorMsg = createErrorMessage('Error creating workspace: ', error);
            return this.prepareResult(false, {
                error: errorMsg,
                parameterHints: '💡 Check that all required parameters are correctly formatted:\n- name: string\n- rootFolder: string (existing folder path)\n- purpose: string\n- currentGoal: string\n- workflows: array of workflow objects (with steps as a string with \\n separators)',
                suggestions: [
                    'Verify that rootFolder path exists or can be created',
                    'Ensure workflows array has at least one workflow',
                    'Check that each workflow has name, when, and steps properties',
                    'Verify steps is a single string with \\n separators, not an array: "Step 1\\nStep 2\\nStep 3"'
                ],
                providedParams: params
            }, errorMsg, params.context);
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
            title: 'Create Workspace - Define Project Context',
            description: 'Create a new workspace with structured workflows and context. CRITICAL: workflows must be an array where each workflow has "steps" as an ARRAY of strings, not a single string.',
            properties: {
                name: { 
                    type: 'string', 
                    description: '📝 REQUIRED: Workspace name (e.g., "Fallujah Screenplay")',
                    examples: ['Fallujah Screenplay', 'Marketing Campaign', 'Research Project']
                },
                rootFolder: { 
                    type: 'string', 
                    description: '📁 REQUIRED: Root folder path for this workspace (e.g., "_Projects/FALLUJAH")',
                    examples: ['_Projects/FALLUJAH', 'Work/Marketing', 'Research/AI']
                },
                purpose: { 
                    type: 'string', 
                    description: '🎯 REQUIRED: What is this workspace for? Describe the overall purpose.',
                    examples: [
                        'Workspace for developing a screenplay from Fallujah source materials',
                        'Managing marketing campaign for Q4 product launch',
                        'Research project on AI safety'
                    ]
                },
                currentGoal: { 
                    type: 'string', 
                    description: '🎯 REQUIRED: What are you trying to accomplish right now? Current focus.',
                    examples: [
                        'Create story outline and beat sheet',
                        'Complete social media calendar for October',
                        'Finish literature review by end of month'
                    ]
                },
                workflows: {
                    type: 'array',
                    description: '⚙️ REQUIRED: Workflows for different situations. IMPORTANT: "steps" should be a SINGLE STRING with steps separated by newlines (\\n), not an array.',
                    items: {
                        type: 'object',
                        properties: {
                            name: { 
                                type: 'string',
                                description: 'Workflow name (e.g., "Story Outline Development")'
                            },
                            when: { 
                                type: 'string',
                                description: 'When to use this workflow (e.g., "When outlining a movie screenplay")'
                            },
                            steps: { 
                                type: 'string',
                                description: '📋 CRITICAL: Single string with steps separated by newline characters (\\n). Each step on a new line within the string.',
                                examples: [
                                    'Review relevant source materials\nEngage with Story Outline Assistant\nDevelop story structure\nCreate outline document\nSave completed outline'
                                ]
                            }
                        },
                        required: ['name', 'when', 'steps']
                    },
                    minItems: 1,
                    examples: [
                        [{
                            name: 'Story Outline Development',
                            when: 'When outlining a movie screenplay',
                            steps: 'Review relevant source materials\nEngage with Story Outline Assistant\nDevelop story structure\nCreate outline document'
                        }]
                    ]
                },
                keyFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '📄 Optional: Array of key file paths for quick reference (e.g., ["_Projects/FALLUJAH/outline.md"])'
                },
                preferences: {
                    type: 'string',
                    description: '⚙️ Optional: User preferences or workspace settings as text'
                },
                dedicatedAgentId: {
                    type: 'string',
                    description: '🤖 Optional: ID of dedicated AI agent for this workspace (e.g., "prompt_1761045311666_7oo79kpto")',
                    examples: ['prompt_1761045311666_7oo79kpto']
                },
                description: { 
                    type: 'string',
                    description: '📝 Optional: Additional description or notes'
                },
                relatedFolders: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: '📁 Optional: Related folder paths'
                },
                relatedFiles: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: '📄 Optional: Related file paths'
                },
                keyFileInstructions: { 
                    type: 'string',
                    description: '📋 Optional: Instructions for working with key files'
                }
            },
            required: ['name', 'rootFolder', 'purpose', 'currentGoal', 'workflows'],
            errorHelp: {
                missingName: 'The "name" parameter is required. Provide a descriptive workspace name.',
                missingRootFolder: 'The "rootFolder" parameter is required. Specify the folder path for this workspace.',
                missingPurpose: 'The "purpose" parameter is required. Describe what this workspace is for.',
                missingCurrentGoal: 'The "currentGoal" parameter is required. Describe your current objective.',
                missingWorkflows: 'The "workflows" parameter is required. Provide at least one workflow with name, when, and steps (as a single string with \\n separators).',
                workflowStepsFormat: 'CRITICAL: workflow "steps" should be a SINGLE STRING with steps separated by newline characters (\\n). Example: "Step 1\\nStep 2\\nStep 3"',
                commonMistakes: [
                    'Using an array of strings for workflow steps instead of a single string with \\n separators',
                    'Forgetting the \\n between steps in the string',
                    'Not providing the workflows array',
                    'Missing required workflow properties (name, when, steps)'
                ]
            }
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