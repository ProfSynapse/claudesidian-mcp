/**
 * Shared model type definitions
 * Updated June 17, 2025
 */

export interface ModelSpec {
  /** Provider name (openai, google, anthropic, etc.) */
  provider: string;
  /** Human-readable model name */
  name: string;
  /** API identifier used in requests */
  apiName: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Input cost per million tokens in USD */
  inputCostPerMillion: number;
  /** Output cost per million tokens in USD */
  outputCostPerMillion: number;
  /** Model capabilities */
  capabilities: {
    supportsJSON: boolean;
    supportsImages: boolean;
    supportsFunctions: boolean;
    supportsStreaming: boolean;
    supportsThinking: boolean;
  };
}