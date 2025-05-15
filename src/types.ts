import { App, TFile, Command } from 'obsidian';
import { IAgent } from './agents/interfaces/IAgent';

/**
 * Server status enum
 */
export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Extend App type to include commands
 */
declare module 'obsidian' {
    interface App {
        commands: {
            listCommands(): Command[];
            executeCommandById(id: string): Promise<void>;
            commands: { [id: string]: Command };
        };
    }
}


import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from './agents/memoryManager/types';

/**
 * Plugin settings interface
 * Includes vault access toggle and memory management settings
 */
export interface MCPSettings {
    enabledVault: boolean;
    configFilePath?: string;
    memoryEnabled: boolean;
    memorySettings?: MemorySettings;
}


/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: MCPSettings = {
    enabledVault: true,
    configFilePath: undefined,
    memoryEnabled: false,
    memorySettings: DEFAULT_MEMORY_SETTINGS
};

/**
 * Vault manager interface
 */
export interface IVaultManager {
    app: App;
    ensureFolder(path: string): Promise<void>;
    folderExists(path: string): Promise<boolean>;
    createFolder(path: string): Promise<void>;
    createNote(path: string, content: string, options?: any): Promise<TFile>;
    readNote(path: string): Promise<string>;
    updateNote(path: string, content: string, options?: any): Promise<void>;
    deleteNote(path: string): Promise<void>;
    getNoteMetadata(path: string): Promise<any>;
}

/**
 * MCP Server interface
 */
export interface IMCPServer {
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    getStatus(): ServerStatus;
    registerAgent(agent: IAgent): void;
}