import { App, TFile } from 'obsidian';

export interface MCPSettings {
    rootPath: string;
    memoryPath: string;
    indexPath: string;
    memoryFolderPath: string;
    reasoningFolderPath: string;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    enabledVault: boolean;
    allowedPaths: string[];
    cacheTimeout: number;
    aiProvider: string;
    apiKeys: Record<string, string>;
    defaultModel: string;
    defaultTemperature: number;
}

export const DEFAULT_SETTINGS: MCPSettings = {
    rootPath: 'claudesidian',
    memoryPath: 'claudesidian/memory',
    indexPath: 'claudesidian/index.md',
    memoryFolderPath: 'claudesidian/memory',
    reasoningFolderPath: 'claudesidian/reasoning',
    enabledMemory: true,
    enabledReasoning: true,
    enabledVault: true,
    allowedPaths: [],
    cacheTimeout: 300,
    aiProvider: 'openrouter',
    apiKeys: {},
    defaultModel: 'claude-2',
    defaultTemperature: 0.7
};

export interface ConversationState {
    hasInitialMemoryReview: boolean;
    lastMemoryOperation: number;
    pendingMemoryUpdates: boolean;
    conversationId: string;
}

export interface ProceduralPattern {
    input: {
        goal: string;
        query_type: string;
        tools_needed: string[];
    };
    context: {
        knowledgeGraph: any[];
        reasoning_method?: string;
    };
    steps: ProceduralStep[];
    success: boolean;
    usageCount: number;
    lastUsed: string;
}

export interface ProceduralStep {
    tool: string;
    args: Record<string, any>;
    expectedOutcome: string;
    actualOutcome: string;
}

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
