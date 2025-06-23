import { EmbeddingProviderConfig, ProviderSettings } from '../EmbeddingProviderRegistry';
import { ChromaEmbeddingFunction } from '../../chroma/PersistentChromaClient';
import { 
  fetchWithRetry, 
  logProviderOperation,
  PROVIDER_CONFIGS,
  EmbeddingProviderError
} from '../utils/EmbeddingProviderUtils';

/**
 * Google Gemini embedding provider configuration
 */
export const GeminiProviderConfig: EmbeddingProviderConfig = {
  id: 'gemini',
  name: 'Google Gemini',
  packageName: 'direct-api',
  importPath: 'direct-api',
  requiresApiKey: true,
  models: [
    {
      id: 'models/text-embedding-004',
      name: 'Text Embedding 004',
      dimensions: 768,
      description: 'Text Embedding 004 (768 dims) - FREE ⚠️ Data used to improve Google products'
    },
    {
      id: 'models/embedding-001',
      name: 'Text Embedding 001',
      dimensions: 768,
      description: 'Text Embedding 001 (768 dims) - FREE ⚠️ Data used to improve Google products (Legacy)'
    },
    {
      id: 'models/gemini-embedding-001',
      name: 'Gemini Embedding 001',
      dimensions: 3072,
      description: 'Gemini Embedding 001 (3072 dims) - FREE ⚠️ Data used to improve Google products'
    },
    {
      id: 'models/gemini-embedding-exp-03-07',
      name: 'Gemini Embedding Experimental',
      dimensions: 3072,
      description: 'Gemini Embedding Experimental (3072 dims) - FREE ⚠️ Data used to improve Google products'
    }
  ],
  
  createEmbeddingFunction: async (settings: ProviderSettings): Promise<ChromaEmbeddingFunction | null> => {
    try {
      // Direct Google Gemini API implementation (ChromaDB package not available in Obsidian environment)
      logProviderOperation('Google Gemini', 'initialization', 0, settings.model);
      
      const config = PROVIDER_CONFIGS.gemini;
      
      return {
        generate: async (texts: string[]): Promise<number[][]> => {
          logProviderOperation('Google Gemini', 'generate embeddings', texts.length, settings.model);
          
          const embeddings: number[][] = [];
          
          // Process texts one by one (Gemini API doesn't support batch processing for embedContent)
          for (const text of texts) {
            const response = await fetchWithRetry(
              `https://generativelanguage.googleapis.com/v1beta/${settings.model}:embedContent?key=${settings.apiKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  content: {
                    parts: [{ text }]
                  }
                })
              },
              'Google Gemini',
              config.retry
            );
            
            const data = await response.json();
            if (!data.embedding || !data.embedding.values) {
              throw new EmbeddingProviderError(
                'Invalid response format from Google Gemini API: missing embedding.values',
                undefined,
                'Google Gemini'
              );
            }
            
            embeddings.push(data.embedding.values);
          }
          
          return embeddings;
        }
      };
    } catch (error) {
      console.error('Failed to create Google Gemini embedding function:', error);
      return null;
    }
  }
};