import { App, TFile, Command, PluginManifest } from 'obsidian';
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


/**
 * Plugin settings interface
 * Includes vault access toggle and version tracking
 */
export interface MCPSettings {
    enabledVault: boolean;
    configFilePath?: string;
    memory?: MemorySettings;
    lastUpdateVersion?: string;
    lastUpdateDate?: string;
}

// Memory Manager Settings
export interface MemorySettings {
    // Core settings
    enabled: boolean;
    apiProvider: 'openai' | 'local';
    openaiApiKey: string;
    openaiOrganization?: string;
    
    // Model settings
    embeddingModel: 'text-embedding-3-small' | 'text-embedding-3-large';
    dimensions: number;
    
    // Rate limiting
    maxTokensPerMonth: number;
    apiRateLimitPerMinute: number;
    
    // Chunking options
    chunkStrategy: 'paragraph' | 'heading' | 'fixed-size' | 'sliding-window';
    chunkSize: number;
    chunkOverlap: number;
    includeFrontmatter: boolean;
    
    // Path filters
    excludePaths: string[];
    
    // Content filters
    minContentLength: number;
    
    // Processing schedule
    indexingSchedule: 'manual' | 'on-save' | 'daily' | 'weekly';
    indexingTime?: string;
    
    // Performance settings
    batchSize: number;
    concurrentRequests: number;
    
    // Database settings
    dbStoragePath: string;
    
    // Maintenance settings
    autoCleanOrphaned: boolean;
    maxDbSize: number;
    pruningStrategy: 'oldest' | 'least-used' | 'manual';
    
    // Search settings
    defaultResultLimit: number;
    includeNeighbors: boolean;
    graphBoostFactor: number;
    
    // Backlink integration
    backlinksEnabled: boolean;
    backlinksWeight: number;
    
    // Advanced query settings
    useFilters: boolean;
    defaultThreshold: number;
}

// Default settings for Memory Manager
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
    enabled: true,
    apiProvider: 'openai',
    openaiApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    dimensions: 1536,
    maxTokensPerMonth: 1000000,
    apiRateLimitPerMinute: 500,
    chunkStrategy: 'paragraph',
    chunkSize: 512,
    chunkOverlap: 50,
    includeFrontmatter: true,
    excludePaths: ['.obsidian/**/*', 'node_modules/**/*'],
    minContentLength: 50,
    indexingSchedule: 'on-save',
    batchSize: 10,
    concurrentRequests: 3,
    dbStoragePath: '',
    autoCleanOrphaned: true,
    maxDbSize: 500,
    pruningStrategy: 'least-used',
    defaultResultLimit: 10,
    includeNeighbors: true,
    graphBoostFactor: 0.3,
    backlinksEnabled: true,
    backlinksWeight: 0.5,
    useFilters: true,
    defaultThreshold: 0.7
};

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: MCPSettings = {
    enabledVault: true,
    configFilePath: undefined,
    memory: DEFAULT_MEMORY_SETTINGS
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

// Embeddings and memory storage types
export interface EmbeddingRecord {
    id: string;              
    filePath: string;        
    lineStart: number;       
    lineEnd: number;         
    content: string;         
    embedding: number[];     
    createdAt: number;
    updatedAt: number;
    metadata: {              
        frontmatter: Record<string, any>;
        tags: string[];
        createdDate?: string;
        modifiedDate?: string;
        links: {
            outgoing: Array<{
                displayText: string;
                targetPath: string;
                position: { line: number; col: number; }
            }>;
            incoming: Array<{
                sourcePath: string;
                displayText: string;
                position: { line: number; col: number; }
            }>;
        }
    }
}

export interface MemoryQueryParams {
    query: string;         
    limit?: number;        
    threshold?: number;    
    filters?: {            
        tags?: string[];     
        paths?: string[];    
        properties?: Record<string, any>;
        dateRange?: {        
            start?: string;
            end?: string;
        }
    },
    graphOptions?: {
        useGraphBoost: boolean;
        boostFactor: number;
        includeNeighbors: boolean;
        maxDistance: number;
        seedNotes?: string[];
    }
}

export interface MemoryQueryResult {
    matches: Array<{
        similarity: number;
        content: string;
        filePath: string;
        lineStart: number;
        lineEnd: number;
        metadata: {
            frontmatter: Record<string, any>;
            tags: string[];
            links: {
                outgoing: Array<{
                    displayText: string;
                    targetPath: string;
                }>;
                incoming: Array<{
                    sourcePath: string;
                    displayText: string;
                }>;
            }
        }
    }>
}

export interface MemoryUsageStats {
    tokensThisMonth: number;
    totalEmbeddings: number;
    dbSizeMB: number;
    lastIndexedDate: string;
    indexingInProgress: boolean;
}

// Provider interface for extensibility
export interface EmbeddingProvider {
    getEmbedding(text: string): Promise<number[]>;
    getDimensions(): number;
    getName(): string;
    getTokenCount(text: string): number;
}

// MCP Server Types
export interface MutualTLSOptions {
    certPath: string;
    keyPath: string;
    caPath?: string;
}

export interface ServerState {
    running: boolean;
    port: number;
    socketPath?: string;
    protocol: 'http' | 'unix';
    startTime?: Date;
    totalRequests: number;
    clientsConnected: number;
    lastError?: string;
    manifest: PluginManifest;
}

// Vault Types
export interface NoteInfo {
    path: string;
    name: string;
    extension: string;
    created: number;
    modified: number;
    size: number;
}

export interface FolderInfo {
    path: string;
    name: string;
    children: (FolderInfo | NoteInfo)[];
}

// Event Types
export interface EventData<T = any> {
    eventName: string;
    data: T;
}

export interface EventSubscriber<T = any> {
    (data: T): void;
}