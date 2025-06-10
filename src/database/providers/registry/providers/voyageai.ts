import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/ChromaWrapper';
import { 
  fetchWithRetry, 
  validateEmbeddingResponse, 
  logProviderOperation,
  PROVIDER_CONFIGS 
} from '../utils/EmbeddingProviderUtils';

/**
 * Voyage AI embedding provider configuration
 */
export const VoyageAIProviderConfig: EmbeddingProviderConfig = {
  id: 'voyageai',
  name: 'Voyage AI',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'voyage-3-large',
      name: 'Voyage 3 Large',
      dimensions: 1024,
      description: 'Voyage 3 Large (1024 dims) - $0.06/Million Tokens'
    },
    {
      id: 'voyage-3.5',
      name: 'Voyage 3.5',
      dimensions: 1024,
      description: 'Voyage 3.5 (1024 dims) - $0.06/Million Tokens'
    },
    {
      id: 'voyage-3.5-lite',
      name: 'Voyage 3.5 Lite',
      dimensions: 1024,
      description: 'Voyage 3.5 Lite (1024 dims) - $0.02/Million Tokens'
    },
    {
      id: 'voyage-3',
      name: 'Voyage 3',
      dimensions: 1024,
      description: 'Voyage 3 (1024 dims) - $0.06/Million Tokens'
    },
    {
      id: 'voyage-3-lite',
      name: 'Voyage 3 Lite',
      dimensions: 1024,
      description: 'Voyage 3 Lite (1024 dims) - $0.02/Million Tokens'
    },
    {
      id: 'voyage-large-2-instruct',
      name: 'Voyage Large 2 Instruct',
      dimensions: 1536,
      description: 'Voyage Large 2 Instruct (1536 dims) - $0.06/Million Tokens'
    },
    {
      id: 'voyage-code-2',
      name: 'Voyage Code 2',
      dimensions: 1536,
      description: 'Voyage Code 2 (1536 dims) - $0.06/Million Tokens'
    },
    {
      id: 'voyage-multilingual-2',
      name: 'Voyage Multilingual 2',
      dimensions: 1024,
      description: 'Voyage Multilingual 2 (1024 dims) - $0.06/Million Tokens'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct VoyageAI API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('VoyageAI', 'initialization', 0, settings.model);
      
      const config = PROVIDER_CONFIGS.voyageai;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('VoyageAI', 'generate embeddings', texts.length, settings.model);
          
          const response = await fetchWithRetry(
            'https://api.voyageai.com/v1/embeddings',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
              },
              body: JSON.stringify({
                input: texts,
                model: settings.model || 'voyage-3-large',
                input_type: 'document'
              })
            },
            'VoyageAI',
            config.retry
          );
          
          const data = await response.json();
          return validateEmbeddingResponse(data, 'VoyageAI');
        }
      };
    } catch (error) {
      console.error('Failed to create Voyage AI embedding function:', error);
      return null;
    }
  }
};