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
  
  // PHASE 1 COMPATIBILITY: Keep for settings migration
  /** @deprecated Will be removed in next major version. Using score-based ranking instead. */
  semanticThreshold?: number;
  
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
  autoCleanOrphaned: true,
  maxDbSize: 500,
  pruningStrategy: 'least-used',
  defaultResultLimit: 10,
  includeNeighbors: true,
  graphBoostFactor: 0.3,
  backlinksEnabled: true,
  useFilters: true,
  defaultThreshold: 0.3,
  
  // PHASE 1 COMPATIBILITY: Keep for settings migration
  semanticThreshold: 0.5, // Will be ignored by search logic
  
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