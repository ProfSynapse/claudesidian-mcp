import { BaseTool, IToolMetadata } from '../BaseTool';
import { AIProvider, AIModelMap } from '../../ai/models';
import { MCPSettings } from '../../types';
import { IAIAdapter } from '../../ai/interfaces/IAIAdapter';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { join } from 'path';
import { TFile } from 'obsidian';

/**
 * Tool for generating AI completions
 * Uses dependency injection for AI adapter
 */
export class TextGeneratorTool extends BaseTool {
    /**
     * Creates a new TextGeneratorTool
     * @param context Tool context
     * @param aiAdapter AI adapter for generating completions
     */
    constructor(
        // Type casting is necessary here because the IToolContext from BaseTool
        // might differ from the one in ToolInterfaces. This should be fixed in a future refactoring
        // by consolidating the interfaces.
        context: IToolContext,
        private aiAdapter: IAIAdapter
    ) {
        const metadata: IToolMetadata = {
            name: 'textGenerator',
            description: 'Generate AI completions using OpenRouter.\n\n' +
                        'Note: Uses the default model from vault settings unless specified. Models follow provider/model format (e.g., \'openai/gpt-4o-mini\').',
            version: '1.0.0'
        };

        super(context, metadata, {
            requireConfirmation: false
        });
    }
    
    /**
     * Sets the AI adapter for generating completions
     * @param aiAdapter AI adapter
     */
    setAIAdapter(aiAdapter: IAIAdapter): void {
        this.aiAdapter = aiAdapter;
    }

    /**
     * Gets the JSON schema for tool arguments
     * @returns JSON schema object
     */
    getSchema() {
        return {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The prompt to send to the AI model'
                },
                model: {
                    type: 'string',
                    description: 'Optional: The model to use',
                    enum: AIModelMap[AIProvider.OpenRouter].map(m => m.apiName)
                },
                temperature: {
                    type: 'number',
                    description: 'Optional: Temperature (0.0-1.0)',
                    minimum: 0,
                    maximum: 1
                },
                maxTokens: {
                    type: 'number',
                    description: 'Optional: Maximum tokens to generate',
                    minimum: 1
                }
            },
            required: ['prompt']
        };
    }

    /**
     * Executes the AI generation tool
     * @param args Tool arguments
     * @returns Generation result
     * @throws Error if generation fails
     */
    async execute(args: {
        prompt: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
    }) {
        // Get settings directly from context.plugin
        const settings = this.context.plugin.settings as MCPSettings;
        
        const model = args.model || settings.defaultModel;
        const temperature = args.temperature || settings.defaultTemperature;
        
        const response = await this.aiAdapter.generateResponse(
            args.prompt,
            model,
            {
                temperature: temperature,
                maxTokens: args.maxTokens || 1000
            }
        );

        if (!response.success) {
            throw new Error(response.error || 'AI generation failed');
        }

        // Save the completion to the vault
        const savedNote = await this.saveCompletionToVault(
            args.prompt,
            response.data,
            model,
            {
                temperature,
                tokens: response.tokens
            }
        );

        return {
            content: response.data,
            tokens: response.tokens,
            savedNote: {
                path: savedNote.path,
                name: savedNote.basename
            }
        };
    }

    /**
     * Saves the completion to a note in the vault
     * @param prompt The prompt that was sent to the AI model
     * @param completion The completion generated by the AI model
     * @param model The model that was used
     * @param metadata Additional metadata
     * @returns The created note file
     * @private
     */
    private async saveCompletionToVault(
        prompt: string,
        completion: string,
        model: string,
        metadata: {
            temperature: number;
            tokens?: {
                input?: number;
                output?: number;
                total?: number;
            };
        }
    ): Promise<TFile> {
        try {
            // Generate a timestamp for the filename and frontmatter
            const now = new Date();
            const timestamp = now.toISOString();
            const dateFormatted = timestamp.split('T')[0];
            const timeFormatted = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-');
            
            // Create a unique filename based on timestamp
            const filename = `completion-${dateFormatted}-${timeFormatted}`;
            
            // Determine the path in the inbox folder
            const inboxPath = join(this.context.settings.rootPath, 'inbox');
            const notePath = join(inboxPath, `${filename}.md`);
            
            // Create the note content with frontmatter and sections
            const content = this.formatNoteContent(prompt, completion, model, timestamp, metadata);
            
            // Ensure the inbox folder exists
            await this.context.vault.ensureFolder(inboxPath);
            
            // Create the note in the vault
            const file = await this.context.vault.createNote(notePath, content);
            
            console.log(`Saved completion to ${notePath}`);
            
            return file;
        } catch (error) {
            console.error('Error saving completion to vault:', error);
            throw new Error(`Failed to save completion to vault: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Formats the note content with frontmatter and sections
     * @param prompt The prompt that was sent to the AI model
     * @param completion The completion generated by the AI model
     * @param model The model that was used
     * @param timestamp ISO timestamp
     * @param metadata Additional metadata
     * @returns Formatted note content
     * @private
     */
    private formatNoteContent(
        prompt: string,
        completion: string,
        model: string,
        timestamp: string,
        metadata: {
            temperature: number;
            tokens?: {
                input?: number;
                output?: number;
                total?: number;
            };
        }
    ): string {
        // Create frontmatter
        let frontmatter = `---
created: ${timestamp}
model: ${model}
temperature: ${metadata.temperature}`;

        // Add token information if available
        if (metadata.tokens) {
            if (metadata.tokens.input !== undefined) {
                frontmatter += `\ninput_tokens: ${metadata.tokens.input}`;
            }
            if (metadata.tokens.output !== undefined) {
                frontmatter += `\noutput_tokens: ${metadata.tokens.output}`;
            }
            if (metadata.tokens.total !== undefined) {
                frontmatter += `\ntotal_tokens: ${metadata.tokens.total}`;
            }
        }
        
        frontmatter += `\n---\n\n`;
        
        // Format the content with sections
        const content = `${frontmatter}# AI Completion

## Prompt
${prompt}

## Completion
${completion}`;
        
        return content;
    }
}