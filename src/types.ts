import { App, TFile } from 'obsidian';

export interface MCPSettings {
    rootPath: string;
    enabledVault: boolean;
    allowedPaths: string[];
    cacheTimeout: number;
    aiProvider: string;
    apiKeys: Record<string, string>;
    defaultModel: string;
    defaultTemperature: number;
    templateFolderPath: string;
}

export const DEFAULT_SETTINGS: MCPSettings = {
    rootPath: 'claudesidian',
    enabledVault: true,
    allowedPaths: [],
    cacheTimeout: 300,
    aiProvider: 'openrouter',
    apiKeys: {},
    defaultModel: 'gpt-4o-mini',
    defaultTemperature: 0.7,
    templateFolderPath: 'claudesidian/templates'
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
