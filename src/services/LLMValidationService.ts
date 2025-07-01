/**
 * LLM Validation Service
 * Direct API key validation without full adapter initialization
 */

import OpenAI from 'openai';

export class LLMValidationService {
  /**
   * Validate an API key by making a simple test request
   */
  static async validateApiKey(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      switch (provider) {
        case 'openai':
          return await this.validateOpenAI(apiKey);
        case 'anthropic':
          return await this.validateAnthropic(apiKey);
        case 'google':
          return await this.validateGoogle(apiKey);
        case 'mistral':
          return await this.validateMistral(apiKey);
        case 'groq':
          return await this.validateGroq(apiKey);
        case 'openrouter':
          return await this.validateOpenRouter(apiKey);
        case 'perplexity':
          return await this.validatePerplexity(apiKey);
        case 'requesty':
          return await this.validateRequesty(apiKey);
        default:
          return { success: false, error: `Unsupported provider: ${provider}` };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private static async validateOpenAI(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });

      // Make a simple test request
      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      });

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'OpenAI API key validation failed' 
      };
    }
  }

  private static async validateAnthropic(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Use fetch to test Anthropic API directly
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Anthropic API key validation failed' 
      };
    }
  }

  private static async validateGoogle(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Google API key validation failed' 
      };
    }
  }

  private static async validateMistral(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-tiny',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Mistral API key validation failed' 
      };
    }
  }

  private static async validateGroq(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Groq API key validation failed' 
      };
    }
  }

  private static async validateOpenRouter(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/anthropics/claude-code',
          'X-Title': 'Claude Code Obsidian Plugin'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.2-3b-instruct:free',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'OpenRouter API key validation failed' 
      };
    }
  }

  private static async validatePerplexity(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Perplexity API key validation failed' 
      };
    }
  }

  private static async validateRequesty(apiKey: string): Promise<{ success: boolean; error?: string }> {
    // Requesty doesn't have a public API endpoint for testing
    // For now, just do format validation
    if (apiKey.startsWith('req_') && apiKey.length > 10) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: 'Requesty API key format validation failed' 
      };
    }
  }
}