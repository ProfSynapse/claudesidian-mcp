/**
 * ProviderUtils - Utilities for provider and display name formatting
 */

export class ProviderUtils {
  /**
   * Get display name for provider
   */
  static getProviderDisplayName(providerId: string): string {
    const displayNames: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'mistral': 'Mistral AI',
      'ollama': 'Ollama',
      'openrouter': 'OpenRouter',
      'google': 'Google',
      'cohere': 'Cohere',
      'huggingface': 'Hugging Face'
    };
    return displayNames[providerId] || this.capitalizeString(providerId);
  }

  /**
   * Capitalize agent name for display
   */
  static capitalizeAgentName(agentId: string): string {
    return agentId
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Capitalize a string
   */
  static capitalizeString(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Format model name for display
   */
  static formatModelName(modelId: string, modelName?: string): string {
    if (modelName) {
      return modelName;
    }
    
    // Convert model IDs to readable names
    const modelDisplayNames: Record<string, string> = {
      'gpt-4': 'GPT-4',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'claude-3-opus': 'Claude 3 Opus',
      'claude-3-sonnet': 'Claude 3 Sonnet',
      'claude-3-haiku': 'Claude 3 Haiku',
      'mistral-large': 'Mistral Large',
      'mistral-medium': 'Mistral Medium',
      'mistral-small': 'Mistral Small'
    };

    return modelDisplayNames[modelId] || this.capitalizeString(modelId.replace(/-/g, ' '));
  }

  /**
   * Get provider color for UI theming
   */
  static getProviderColor(providerId: string): string {
    const colors: Record<string, string> = {
      'openai': '#10a37f',
      'anthropic': '#d97757',
      'mistral': '#ff6b35',
      'ollama': '#000000',
      'openrouter': '#8b5cf6',
      'google': '#4285f4',
      'cohere': '#39c6b9',
      'huggingface': '#ff9a00'
    };
    return colors[providerId] || '#6b7280';
  }

  /**
   * Get provider icon (emoji or symbol)
   */
  static getProviderIcon(providerId: string): string {
    const icons: Record<string, string> = {
      'openai': '🤖',
      'anthropic': '🧠',
      'mistral': '🌪️',
      'ollama': '🦙',
      'openrouter': '🔀',
      'google': '🔍',
      'cohere': '🧬',
      'huggingface': '🤗'
    };
    return icons[providerId] || '🤖';
  }

  /**
   * Format context window size for display
   */
  static formatContextWindow(contextWindow: number): string {
    if (contextWindow >= 1000000) {
      return `${(contextWindow / 1000000).toFixed(1)}M tokens`;
    } else if (contextWindow >= 1000) {
      return `${(contextWindow / 1000).toFixed(0)}K tokens`;
    } else {
      return `${contextWindow} tokens`;
    }
  }

  /**
   * Get short provider abbreviation
   */
  static getProviderAbbreviation(providerId: string): string {
    const abbreviations: Record<string, string> = {
      'openai': 'OAI',
      'anthropic': 'ANT',
      'mistral': 'MST',
      'ollama': 'OLL',
      'openrouter': 'OR',
      'google': 'GGL',
      'cohere': 'COH',
      'huggingface': 'HF'
    };
    return abbreviations[providerId] || providerId.substring(0, 3).toUpperCase();
  }

  /**
   * Check if provider supports streaming
   */
  static supportsStreaming(providerId: string): boolean {
    const streamingProviders = [
      'openai',
      'anthropic', 
      'mistral',
      'ollama',
      'openrouter'
    ];
    return streamingProviders.includes(providerId);
  }

  /**
   * Check if provider supports function calling
   */
  static supportsFunctionCalling(providerId: string): boolean {
    const functionCallingProviders = [
      'openai',
      'anthropic',
      'mistral'
    ];
    return functionCallingProviders.includes(providerId);
  }

  /**
   * Get provider capabilities
   */
  static getProviderCapabilities(providerId: string): {
    streaming: boolean;
    functionCalling: boolean;
    imageInput: boolean;
    jsonMode: boolean;
  } {
    return {
      streaming: this.supportsStreaming(providerId),
      functionCalling: this.supportsFunctionCalling(providerId),
      imageInput: ['openai', 'anthropic', 'google'].includes(providerId),
      jsonMode: ['openai', 'mistral'].includes(providerId)
    };
  }
}