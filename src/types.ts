import { AIProvider } from './ai/models';
import { MemoryType } from './services/MemoryManager';

export interface BridgeMCPSettings {
    enabled: boolean;
    rootPath: string;
    memoryPath: string; // Path to the memories folder (relative to rootPath)
    indexPath: string;  // Path to the index file (relative to rootPath)
    allowedPaths: string[];
    mcp: {
        enabled: boolean;
        server: boolean;
    };
    // Tool enablement flags
    enabledVault: boolean;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    enabledTools: string[];
}

export interface MCPSettings extends BridgeMCPSettings {
    // Server Configuration
    autoStart: boolean;
    debugMode: boolean;
    
    // Security & Performance
    requireConfirmation: boolean;
    cacheTimeout: number;
    
    // Tool Paths (full paths including rootPath)
    memoryFolderPath: string;
    reasoningFolderPath: string;

    // AI Configuration
    aiProvider: AIProvider;
    apiKeys: Record<AIProvider, string>;
    defaultModel: string;
    defaultTemperature: number;

    // Server Settings
    serverHost: string;
    serverPort: number;
}

export interface ProceduralStep {
    tool: string;
    args: Record<string, any>;
    expectedOutcome: string;
    actualOutcome?: string;
}

export interface ProceduralPattern {
    input: Record<string, any>;
    context?: Record<string, any>;
    steps: ProceduralStep[];
    success: boolean;
    usageCount: number;
    lastUsed: string;
}

export const DEFAULT_SETTINGS: MCPSettings = {
    // Base settings
    enabled: true,
    rootPath: 'claudesidian',
    memoryPath: 'memory', // Just the folder name, will be joined with rootPath
    indexPath: 'index.md',  // Just the file name, will be joined with rootPath
    allowedPaths: [],
    mcp: {
        enabled: true,
        server: true
    },
    
    // Tool enablement
    enabledVault: true,
    enabledMemory: true,
    enabledReasoning: true,
    enabledTools: ['memory', 'reasoning', 'search'],

    // Server & Debug settings
    autoStart: false,
    debugMode: false,
    requireConfirmation: true,
    cacheTimeout: 300,

    // Full paths for tools
    memoryFolderPath: 'claudesidian/memory',
    reasoningFolderPath: 'claudesidian/reasoning',

    // AI Configuration
    aiProvider: AIProvider.OpenRouter,
    apiKeys: {
        [AIProvider.OpenRouter]: ''
    },
    defaultModel: 'anthropic/claude-3.5-haiku',
    defaultTemperature: 0.7,

    // Server settings
    serverHost: 'localhost',
    serverPort: 3000
};
