import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { App, TFile } from 'obsidian';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ToolRegistry } from '../tools/ToolRegistry';

export class ObsidianMCPServer {
    private server: Server;
    private app: App;
    private toolRegistry: ToolRegistry;
    private transport: StdioServerTransport;

    constructor(app: App, toolRegistry: ToolRegistry) {
        this.app = app;
        this.toolRegistry = toolRegistry;
        this.server = new Server(
            {
                name: "obsidian-mcp",
                version: "1.0.0"
            },
            {
                capabilities: {
                    resources: {},  // Enable resources for vault access
                    tools: {}       // Enable tools for vault operations
                }
            }
        );

        this.initializeHandlers();
    }

    private initializeHandlers() {
        // Handle resource listing
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            const resources = await this.getVaultResources();
            return { resources };
        });

        // Handle resource reading
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const content = await this.readResource(uri);
            return {
                contents: [{
                    uri,
                    text: content,
                    mimeType: "text/markdown"
                }]
            };
        });

        // Initialize tool handlers
        this.initializeToolHandlers();
    }

    private async getVaultResources() {
        const resources = [];
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

    private async readResource(uri: string) {
        const path = uri.replace('obsidian://', '');
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        
        throw new Error(`Resource not found: ${uri}`);
    }

    private initializeToolHandlers() {
        // Tool handlers will go here
        // We'll implement these in the next step
    }

    public async start() {
        console.log('ObsidianMCPServer: Starting server'); // Log server start
        try {
            this.transport = new StdioServerTransport();
            await this.server.connect(this.transport);
            console.log('ObsidianMCPServer: Server started successfully'); // Log successful start
        } catch (error) {
            console.error('ObsidianMCPServer: Error starting server', error); // Log any errors
        }
    }

    public async stop() {
        console.log('ObsidianMCPServer: Stopping server'); // Log server stop
        try {
            if (this.transport) {
                await this.transport.close();
                console.log('ObsidianMCPServer: Server stopped successfully'); // Log successful stop
            }
        } catch (error) {
            console.error('ObsidianMCPServer: Error stopping server', error); // Log any errors
        }
    }
}
