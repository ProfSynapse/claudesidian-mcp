import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/PersistentChromaClient';
import { 
  fetchWithRetry, 
  validateEmbeddingResponse, 
  logProviderOperation,
  PROVIDER_CONFIGS 
} from '../utils/EmbeddingProviderUtils';

/**
 * OpenAI embedding provider configuration
 */
export const OpenAIProviderConfig: EmbeddingProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'text-embedding-3-small',
      name: 'Text Embedding 3 Small',
      dimensions: 1536,
      description: 'Text Embedding 3 Small (1536 dims) - $0.02/Million Tokens'
    },
    {
      id: 'text-embedding-3-large',
      name: 'Text Embedding 3 Large',
      dimensions: 3072,
      description: 'Text Embedding 3 Large (3072 dims) - $0.13/Million Tokens'
    },
    {
      id: 'text-embedding-ada-002',
      name: 'Text Embedding Ada 002',
      dimensions: 1536,
      description: 'Text Embedding Ada 002 (1536 dims) - $0.10/Million Tokens (Legacy)'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct OpenAI API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('OpenAI', 'initialization', 0, settings.model);
      
      const config = PROVIDER_CONFIGS.openai;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('OpenAI', 'generate embeddings', texts.length, settings.model);
          
          const response = await fetchWithRetry(
            'https://api.openai.com/v1/embeddings',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
              },
              body: JSON.stringify({
                input: texts,
                model: settings.model || 'text-embedding-3-small'
              })
            },
            'OpenAI',
            config.retry
          );
          
          const data = await response.json();
          return validateEmbeddingResponse(data, 'OpenAI');
        }
      };
    } catch (error) {
      console.error('Failed to create OpenAI embedding function:', error);
      return null;
    }
  }
};