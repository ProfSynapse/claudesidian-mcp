import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';
import { TFile, TFolder } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface TemplateInfo {
    name: string;
    path: string;
}

export class TemplateTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'template',
            description: 'Manage note templates with these actions: list (view available templates), read (view template content), use (create notes from templates)',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        if (!args) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Tool arguments are required'
            );
        }

        const { action } = args;
        if (!action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required'
            );
        }

        switch (action) {
            case 'list':
                return await this.listTemplates(args);
            case 'read':
                return await this.readTemplate(args);
            case 'use':
                return await this.useTemplate(args);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported template action: ${action}`
                );
        }
    }

    private async listTemplates(args: any): Promise<any> {
        const { filter } = args;
        const templateFolderPath = this.context.settings.templateFolderPath;
        
        // Ensure template folder exists
        if (!await this.context.vault.folderExists(templateFolderPath)) {
            await this.context.vault.ensureFolder(templateFolderPath);
            return { templates: [] };
        }

        // Get all files in the template folder
        const templateFolder = this.context.app.vault.getAbstractFileByPath(templateFolderPath);
        if (!templateFolder || !(templateFolder instanceof TFolder)) {
            throw new McpError(
                ErrorCode.InternalError,
                `Template folder not found: ${templateFolderPath}`
            );
        }

        // Filter for markdown files only
        const templates = templateFolder.children
            .filter(file => file instanceof TFile && file.extension === 'md')
            .map(file => ({
                name: file.name.replace('.md', ''),
                path: file.path
            }));

        // Apply filter if provided
        if (filter) {
            const filterLower = filter.toLowerCase();
            return {
                templates: templates.filter(template => 
                    template.name.toLowerCase().includes(filterLower)
                )
            };
        }

        return { templates };
    }

    private async readTemplate(args: any): Promise<any> {
        const { name, path } = args;
        
        if (!name && !path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Either name or path parameter is required'
            );
        }

        let templatePath: string;
        
        if (path) {
            templatePath = path;
        } else {
            // Construct path from name
            templatePath = join(this.context.settings.templateFolderPath, `${name}.md`);
        }

        try {
            const content = await this.context.vault.readNote(templatePath);
            return { content };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to read template: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async useTemplate(args: any): Promise<any> {
        const { name, path, destination, title } = args;
        
        if (!name && !path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Either name or path parameter is required'
            );
        }

        // Get template content
        let templatePath: string;
        
        if (path) {
            templatePath = path;
        } else {
            // Construct path from name
            templatePath = join(this.context.settings.templateFolderPath, `${name}.md`);
        }

        try {
            // Read the template content
            const templateContent = await this.context.vault.readNote(templatePath);
            
            // Determine destination path
            let destPath: string;
            if (destination) {
                destPath = destination;
            } else {
                // If no destination provided, use inbox folder
                const fileName = title || (name ? name : templatePath.split('/').pop()?.replace('.md', ''));
                destPath = join(this.context.settings.rootPath, 'inbox', `${fileName}.md`);
            }

            // Create the note from the template
            const file = await this.context.vault.createNote(destPath, templateContent);
            
            return {
                success: true,
                path: file.path,
                title: file.basename
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to use template: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (args.action === 'use' && previousResult?.path) {
            // Delete the created note
            await this.context.vault.deleteNote(previousResult.path);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "read", "use"],
                    description: "The template action to perform"
                },
                name: {
                    type: "string",
                    description: "Template name (without .md extension)"
                },
                path: {
                    type: "string",
                    description: "Full path to the template file"
                },
                filter: {
                    type: "string",
                    description: "Filter string for listing templates"
                },
                destination: {
                    type: "string",
                    description: "Destination path for the new note"
                },
                title: {
                    type: "string",
                    description: "Title for the new note (used in filename if destination not provided)"
                }
            },
            required: ["action"]
        };
    }
}
