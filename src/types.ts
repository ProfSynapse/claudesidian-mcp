import { App, TFile, PluginManifest } from 'obsidian';
import { IAgent } from './agents/interfaces/IAgent';
import { WorkspaceContext } from './utils/contextUtils';

/**
 * Mode call definition for chaining to another agent/mode
 */
export interface ModeCall {
  /**
   * Agent name to execute mode on
   */
  tool: string;
  
  /**
   * Mode to execute
   */
  mode: string;
  
  /**
   * Parameters to pass to the mode
   */
  parameters: any;
  
  /**
   * Whether to return results to original agent
   */
  returnHere?: boolean;
  
  /**
   * Whether this mode should be executed regardless of previous mode failures
   * Default is false - execution stops on first failure
   */
  continueOnFailure?: boolean;
  
  /**
   * Mode execution strategy
   * - serial: wait for previous modes to complete before executing (default)
   * - parallel: execute in parallel with other modes marked as parallel
   */
  strategy?: 'serial' | 'parallel';
  
  /**
   * Optional name to identify this mode call in the results
   */
  callName?: string;
}

/**
 * Custom prompt definition for MCP
 */
export interface CustomPrompt {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isEnabled: boolean;
}

/**
 * Custom prompts settings
 */
export interface CustomPromptsSettings {
  enabled: boolean;
  prompts: CustomPrompt[];
}

/**
 * Model configuration with description
 */
export interface ModelConfig {
  description?: string; // User-defined description of when to use this model
}

/**
 * LLM provider configuration
 */
export interface LLMProviderConfig {
  apiKey: string;
  userDescription?: string;
  enabled: boolean;
  models?: { [modelId: string]: ModelConfig }; // Model-specific configurations
}

/**
 * Default model selection settings
 */
export interface DefaultModelSettings {
  provider: string;
  model: string;
}

/**
 * LLM provider settings
 */
export interface LLMProviderSettings {
  providers: {
    [providerId: string]: LLMProviderConfig;
  };
  defaultModel: DefaultModelSettings;
}

/**
 * Server status enum
 */
export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Extend App type to include commands and plugins
 */
declare module 'obsidian' {
    interface App {
        commands: {
            listCommands(): Command[];
            executeCommandById(id: string): Promise<void>;
            commands: { [id: string]: Command };
        };
        plugins: {
            getPlugin(id: string): any;
            enablePlugin(id: string): Promise<void>;
            disablePlugin(id: string): Promise<void>;
            plugins: { [id: string]: any };
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
    customPrompts?: CustomPromptsSettings;
    llmProviders?: LLMProviderSettings;
    lastUpdateVersion?: string;
    lastUpdateDate?: string;
    availableUpdateVersion?: string;
    lastUpdateCheckDate?: string;
}

// Memory Manager Settings
export interface MemorySettings {
    // Core settings
    enabled: boolean;
    embeddingsEnabled: boolean; // Toggle for enabling/disabling embeddings functionality
    apiProvider: string; // Dynamic provider ID (e.g., 'openai', 'gemini', 'cohere')
    
    // Provider-specific settings
    providerSettings: {
        [providerId: string]: {
            apiKey: string;
            model: string;
            dimensions: number;
            organization?: string; // For providers that support organizations
            customSettings?: Record<string, any>; // Provider-specific additional settings
        };
    };
    
    // Rate limiting
    maxTokensPerMonth: number;
    apiRateLimitPerMinute: number;
    
    // Chunking options
    chunkStrategy: 'paragraph' | 'heading' | 'fixed-size' | 'sliding-window' | 'full-document';
    chunkSize: number;
    chunkOverlap: number;
    includeFrontmatter: boolean;
    
    // Path filters
    excludePaths: string[];
    
    // Content filters
    minContentLength: number;
    maxTokensPerChunk?: number;  // Maximum tokens per chunk
    ignorePatterns?: string[];   // Patterns to ignore when indexing
    
    // Embedding strategy
    embeddingStrategy: 'manual' | 'idle' | 'startup';
    idleTimeThreshold?: number; // Time in ms to wait before considering the system idle
    
    // Performance settings
    batchSize: number;
    concurrentRequests: number;
    processingDelay: number; // Milliseconds to wait between batches
    
    // Database settings
    dbStoragePath: string;
    vectorStoreType: 'file-based' | 'chromadb-server';
    
    // Maintenance settings
    autoCleanOrphaned: boolean;
    maxDbSize: number;
    pruningStrategy: 'oldest' | 'least-used' | 'manual';
    reindexThreshold?: number;  // Days before reindexing files
    
    // Search settings
    defaultResultLimit: number;
    includeNeighbors: boolean;
    graphBoostFactor: number;
    
    // Backlink integration
    backlinksEnabled: boolean;
    
    // Advanced query settings
    useFilters: boolean;
    defaultThreshold: number;
    semanticThreshold: number;
    
    // Memory Manager session settings
    autoCreateSessions?: boolean;
    sessionNaming?: 'timestamp' | 'workspace' | 'content';
    
    // Memory Manager state settings
    autoCheckpoint?: boolean;
    checkpointInterval?: number;
    maxStates?: number;
    statePruningStrategy?: 'oldest' | 'least-important' | 'manual';

    // Embedding cost tracking
    costPerThousandTokens?: {
        'text-embedding-3-small': number;
        'text-embedding-3-large': number;
    };
}

// Default settings for Memory Manager
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
    enabled: true,
    embeddingsEnabled: false, // Embeddings disabled by default until API key is set
    apiProvider: 'openai',
    
    // Provider-specific settings
    providerSettings: {
        openai: {
            apiKey: '',
            model: 'text-embedding-3-small',
            dimensions: 1536
        },
        gemini: {
            apiKey: '',
            model: 'models/text-embedding-004',
            dimensions: 768
        },
        cohere: {
            apiKey: '',
            model: 'embed-multilingual-v3.0',
            dimensions: 1024
        },
        mistral: {
            apiKey: '',
            model: 'mistral-embed',
            dimensions: 1024
        },
        voyageai: {
            apiKey: '',
            model: 'voyage-3.5-lite',
            dimensions: 1024
        },
        jina: {
            apiKey: '',
            model: 'jina-embeddings-v3',
            dimensions: 1024
        },
        ollama: {
            apiKey: '', // Not used for local models
            model: 'nomic-embed-text',
            dimensions: 768,
            customSettings: {
                url: 'http://127.0.0.1:11434/'
            }
        }
    },
    maxTokensPerMonth: 1000000,
    apiRateLimitPerMinute: 500,
    chunkStrategy: 'paragraph',
    chunkSize: 512,
    chunkOverlap: 50,
    includeFrontmatter: true,
    excludePaths: ['.obsidian/**/*', 'node_modules/**/*'],
    minContentLength: 50,
    maxTokensPerChunk: 8000, // Default to 8000 tokens (just under OpenAI's 8192 limit)
    embeddingStrategy: 'manual',
    idleTimeThreshold: 60000, // 1 minute of idle time before indexing
    batchSize: 10,
    concurrentRequests: 3,
    processingDelay: 1000, // 1 second delay between batches
    dbStoragePath: '',
    vectorStoreType: 'file-based',
    autoCleanOrphaned: true,
    maxDbSize: 500,
    pruningStrategy: 'least-used',
    defaultResultLimit: 10,
    includeNeighbors: true,
    graphBoostFactor: 0.3,
    backlinksEnabled: true,
    useFilters: true,
    defaultThreshold: 0.3,
    semanticThreshold: 0.5,
    
    // Memory Manager session settings
    autoCreateSessions: true,
    sessionNaming: 'workspace',
    
    // Memory Manager state settings
    autoCheckpoint: false,
    checkpointInterval: 30,
    maxStates: 10,
    statePruningStrategy: 'oldest',
    
    // Cost tracking - per thousand token costs (converted from per million)
    // $0.02 per million = $0.00002 per thousand for text-embedding-3-small
    // $0.13 per million = $0.00013 per thousand for text-embedding-3-large
    costPerThousandTokens: {
        'text-embedding-3-small': 0.00002,
        'text-embedding-3-large': 0.00013
    }
};

/**
 * Default custom prompts settings
 */
export const DEFAULT_CUSTOM_PROMPTS_SETTINGS: CustomPromptsSettings = {
    enabled: true,
    prompts: []
};

/**
 * Default LLM provider settings
 */
export const DEFAULT_LLM_PROVIDER_SETTINGS: LLMProviderSettings = {
    providers: {
        openai: {
            apiKey: '',
            userDescription: 'Versatile models for most tasks with good balance of speed and quality',
            enabled: false
        },
        anthropic: {
            apiKey: '',
            userDescription: 'Excellent for reasoning, analysis, and long-form writing',
            enabled: false
        },
        google: {
            apiKey: '',
            userDescription: 'Latest Gemini models with strong multimodal capabilities',
            enabled: false
        },
        mistral: {
            apiKey: '',
            userDescription: 'European models with strong coding and multilingual support',
            enabled: false
        },
        groq: {
            apiKey: '',
            userDescription: 'Ultra-fast inference speeds for quick responses',
            enabled: false
        },
        openrouter: {
            apiKey: '',
            userDescription: 'Access to 400+ models from multiple providers in one API',
            enabled: false
        },
        requesty: {
            apiKey: '',
            userDescription: 'Premium model access with cost optimization',
            enabled: false
        },
        perplexity: {
            apiKey: '',
            userDescription: 'Web search-enabled models with real-time information and citations',
            enabled: false
        }
    },
    defaultModel: {
        provider: 'openai',
        model: 'gpt-4o'
    }
};

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: MCPSettings = {
    enabledVault: true,
    configFilePath: undefined,
    memory: DEFAULT_MEMORY_SETTINGS,
    customPrompts: DEFAULT_CUSTOM_PROMPTS_SETTINGS,
    llmProviders: DEFAULT_LLM_PROVIDER_SETTINGS,
    lastUpdateVersion: undefined,
    lastUpdateDate: undefined,
    availableUpdateVersion: undefined,
    lastUpdateCheckDate: undefined
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
    estimatedCost?: number;
    modelUsage?: {
        'text-embedding-3-small': number;
        'text-embedding-3-large': number;
    };
}

// Provider interface for extensibility
export interface EmbeddingProvider {
    getEmbedding(text: string): Promise<number[]>;
    getDimensions(): number;
    getName(): string;
    getTokenCount(text: string): number;
    
    /**
     * Close the provider and free resources (optional)
     */
    close?(): void;
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

// Memory Manager Types
export interface WorkspaceSessionInfo {
    id: string;
    name: string;
    workspaceId: string;
    startTime: number;
    endTime?: number;
    isActive: boolean;
    description?: string;
    toolCalls: number;
    tags?: string[];
}

export interface WorkspaceStateInfo {
    id: string;
    name: string;
    workspaceId: string;
    sessionId: string;
    timestamp: number;
    description?: string;
    context?: {
        files: string[];
        traceCount: number;
        tags: string[];
        summary?: string;
    };
}

/**
 * Common parameters structure for standardized agent modes
 * Provides session tracking, workspace context and handoff mechanism
 */
export interface CommonParameters {
  /**
   * Session identifier to track related tool calls
   */
  sessionId: string;
  
  /**
   * Contextual information for this tool call
   * Can be either a string (legacy) or rich object (enhanced)
   */
  context: string | {
    sessionMemory: string;
    toolContext: string;
    primaryGoal: string;
    subgoal: string;
  };
  
  /**
   * Optional workspace context for scoping operations
   * Can be either an object with workspaceId or a JSON string representation
   */
  workspaceContext?: WorkspaceContext | string;
  
  /**
   * Optional handoff to another agent/mode for workflow chaining
   * Can be a single mode call or an array of mode calls for multi-mode execution
   */
  handoff?: ModeCall | ModeCall[];
}

/**
 * Common result structure for standardized agent responses
 */
export interface CommonResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;
  
  /**
   * Error message if success is false
   */
  error?: string;
  
  /**
   * Operation-specific result data
   */
  data?: any;
  
  /**
   * Session identifier used for tracking related operations
   */
  sessionId?: string;
  
  /**
   * Contextual information for this tool call
   * Can be either a string (legacy) or rich object (enhanced)
   */
  context?: string | {
    sessionMemory: string;
    toolContext: string;
    primaryGoal: string;
    subgoal: string;
  };
  
  /**
   * Workspace context that was used (for continuity)
   */
  workspaceContext?: WorkspaceContext;
  
  /**
   * Handoff result if a single handoff was processed
   * @deprecated Use handoffResults for multi-mode execution
   */
  handoffResult?: any;
  
  /**
   * Results from multiple handoffs when executing multiple modes
   * Each entry contains the result of a single mode execution
   */
  handoffResults?: Array<ModeCallResult>;
  
  /**
   * Summary of multi-mode execution results
   */
  handoffSummary?: {
    /**
     * Number of successful mode calls
     */
    successCount: number;
    
    /**
     * Number of failed mode calls
     */
    failureCount: number;
    
    /**
     * Timestamp when execution started
     */
    startTime?: number;
    
    /**
     * Timestamp when execution completed
     */
    endTime?: number;
    
    /**
     * Total duration of all handoffs in milliseconds
     */
    totalDuration?: number;
    
    /**
     * How modes were executed (serial, parallel, mixed)
     */
    executionStrategy: 'serial' | 'parallel' | 'mixed';
  };
}

/**
 * Mode call result for tracking execution outcomes
 */
export interface ModeCallResult extends CommonResult {
  /**
   * Agent name that executed the mode
   */
  tool?: string;
  
  /**
   * Mode that was executed
   */
  mode?: string;
  
  /**
   * Name of the mode call if specified
   */
  callName?: string;
  
  /**
   * Sequence number of this mode call
   */
  sequence?: number;
  
  /**
   * Timestamp when the mode call started
   */
  startTime?: number;
  
  /**
   * Timestamp when the mode call completed
   */
  endTime?: number;
  
  /**
   * Duration of the mode call in milliseconds
   */
  duration?: number;
}