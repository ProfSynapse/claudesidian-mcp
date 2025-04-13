import { App, TFile, Command } from 'obsidian';

export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

// Extend App type to include commands
declare module 'obsidian' {
    interface App {
        commands: {
            listCommands(): Command[];
            executeCommandById(id: string): Promise<void>;
            commands: { [id: string]: Command };
        };
    }
}

export interface MCPSettings {
    enabledVault: boolean;
    aiProvider: string;
    apiKeys: Record<string, string>;
    defaultModel: string;
    defaultTemperature: number;
}

export const DEFAULT_SETTINGS: MCPSettings = {
    enabledVault: true,
    aiProvider: 'openrouter',
    apiKeys: {},
    defaultModel: 'gpt-4o-mini',
    defaultTemperature: 0.7
};

// Memory-related interfaces removed

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
