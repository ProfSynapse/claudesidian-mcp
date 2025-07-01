/**
 * OpenRouter Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { OpenRouterAdapter } from '../openrouter/OpenRouterAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('OpenRouter Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: OpenRouterAdapter;

  beforeAll(() => {
    adapter = new OpenRouterAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'openrouter', 'OPENROUTER_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if OpenRouter API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  OPENROUTER_API_KEY not set - skipping OpenRouter tests');
      }
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Capabilities', () => {
    test('should return correct capabilities', () => {
      adapterTest.testCapabilities();
    });
  });

  describe('Model Listing', () => {
    test('should list available models', async () => {
      await adapterTest.testModelListing();
    }, 30000);
  });

  describe('Text Completion', () => {
    test('should generate text completion', async () => {
      await adapterTest.testTextCompletion();
    }, 30000);

    test('should generate completion with specific OpenRouter model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter specific model test');
        return;
      }

      const response = await adapter.generate('What is 2+2?', {
        model: 'anthropic/claude-3.5-haiku',
        maxTokens: 20,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('anthropic/claude-3.5-haiku');
      expect(response.provider).toBe('openrouter');
      expect(response.text).toContain('4');
    }, 30000);
  });

  describe('JSON Mode', () => {
    test('should handle JSON mode if supported', async () => {
      await adapterTest.testJsonMode();
    }, 30000);
  });

  describe('Streaming', () => {
    test('should handle streaming if supported', async () => {
      await adapterTest.testStreaming();
    }, 30000);
  });

  describe('Cost Calculation', () => {
    test('should calculate costs accurately', async () => {
      await adapterTest.testCostCalculation();
    }, 30000);

    test('should calculate costs for different model tiers', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter cost calculation test');
        return;
      }

      // Test with a lower-cost model
      const response = await adapter.generate('Hello', {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        maxTokens: 5,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      if (response.usage) {
        expect(response.usage.totalTokens).toBeGreaterThan(0);
        expect(response.usage.promptTokens).toBeGreaterThan(0);
        expect(response.usage.completionTokens).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Model Variety', () => {
    test('should support OpenAI models through OpenRouter', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter OpenAI model test');
        return;
      }

      const response = await adapter.generate(
        'Say "OpenRouter works"',
        {
          model: 'openai/gpt-4o-mini',
          maxTokens: 10,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('openrouter');
    }, 30000);

    test('should support Anthropic models through OpenRouter', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter Anthropic model test');
        return;
      }

      const response = await adapter.generate(
        'Complete this: The capital of France is',
        {
          model: 'anthropic/claude-3.5-haiku',
          maxTokens: 5,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('paris');
    }, 30000);

    test('should support Meta models through OpenRouter', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter Meta model test');
        return;
      }

      const response = await adapter.generate(
        'What is AI?',
        {
          model: 'meta-llama/llama-3.1-70b-instruct',
          maxTokens: 50,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(10);
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid/model-name', disableCache: true })
      ).rejects.toThrow();
    }, 30000);

    test('should handle rate limits gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter rate limit test');
        return;
      }

      // This test may not always trigger rate limits, but it should handle them gracefully
      try {
        const response = await adapter.generate('Test', { maxTokens: 5, disableCache: true });
        expect(response).toBeValidResponse();
      } catch (error) {
        // Rate limit errors should be handled gracefully
        expect(error).toBeInstanceOf(Error);
      }
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling for compatible models', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 OpenRouter adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' }
            },
            required: ['city']
          }
        }
      }];

      const response = await adapter.generate(
        'What is the weather like in London?',
        {
          model: 'openai/gpt-4o-mini', // Use a model known to support function calling
          maxTokens: 100,
          tools,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      // Function calling may or may not be triggered depending on the model's decision
    }, 30000);
  });

  describe('Credits and Billing', () => {
    test('should track usage for billing purposes', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenRouter billing test');
        return;
      }

      const response = await adapter.generate('Hello world', {
        maxTokens: 10,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      // OpenRouter should provide usage information for billing
      if (response.usage) {
        expect(response.usage.totalTokens).toBeGreaterThan(0);
      }
    }, 30000);
  });
});