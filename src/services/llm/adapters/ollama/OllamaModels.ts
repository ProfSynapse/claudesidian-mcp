/**
 * Ollama Model Definitions
 * Common models available through Ollama
 * Models are pulled on-demand, so this is a reference list
 */

import { ModelSpec } from '../modelTypes';

export const OLLAMA_MODELS: ModelSpec[] = [
  // Popular Llama models
  {
    provider: 'ollama',
    name: 'Llama 3.1 8B',
    apiName: 'llama3.1:8b',
    contextWindow: 128000,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'ollama',
    name: 'Llama 3.1 70B',
    apiName: 'llama3.1:70b',
    contextWindow: 128000,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'ollama',
    name: 'Llama 3 8B',
    apiName: 'llama3:8b',
    contextWindow: 8192,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  // Mistral models
  {
    provider: 'ollama',
    name: 'Mistral 7B',
    apiName: 'mistral:7b',
    contextWindow: 32768,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'ollama',
    name: 'Mixtral 8x7B',
    apiName: 'mixtral:8x7b',
    contextWindow: 32768,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  // Code models
  {
    provider: 'ollama',
    name: 'Code Llama 7B',
    apiName: 'codellama:7b',
    contextWindow: 16384,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  // Vision models
  {
    provider: 'ollama',
    name: 'LLaVA 7B',
    apiName: 'llava:7b',
    contextWindow: 4096,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: true,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  // Other popular models
  {
    provider: 'ollama',
    name: 'Gemma 7B',
    apiName: 'gemma:7b',
    contextWindow: 8192,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'ollama',
    name: 'Phi-3 Mini',
    apiName: 'phi3:3.8b',
    contextWindow: 128000,
    maxTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: false
    }
  }
];

// Default model for Ollama
export const OLLAMA_DEFAULT_MODEL = 'llama3.1:8b';

// Get recommended models
export function getRecommendedOllamaModels(): ModelSpec[] {
  return OLLAMA_MODELS.filter(model => 
    ['llama3.1:8b', 'mistral:7b', 'codellama:7b', 'gemma:7b', 'phi3:3.8b'].includes(model.apiName)
  );
}

// Get models with vision capabilities
export function getVisionOllamaModels(): ModelSpec[] {
  return OLLAMA_MODELS.filter(model => model.capabilities.supportsImages);
}

// Get code-specialized models
export function getCodeOllamaModels(): ModelSpec[] {
  return OLLAMA_MODELS.filter(model => 
    model.apiName.includes('codellama') || model.apiName.includes('code')
  );
}