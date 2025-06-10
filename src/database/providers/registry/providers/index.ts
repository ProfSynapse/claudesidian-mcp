import { EmbeddingProviderRegistry } from '../EmbeddingProviderRegistry';
import { OpenAIProviderConfig } from './openai';
import { GeminiProviderConfig } from './gemini';
import { CohereProviderConfig } from './cohere';
import { MistralProviderConfig } from './mistral';
import { VoyageAIProviderConfig } from './voyageai';
import { JinaAIProviderConfig } from './jina';
import { OllamaProviderConfig } from './ollama';

/**
 * Register all available embedding providers
 */
export function registerAllProviders(): void {
  // Register OpenAI
  EmbeddingProviderRegistry.registerProvider(OpenAIProviderConfig);
  
  // Register Google Gemini
  EmbeddingProviderRegistry.registerProvider(GeminiProviderConfig);
  
  // Register Cohere
  EmbeddingProviderRegistry.registerProvider(CohereProviderConfig);
  
  // Register Mistral AI
  EmbeddingProviderRegistry.registerProvider(MistralProviderConfig);
  
  // Register Voyage AI
  EmbeddingProviderRegistry.registerProvider(VoyageAIProviderConfig);
  
  // Register Jina AI
  EmbeddingProviderRegistry.registerProvider(JinaAIProviderConfig);
  
  // Register Ollama (Local)
  EmbeddingProviderRegistry.registerProvider(OllamaProviderConfig);
  
  // Future providers can be registered here
  // EmbeddingProviderRegistry.registerProvider(HuggingFaceProviderConfig);
  // etc.
}

// Auto-register providers when this module is imported
registerAllProviders();