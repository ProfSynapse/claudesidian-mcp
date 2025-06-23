import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/PersistentChromaClient';
import { 
  fetchWithRetry, 
  validateEmbeddingResponse, 
  logProviderOperation,
  PROVIDER_CONFIGS 
} from '../utils/EmbeddingProviderUtils';

/**
 * Mistral AI embedding provider configuration
 */
export const MistralProviderConfig: EmbeddingProviderConfig = {
  id: 'mistral',
  name: 'Mistral AI',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'mistral-embed',
      name: 'Mistral Embed',
      dimensions: 1024,
      description: 'Mistral Embed (1024 dims) - $0.01/Million Tokens'
    },
    {
      id: 'codestral-embed-2505',
      name: 'Codestral Embed',
      dimensions: 1024,
      description: 'Codestral Embed (1024 dims) - $0.15/Million Tokens'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct Mistral API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('Mistral', 'initialization', 0, settings.model);
      
      const config = PROVIDER_CONFIGS.mistral;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('Mistral', 'generate embeddings', texts.length, settings.model);
          
          const response = await fetchWithRetry(
            'https://api.mistral.ai/v1/embeddings',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
              },
              body: JSON.stringify({
                model: settings.model || 'mistral-embed',
                input: texts
              })
            },
            'Mistral',
            config.retry
          );
          
          const data = await response.json();
          return validateEmbeddingResponse(data, 'Mistral');
        }
      };
    } catch (error) {
      console.error('Failed to create Mistral embedding function:', error);
      return null;
    }
  }
};