import { AIProvider } from './ai/models';
import { MemoryType } from './services/MemoryManager';

export interface BridgeMCPSettings {
    enabled: boolean;
    rootPath: string;
    memoryPath: string;
    indexPath: string;
    allowedPaths: string[];
    mcp: {
        enabled: boolean;
        server: boolean;
    };
}

export interface MCPSettings extends BridgeMCPSettings {
    // Server Configuration
    autoStart: boolean;
    debugMode: boolean;
    
    // Security & Performance
    requireConfirmation: boolean;
    cacheTimeout: number;
    
    // Tool Configuration
    enabledVault: boolean;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    enabledTools: string[];
    
    // Tool Paths
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

export const DEFAULT_SETTINGS: MCPSettings = {
    // Base settings
    enabled: true,
    rootPath: 'bridge-mcp',
    memoryPath: 'bridge-mcp/memories',
    indexPath: 'bridge-mcp/index.md',
    allowedPaths: [],
    mcp: {
        enabled: true,
        server: true
    },

    // Extended settings
    autoStart: false,
    debugMode: false,
    requireConfirmation: true,
    cacheTimeout: 300,
    enabledVault: true,
    enabledMemory: true,
    enabledReasoning: true,
    enabledTools: ['memory', 'reasoning', 'search'],
    memoryFolderPath: 'bridge-mcp/memories',
    reasoningFolderPath: 'bridge-mcp/reasoning',

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
