/**
 * Embedding Provider and Memory-related Types
 * Extracted from types.ts for better organization
 */

/**
 * Memory Manager Settings
 */
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
  
  // Rate limiting and budget
  maxTokensPerMonth: number;
  monthlyBudget?: number; // Monthly budget in USD for embedding costs
  apiRateLimitPerMinute: number;
  
  // Fixed chunking settings (no longer configurable)
  chunkStrategy: 'paragraph'; // Always semantic paragraph chunking
  chunkSize: number; // Not used - chunking by semantic boundaries
  chunkOverlap: number; // Not used - no overlap needed
  includeFrontmatter: boolean; // Always true
  
  // Path filters
  excludePaths: string[];
  
  // Content filters (no minimum length required)
  minContentLength: number; // Fixed at 0
  maxTokensPerChunk?: number;  // Maximum tokens per chunk
  ignorePatterns?: string[];   // Patterns to ignore when indexing
  
  // Embedding strategy
  embeddingStrategy: 'idle' | 'startup';
  idleTimeThreshold?: number; // Time in ms to wait before considering the system idle
  
  // Database settings
  dbStoragePath: string;
  vectorStoreType: 'file-based' | 'chromadb-server';
  
  // Maintenance settings (simplified)
  // Orphaned embeddings are automatically deleted when files are removed
  reindexThreshold?: number;  // Days before reindexing files
  
  
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

  // Context-aware embedding loading settings
  contextualEmbedding?: {
    // Memory management
    maxMemoryMB: number; // Maximum memory for loaded embeddings (default: 100MB)
    memoryPressureThreshold: number; // Memory pressure threshold (default: 0.85)
    
    // Recent files cache
    recentFilesLimit: number; // Maximum recent files to track (default: 75)
    recentFilesPriority: 'recent' | 'frequent' | 'mixed'; // Priority strategy (default: 'mixed')
    
    // Workspace loading
    maxWorkspaceFiles: number; // Maximum files per workspace (default: 500)
    preloadConnectedNotes: boolean; // Preload linked notes (default: true)
    
    // Search behavior
    defaultSearchScope: 'recent' | 'workspace' | 'folders'; // Default search scope (default: 'recent')
    allowContextExpansion: boolean; // Allow expanding search context (default: true)
    maxExpansionFiles: number; // Maximum files for context expansion (default: 50)
    
    // Performance settings
    loadingStrategy: 'startup' | 'demand' | 'hybrid'; // When to load embeddings (default: 'hybrid')
    backgroundPreloading: boolean; // Preload likely-needed files (default: true)
    evictionStrategy: 'lru' | 'priority' | 'mixed'; // How to evict when memory full (default: 'mixed')
  };
}

/**
 * Default settings for Memory Manager
 */
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
  chunkStrategy: 'paragraph', // Fixed semantic paragraph chunking
  chunkSize: 0, // Not used - chunking by semantic boundaries
  chunkOverlap: 0, // Not used - no overlap needed  
  includeFrontmatter: true, // Always include frontmatter
  excludePaths: ['.obsidian/**/*', 'node_modules/**/*'],
  minContentLength: 0, // No minimum content length
  maxTokensPerChunk: 8000, // Default to 8000 tokens (just under OpenAI's 8192 limit)
  embeddingStrategy: 'idle',
  idleTimeThreshold: 60000, // 1 minute of idle time before indexing
  dbStoragePath: '',
  vectorStoreType: 'file-based',
  // Orphaned embeddings automatically cleaned up
  
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
  },

  // Context-aware embedding loading settings - NEW MEMORY OPTIMIZATION
  contextualEmbedding: {
    // Memory management - reduces memory usage from 1.1GB+ to ~50-100MB
    maxMemoryMB: 100, // Maximum memory for loaded embeddings
    memoryPressureThreshold: 0.85, // Start evicting at 85% memory pressure
    
    // Recent files cache - tracks recently accessed files for context
    recentFilesLimit: 75, // Maximum recent files to track (50-100 recommended)
    recentFilesPriority: 'mixed', // Balance recent access and frequency
    
    // Workspace loading - context-aware file discovery
    maxWorkspaceFiles: 500, // Maximum files per workspace to load
    preloadConnectedNotes: true, // Automatically load wiki-linked notes
    
    // Search behavior - scoped search to prevent accidental full-vault searches
    defaultSearchScope: 'recent', // Default to recent files for fast searches
    allowContextExpansion: true, // Allow expanding search when needed
    maxExpansionFiles: 50, // Limit context expansion to prevent memory bloat
    
    // Performance settings - optimize loading strategy
    loadingStrategy: 'hybrid', // Load recent files at startup, others on demand
    backgroundPreloading: true, // Preload likely-needed files in background
    evictionStrategy: 'mixed' // Use both LRU and priority for smart eviction
  }
};

/**
 * Provider interface for extensibility
 */
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