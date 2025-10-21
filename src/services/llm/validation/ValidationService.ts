/**
 * LLM Validation Service
 * Direct API key validation without full adapter initialization
 */

import OpenAI from 'openai';
import { requestUrl } from 'obsidian';

export class LLMValidationService {
  private static readonly VALIDATION_TIMEOUT = 10000; // 10 seconds
  private static readonly VALIDATION_DELAY = 2000; // 2 seconds delay before validation

  /**
   * Wrapper for requestUrl with timeout support
   */
  private static async requestWithTimeout(config: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.VALIDATION_TIMEOUT);

      requestUrl(config)
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Validate an API key by making a simple test request
   */
  static async validateApiKey(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Wait a couple seconds before validation as requested
      await new Promise(resolve => setTimeout(resolve, this.VALIDATION_DELAY));
      
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
        dangerouslyAllowBrowser: true,
        timeout: this.VALIDATION_TIMEOUT
      });

      // Make a simple test request
      const response = await client.chat.completions.create({
        model: 'gpt-4.1-nano',
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
      // Use Obsidian's requestUrl to bypass CORS restrictions
      const response = await this.requestWithTimeout({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
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
      const response = await this.requestWithTimeout({
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
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
      const response = await this.requestWithTimeout({
        url: 'https://api.mistral.ai/v1/chat/completions',
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

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
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
      const response = await this.requestWithTimeout({
        url: 'https://api.groq.com/openai/v1/chat/completions',
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

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
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
      console.log('[OpenRouter Validation] Starting validation...');
      
      const requestBody = {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      };
      
      console.log('[OpenRouter Validation] Request body:', requestBody);
      
      const response = await this.requestWithTimeout({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': 'Claudesidian'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[OpenRouter Validation] Response status:', response.status);
      console.log('[OpenRouter Validation] Response body:', response.json);

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
        const errorMessage = errorData.error?.message || JSON.stringify(errorData) || `HTTP ${response.status}`;
        console.error('[OpenRouter Validation] Error:', errorMessage);
        return { 
          success: false, 
          error: errorMessage
        };
      }
    } catch (error: any) {
      console.error('[OpenRouter Validation] Exception:', error);
      return { 
        success: false, 
        error: error.message || 'OpenRouter API key validation failed' 
      };
    }
  }

  private static async validatePerplexity(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.requestWithTimeout({
        url: 'https://api.perplexity.ai/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
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
    try {
      const response = await this.requestWithTimeout({
        url: 'https://router.requesty.ai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      } else {
        const errorData = response.json || {};
        return { 
          success: false, 
          error: errorData.error?.message || `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Requesty API key validation failed' 
      };
    }
  }
}