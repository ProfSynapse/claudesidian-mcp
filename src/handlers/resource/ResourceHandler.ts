import { App, TFile } from 'obsidian';
import { BaseHandler } from '../base/BaseHandler';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handler for resource-related operations
 * 
 * This handler manages vault resource operations including
 * listing resources and reading resource contents.
 */
export class ResourceHandler extends BaseHandler {
    constructor(private app: App) {
        super();
    }
    
    /**
     * Handle resource listing request
     * 
     * @returns Promise resolving to an object containing the resources list
     */
    async handleResourceList(): Promise<{ resources: any[] }> {
        try {
            const resources = await this.getVaultResources();
            return { resources };
        } catch (error) {
            this.handleError(error, 'Resource List');
        }
    }
    
    /**
     * Handle resource reading request
     * 
     * @param request The request object containing the resource URI
     * @returns Promise resolving to the resource content
     */
    async handleResourceRead(request: any): Promise<{ contents: any[] }> {
        try {
            const params = this.extractParams(request);
            const { uri } = params;
            
            if (!uri) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Resource URI is required'
                );
            }
            
            const content = await this.readResource(uri);
            return {
                contents: [{
                    uri,
                    text: content,
                    mimeType: "text/markdown"
                }]
            };
        } catch (error) {
            this.handleError(error, 'Resource Read');
        }
    }
    
    /**
     * Get resources from the vault
     * 
     * @returns Array of resource objects
     */
    private async getVaultResources(): Promise<any[]> {
        interface Resource {
            uri: string;
            name: string;
            mimeType: string;
        }
        
        const resources: Resource[] = [];
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            resources.push({
                uri: `obsidian://${file.path}`,
                name: file.basename,
                mimeType: "text/markdown"
            });
        }
        
        return resources;
    }
    
    /**
     * Read a resource from the vault
     * 
     * @param uri The resource URI to read
     * @returns The resource content as string
     */
    private async readResource(uri: string): Promise<string> {
        const path = uri.replace('obsidian://', '');
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
    }
}