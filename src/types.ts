export interface MCPSettings {
    // Server Configuration
    autoStart: boolean;
    debugMode: boolean;
    
    // Vault Access
    allowedPaths: string[];
    
    // Security & Performance
    requireConfirmation: boolean;
    cacheTimeout: number;
    
    // Tool Configuration
    enabledVault: boolean;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    enabledTools: string[];
    
    // Tool Paths
    memoryFolderPath: string;    // Add this
    reasoningFolderPath: string; // Add this
}

export const DEFAULT_SETTINGS: MCPSettings = {
    autoStart: false,
    debugMode: false,
    allowedPaths: [],
    requireConfirmation: true,
    cacheTimeout: 300,
    enabledVault: true,
    enabledMemory: true,
    enabledReasoning: true,
    enabledTools: ['memory', 'reasoning', 'search'],
    memoryFolderPath: '',    // Add this
    reasoningFolderPath: '', // Add this
};
