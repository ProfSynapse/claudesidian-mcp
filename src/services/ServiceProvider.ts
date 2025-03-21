import { App } from 'obsidian';
import { PathService } from './PathService';
import { NoteService } from './NoteService';
import { FolderService } from './FolderService';
import { ConversationManager } from './ConversationManager';
import { VaultManagerFacade } from './VaultManagerFacade';
import { HttpClient } from '../ai/HttpClient';
import { OpenRouterAdapter } from '../ai/adapters/openRouter';
// Unused imports removed: IPathService, INoteService, IFolderService, IConversationManager, IHttpClient
import { IAIAdapter } from '../ai/interfaces/IAIAdapter';
import { AIProvider } from '../ai/models';
import { IVaultManager, IToolRegistry, IToolContext } from '../tools/interfaces/ToolInterfaces';
import { ToolRegistry } from '../tools/ToolRegistry';
// Unused imports removed: ManageNoteTool, ManageMetadataTool, ManageFolderTool
import { CompletionTool } from '../tools/core/CompletionTool';
import { EventManager } from './EventManager';

/**
 * Service provider for dependency injection
 * Manages all service instances
 */
export class ServiceProvider {
    private services: Map<string, any> = new Map();
    
    /**
     * Creates a new ServiceProvider
     * @param app Obsidian app instance
     * @param plugin Plugin instance
     */
    constructor(
        private app: App,
        private plugin: any
    ) {
        this.registerServices();
        
        // Register plugin settings
        this.register('settings', this.plugin.settings);
    }
    
    /**
     * Registers all services
     */
    private registerServices(): void {
        // Register path service
        const pathService = new PathService();
        this.services.set('pathService', pathService);
        
        // Register vault services
        const noteService = new NoteService(this.app.vault, pathService);
        this.services.set('noteService', noteService);
        
        const folderService = new FolderService(this.app.vault, pathService);
        this.services.set('folderService', folderService);
        
        // Register AI services
        const httpClient = new HttpClient();
        this.services.set('httpClient', httpClient);
        
        const aiAdapter = new OpenRouterAdapter(httpClient);
        this.services.set('aiAdapter', aiAdapter);
        
        // Register tool services
        const conversationManager = new ConversationManager();
        this.services.set('conversationManager', conversationManager);
        
        // Create a vault manager facade (for backward compatibility)
        const vaultManager = new VaultManagerFacade(
            noteService,
            folderService,
            pathService,
            this.app
        );
        this.services.set('vaultManager', vaultManager);
    }
    
    /**
     * Gets a service by name
     * @param serviceName Service name
     * @returns The service instance
     */
    get<T>(serviceName: string): T {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service ${serviceName} not found`);
        }
        return service as T;
    }
    
    /**
     * Registers a service
     * @param serviceName Service name
     * @param service Service instance
     */
    register<T>(serviceName: string, service: T): void {
        this.services.set(serviceName, service);
    }
    
    /**
     * Initializes the tool registry
     * @param eventManager Event manager
     * @returns The tool registry
     */
    initializeToolRegistry(
        eventManager: EventManager
    ): ToolRegistry {
        // Create tool registry
        // Get the vault manager from the service provider
        const vaultManager = this.get<IVaultManager>('vaultManager');
        
        // Create a new tool registry with the vault manager
        const toolRegistry = new ToolRegistry(
            this.app,
            this.plugin,
            vaultManager, // No type casting needed now that ToolRegistry accepts IVaultManager
            eventManager
        );
        
        this.services.set('toolRegistry', toolRegistry);
        
        return toolRegistry;
    }
    
    /**
     * Configures the AI adapter
     */
    configureAIAdapter(): void {
        const aiAdapter = this.get<IAIAdapter>('aiAdapter');
        const settings = this.plugin.settings;
        
        // Configure the AI adapter
        aiAdapter.setApiKey(settings.apiKeys[AIProvider.OpenRouter]);
    }
    
    /**
     * Registers all tools
     * @param toolRegistry Tool registry
     * @param eventManager Event manager
     */
    registerTools(
        toolRegistry: IToolRegistry,
        eventManager: EventManager
    ): void {
        // Create tool context
        const toolContext: IToolContext = {
            app: this.app,
            plugin: this.plugin,
            vault: this.get<IVaultManager>('vaultManager'),
            toolRegistry: toolRegistry,
            settings: this.plugin.settings,
            eventManager: eventManager
        };
        
        // Don't register most core tools here as they're already registered in ToolRegistry constructor
        // This prevents the "Tool is already registered" error
        
        // Override the CompletionTool registration with our dependency-injected version
        // This ensures the CompletionTool uses the properly configured AI adapter
        
        // Create CompletionTool with dependency injection
        const completionTool = new CompletionTool(
            toolContext, // No type casting needed with updated CompletionTool
            this.get<IAIAdapter>('aiAdapter')
        );
        
        // Register the tool using the registry's registerTool method
        const registry = toolRegistry as ToolRegistry;
        registry.registerTool(CompletionTool);
    }
}
