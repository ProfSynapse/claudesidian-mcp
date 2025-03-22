import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { join } from 'path';
import { TFile, TFolder } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface TemplateInfo {
    name: string;
    path: string;
}

export class TemplateTool extends BaseTool {
    constructor(context: IToolContext) {
        const templateFolderPath = context.settings.templateFolderPath;
        super(context, {
            name: 'template',
            description: `Manage note templates in ${templateFolderPath} with these actions: list (view available templates), read (view template content), use (create notes from templates)`,
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
            return {
                message: `No templates found in ${templateFolderPath} (folder created)`,
                templates: []
            };
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

        return {
            message: `Templates found in ${templateFolderPath}:`,
            templates
        };
    }

    private async readTemplate(args: any): Promise<any> {
        const { name, path } = args;
        const templateFolderPath = this.context.settings.templateFolderPath;
        
        if (!name && !path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Either name or path parameter is required for reading templates from ${templateFolderPath}`
            );
        }

        let templatePath: string;
        
        if (path) {
            // Validate that path is within template folder
            if (!path.startsWith(templateFolderPath)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Template path must be within ${templateFolderPath}`
                );
            }
            templatePath = path;
        } else {
            // Construct path from name
            templatePath = join(templateFolderPath, `${name}.md`);
        }

        try {
            const content = await this.context.vault.readNote(templatePath);
            return {
                message: `Template content from ${templatePath}:`,
                content
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to read template from ${templateFolderPath}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async useTemplate(args: any): Promise<any> {
        const { name, path, destination, title } = args;
        const templateFolderPath = this.context.settings.templateFolderPath;
        
        if (!name && !path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Either name or path parameter is required for using templates from ${templateFolderPath}`
            );
        }

        // Get template content
        let templatePath: string;
        if (path) {
            // Validate that path is within template folder
            if (!path.startsWith(templateFolderPath)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Template path must be within ${templateFolderPath}`
                );
            }
            templatePath = path;
        } else {
            // Construct path from name
            templatePath = join(templateFolderPath, `${name}.md`);
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
            
            const templateName = name || templatePath.split('/').pop()?.replace('.md', '');
            return {
                message: `Created note using template from ${templateFolderPath}/${templateName}.md`,
                success: true,
                path: file.path,
                title: file.basename
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to use template from ${templateFolderPath}: ${error instanceof Error ? error.message : String(error)}`
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
        const templateFolderPath = this.context.settings.templateFolderPath;
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "read", "use"],
                    description: `The template action to perform on templates in ${templateFolderPath}`
                },
                name: {
                    type: "string",
                    description: `Template name (without .md extension) from ${templateFolderPath}`
                },
                path: {
                    type: "string",
                    description: `Full path to the template file (must be within ${templateFolderPath})`
                },
                filter: {
                    type: "string",
                    description: `Filter string for listing templates in ${templateFolderPath}`
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
