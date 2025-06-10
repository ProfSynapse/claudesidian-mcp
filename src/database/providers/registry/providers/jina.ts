import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/ChromaWrapper';
import { 
  fetchWithRetry, 
  validateEmbeddingResponse, 
  logProviderOperation,
  PROVIDER_CONFIGS 
} from '../utils/EmbeddingProviderUtils';

/**
 * Jina AI embedding provider configuration
 */
export const JinaAIProviderConfig: EmbeddingProviderConfig = {
  id: 'jina',
  name: 'Jina AI',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'jina-embeddings-v3',
      name: 'Jina Embeddings v3',
      dimensions: 1024,
      description: 'Jina Embeddings v3 (1024 dims) - $0.10/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-base-en',
      name: 'Jina Embeddings v2 Base English',
      dimensions: 768,
      description: 'Jina Embeddings v2 Base English (768 dims) - $0.05/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-base-zh',
      name: 'Jina Embeddings v2 Base Chinese',
      dimensions: 768,
      description: 'Jina Embeddings v2 Base Chinese (768 dims) - $0.05/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-base-de',
      name: 'Jina Embeddings v2 Base German',
      dimensions: 768,
      description: 'Jina Embeddings v2 Base German (768 dims) - $0.05/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-base-es',
      name: 'Jina Embeddings v2 Base Spanish',
      dimensions: 768,
      description: 'Jina Embeddings v2 Base Spanish (768 dims) - $0.05/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-base-code',
      name: 'Jina Embeddings v2 Code',
      dimensions: 768,
      description: 'Jina Embeddings v2 Code (768 dims) - $0.05/Million Tokens (Est.)'
    },
    {
      id: 'jina-embeddings-v2-small-en',
      name: 'Jina Embeddings v2 Small English',
      dimensions: 512,
      description: 'Jina Embeddings v2 Small English (512 dims) - $0.02/Million Tokens (Est.)'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct Jina AI API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('Jina AI', 'initialization', 0, settings.model);
      
      // Add Jina config if not present
      if (!PROVIDER_CONFIGS.jina) {
        PROVIDER_CONFIGS.jina = {
          name: 'Jina AI',
          rateLimit: {
            requestsPerMinute: 500,
            requestsPerHour: 10000
          },
          retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2
          },
          batchSize: 100 // Jina supports up to 2048 texts per request
        };
      }
      
      const config = PROVIDER_CONFIGS.jina;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('Jina AI', 'generate embeddings', texts.length, settings.model);
          
          const response = await fetchWithRetry(
            'https://api.jina.ai/v1/embeddings',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
              },
              body: JSON.stringify({
                input: texts,
                model: settings.model || 'jina-embeddings-v3',
                dimensions: settings.dimensions || 1024,
                task: 'retrieval.passage' // Default task for document embedding
              })
            },
            'Jina AI',
            config.retry
          );
          
          const data = await response.json();
          return validateEmbeddingResponse(data, 'Jina AI');
        }
      };
    } catch (error) {
      console.error('Failed to create Jina AI embedding function:', error);
      return null;
    }
  }
};