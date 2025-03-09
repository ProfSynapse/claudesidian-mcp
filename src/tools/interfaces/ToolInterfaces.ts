import { App } from 'obsidian';
import { MCPSettings } from '../../types';
import { EventManager } from '../../services/EventManager';
import { BaseTool } from '../BaseTool';

/**
 * Interface for vault manager
 * Acts as a facade for various file and folder operations
 */
export interface IVaultManager {
    /**
     * Gets the Obsidian app instance
     */
    getApp(): App;
    
    /**
     * Creates a new note in the vault
     * @param path Path to the note
     * @param content Content of the note
     * @param options Optional settings for note creation
     * @returns The created TFile
     */
    createNote(path: string, content: string, options?: any): Promise<any>;
    
    /**
     * Reads a note's content from the vault
     * @param path Path to the note
     * @returns The note content as a string
     */
    readNote(path: string): Promise<string>;
    
    /**
     * Updates an existing note's content
     * @param path Path to the note
     * @param content New content for the note
     * @param options Optional settings for note update
     */
    updateNote(path: string, content: string, options?: any): Promise<void>;
    
    /**
     * Deletes a note from the vault
     * @param path Path to the note
     */
    deleteNote(path: string): Promise<void>;
    
    /**
     * Gets note metadata (frontmatter)
     * @param path Path to the note
     * @returns The note's metadata or null if none exists
     */
    getNoteMetadata(path: string): Promise<Record<string, any> | null>;
    
    /**
     * Updates note metadata without changing content
     * @param path Path to the note
     * @param metadata New metadata for the note
     */
    updateNoteMetadata(path: string, metadata: Record<string, any>): Promise<void>;
    
    /**
     * Gets a file reference by path
     * @param path Path to the file
     * @returns The TFile or null if not found
     */
    getFile(path: string): Promise<any | null>;
    
    /**
     * Ensures a folder exists, creating it and any parent folders if necessary
     * @param path Path to the folder
     */
    ensureFolder(path: string): Promise<void>;
    
    /**
     * Creates a folder if it doesn't exist
     * @param path Path to the folder
     */
    createFolder(path: string): Promise<void>;
    
    /**
     * Checks if a folder exists
     * @param path Path to the folder
     * @returns True if the folder exists, false otherwise
     */
    folderExists(path: string): Promise<boolean>;
    
    /**
     * Refreshes the vault index
     */
    refreshIndex(): Promise<void>;
    
    /**
     * Cleans up empty folders
     * @param path Path to start cleaning from
     */
    cleanupEmptyFolders(path: string): Promise<void>;
}

/**
 * Interface for tool registry
 * Follows Single Responsibility Principle by focusing only on tool management
 */
export interface IToolRegistry {
    /**
     * Registers a tool class
     * @param toolClass Tool class to register
     */
    registerTool(toolClass: new (context: IToolContext, ...args: any[]) => BaseTool): void;
    
    /**
     * Gets a tool by name
     * @param name Tool name
     * @returns The tool instance
     * @throws Error if tool not found
     */
    getTool(name: string): BaseTool;
    
    /**
     * Gets all available tools
     * @returns Array of tool information
     */
    getAvailableTools(): Array<{name: string; description: string}>;
    
    /**
     * Executes a tool
     * @param name Tool name
     * @param args Tool arguments
     * @returns Tool execution result
     */
    executeTool(name: string, args: any): Promise<any>;
    
    /**
     * Sets the conversation as active
     */
    setActive(): void;
    
    /**
     * Resets the conversation state
     */
    resetConversationState(): void;
}

/**
 * Interface for tool context
 * Provides dependencies to tools through dependency injection
 */
export interface IToolContext {
    /**
     * Obsidian app instance
     */
    app: App;
    
    /**
     * Plugin instance
     */
    plugin: any;
    
    /**
     * Vault manager for file operations
     */
    vault: IVaultManager;
    
    /**
     * Tool registry for accessing other tools
     */
    toolRegistry: IToolRegistry;
    
    /**
     * Plugin settings
     */
    settings: MCPSettings;
    
    /**
     * Event manager for event handling
     */
    eventManager: EventManager;
}
