import { App } from 'obsidian';
import { PathService } from './PathService';
import { NoteService } from './NoteService';
import { FolderService } from './FolderService';
import { ConversationManager } from './ConversationManager';
import { VaultManagerFacade } from './VaultManagerFacade';
import { HttpClient } from '../ai/HttpClient';
import { OpenRouterAdapter } from '../ai/adapters/openRouter';
import { IPathService } from './interfaces/IPathService';
import { INoteService } from './interfaces/INoteService';
import { IFolderService } from './interfaces/IFolderService';
import { IConversationManager } from './interfaces/IConversationManager';
import { IHttpClient } from '../ai/interfaces/IHttpClient';
import { IAIAdapter } from '../ai/interfaces/IAIAdapter';
import { AIProvider } from '../ai/models';
import { IVaultManager, IToolRegistry, IToolContext } from '../tools/interfaces/ToolInterfaces';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ManageNoteTool } from '../tools/core/ManageNoteTool';
import { CompletionTool } from '../tools/core/LLMTool';
import { CompletionToolDI } from '../tools/core/CompletionTool';
import { ManageMetadataTool } from '../tools/core/ManageMetadataTool';
import { ManageFolderTool } from '../tools/core/ManageFolderTool';
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
        // Note: ToolRegistry expects VaultManager, not IVaultManager
        // This is a temporary solution until ToolRegistry is updated to use interfaces
        const toolRegistry = new ToolRegistry(
            this.app,
            this.plugin,
            this.get<IVaultManager>('vaultManager') as any,
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
        
        // Don't register core tools here as they're already registered in ToolRegistry constructor
        // This prevents the "Tool is already registered" error
        
        // Register only the DI version of CompletionTool
        // The original CompletionTool is already registered in ToolRegistry constructor
        
        // New CompletionToolDI with dependency injection
        // Cast toolContext to any to avoid type mismatch between interfaces
        const completionToolDI = new CompletionToolDI(
            toolContext as any,
            this.get<IAIAdapter>('aiAdapter')
        );
        
        // Register the instance directly
        const name = completionToolDI.getName();
        (toolRegistry as any).instances.set(name, completionToolDI);
        (toolRegistry as any).tools.set(name, completionToolDI.constructor);
    }
}
