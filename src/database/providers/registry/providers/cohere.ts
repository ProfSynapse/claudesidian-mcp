import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/ChromaWrapper';
import { 
  fetchWithRetry, 
  validateEmbeddingResponse, 
  logProviderOperation,
  PROVIDER_CONFIGS 
} from '../utils/EmbeddingProviderUtils';

/**
 * Cohere embedding provider configuration
 */
export const CohereProviderConfig: EmbeddingProviderConfig = {
  id: 'cohere',
  name: 'Cohere',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'embed-english-v3.0',
      name: 'Embed English v3.0',
      dimensions: 1024,
      description: 'Embed English v3.0 (1024 dims) - $0.10/Million Tokens'
    },
    {
      id: 'embed-multilingual-v3.0',
      name: 'Embed Multilingual v3.0',
      dimensions: 1024,
      description: 'Embed Multilingual v3.0 (1024 dims) - $0.10/Million Tokens'
    },
    {
      id: 'embed-english-light-v3.0',
      name: 'Embed English Light v3.0',
      dimensions: 384,
      description: 'Embed English Light v3.0 (384 dims) - $0.10/Million Tokens'
    },
    {
      id: 'embed-multilingual-light-v3.0',
      name: 'Embed Multilingual Light v3.0',
      dimensions: 384,
      description: 'Embed Multilingual Light v3.0 (384 dims) - $0.10/Million Tokens'
    },
    {
      id: 'embed-english-v2.0',
      name: 'Embed English v2.0',
      dimensions: 4096,
      description: 'Embed English v2.0 (4096 dims) - $0.10/Million Tokens (Legacy)'
    },
    {
      id: 'embed-multilingual-v2.0',
      name: 'Embed Multilingual v2.0',
      dimensions: 768,
      description: 'Embed Multilingual v2.0 (768 dims) - $0.10/Million Tokens (Legacy)'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct Cohere API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('Cohere', 'initialization', 0, settings.model);
      
      const config = PROVIDER_CONFIGS.cohere;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('Cohere', 'generate embeddings', texts.length, settings.model);
          
          const response = await fetchWithRetry(
            'https://api.cohere.ai/v1/embed',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
              },
              body: JSON.stringify({
                texts: texts,
                model: settings.model || 'embed-english-v3.0',
                input_type: 'search_document'
              })
            },
            'Cohere',
            config.retry
          );
          
          const data = await response.json();
          return validateEmbeddingResponse(data, 'Cohere', 'embeddings');
        }
      };
    } catch (error) {
      console.error('Failed to create Cohere embedding function:', error);
      return null;
    }
  }
};