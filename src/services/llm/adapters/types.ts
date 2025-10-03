/**
 * Core types for LLM adapters
 * Based on patterns from services/llm/
 */

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
  stream?: boolean;
  stopSequences?: string[];
  enableThinking?: boolean;
  enableInteractiveThinking?: boolean;
  tools?: Tool[];
  enableTools?: boolean;
  webSearch?: boolean;
  fileSearch?: boolean;
  // Tool event callback for live UI updates
  onToolEvent?: (event: 'started' | 'completed', data: any) => void;
  // Cache options
  disableCache?: boolean;
  cacheTTL?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  // Pre-detected tool calls for post-stream execution
  detectedToolCalls?: any[];
  // Conversation history for pingpong pattern (overrides prompt-based message building)
  conversationHistory?: any[];
}

export interface StreamChunk {
  content: string;
  complete: boolean;
  usage?: TokenUsage;
  toolCalls?: ToolCall[];
  toolCallsReady?: boolean; // True when tool calls are complete and safe to execute
}

export interface SearchResult {
  title: string;
  url: string;
  date?: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider?: string;
  usage?: TokenUsage;
  cost?: CostDetails;
  metadata?: Record<string, any>;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  toolCalls?: ToolCall[];
  webSearchResults?: SearchResult[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number; // For thinking models
}

export interface CostDetails {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  rateInputPerMillion: number;
  rateOutputPerMillion: number;
  cached?: {
    tokens: number;
    cost: number;
  };
}

export interface ModelPricing {
  rateInputPerMillion: number;
  rateOutputPerMillion: number;
  currency: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsJSON: boolean;
  supportsImages: boolean;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  supportsImageGeneration?: boolean;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    imageGeneration?: number;
    currency: string;
    lastUpdated: string; // ISO date string
  };
}

export interface Tool {
  type: 'function' | 'web_search' | 'file_search' | 'code_execution';
  function?: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  customHeaders?: Record<string, string>;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsJSON: boolean;
  supportsImages: boolean;
  supportsFunctions: boolean;
  supportsThinking: boolean;
  supportsImageGeneration?: boolean;
  maxContextWindow: number;
  supportedFeatures: string[];
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export type SupportedProvider =
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'mistral'
  | 'openrouter'
  | 'requesty'
  | 'groq'
  | 'perplexity'
  | 'ollama';

export type SupportedModel = 
  // OpenAI
  | 'gpt-4-turbo-preview'
  | 'gpt-4o'
  | 'gpt-3.5-turbo'
  // Google
  | 'gemini-2.5-pro-experimental'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash-001'
  // Anthropic
  | 'claude-4-opus-20250124'
  | 'claude-4-sonnet-20250124'
  | 'claude-3.5-haiku-20241022'
  // Mistral
  | 'mistral-medium-3'
  | 'mistral-small-3.1-25.03'
  | 'codestral-25.01'
  // Perplexity
  | 'sonar'
  | 'sonar-pro'
  | 'sonar-reasoning'
  | 'sonar-reasoning-pro'
  | 'sonar-deep-research'
  | 'r1-1776'
  // OpenRouter (prefix)
  | string // Any OpenRouter model
  // Requesty (prefix)
  | string; // Any Requesty model