import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/ChromaWrapper';
import { 
  fetchWithRetry, 
  logProviderOperation,
  PROVIDER_CONFIGS,
  EmbeddingProviderError
} from '../utils/EmbeddingProviderUtils';

/**
 * Ollama embedding provider configuration
 * Provides local, privacy-focused embedding models
 */
export const OllamaProviderConfig: EmbeddingProviderConfig = {
  id: 'ollama',
  name: 'Ollama (Local)',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: false, // Local models don't need API keys
  models: [
    {
      id: 'nomic-embed-text',
      name: 'Nomic Embed Text',
      dimensions: 768,
      description: 'Nomic Embed Text (768 dims) - FREE (Local)'
    },
    {
      id: 'nomic-embed-text:latest',
      name: 'Nomic Embed Text (Latest)',
      dimensions: 768,
      description: 'Nomic Embed Text Latest (768 dims) - FREE (Local)'
    },
    {
      id: 'mxbai-embed-large',
      name: 'MixedBread AI Embed Large',
      dimensions: 1024,
      description: 'MixedBread AI Embed Large (1024 dims) - FREE (Local)'
    },
    {
      id: 'all-minilm',
      name: 'All-MiniLM',
      dimensions: 384,
      description: 'All-MiniLM (384 dims) - FREE (Local)'
    },
    {
      id: 'snowflake-arctic-embed',
      name: 'Snowflake Arctic Embed',
      dimensions: 768,
      description: 'Snowflake Arctic Embed (768 dims) - FREE (Local)'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct Ollama API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('Ollama', 'initialization', 0, settings.model);
      
      // Add Ollama config if not present
      if (!PROVIDER_CONFIGS.ollama) {
        PROVIDER_CONFIGS.ollama = {
          name: 'Ollama',
          rateLimit: {
            requestsPerMinute: 1000, // Local, no real limit
            requestsPerHour: 60000
          },
          retry: {
            maxRetries: 3,
            baseDelay: 500,
            maxDelay: 5000,
            backoffMultiplier: 2
          },
          batchSize: 10
        };
      }
      
      const config = PROVIDER_CONFIGS.ollama;
      const ollamaUrl = settings.customSettings?.url || 'http://127.0.0.1:11434';
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('Ollama', 'generate embeddings', texts.length, settings.model);
          
          const embeddings: number[][] = [];
          
          // Ollama requires processing texts one by one
          for (const text of texts) {
            const response = await fetchWithRetry(
              `${ollamaUrl}/api/embeddings`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: settings.model || 'nomic-embed-text',
                  prompt: text
                })
              },
              'Ollama',
              config.retry
            );
            
            const data = await response.json();
            if (!data.embedding || !Array.isArray(data.embedding)) {
              throw new EmbeddingProviderError(
                'Invalid response format from Ollama API: missing embedding field',
                undefined,
                'Ollama'
              );
            }
            
            embeddings.push(data.embedding);
          }
          
          return embeddings;
        }
      };
    } catch (error) {
      console.error('Failed to create Ollama embedding function:', error);
      return null;
    }
  }
};