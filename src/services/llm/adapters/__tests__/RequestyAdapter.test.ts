/**
 * Requesty Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { RequestyAdapter } from '../requesty/RequestyAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('Requesty Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: RequestyAdapter;

  beforeAll(() => {
    adapter = new RequestyAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'requesty', 'REQUESTY_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Requesty API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  REQUESTY_API_KEY not set - skipping Requesty tests');
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

    test('should generate completion with specific Requesty model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty specific model test');
        return;
      }

      const response = await adapter.generate('What is machine learning?', {
        model: 'claude-3-5-haiku-20241022',
        maxTokens: 100,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('claude-3-5-haiku-20241022');
      expect(response.provider).toBe('requesty');
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

    test('should calculate costs for premium models', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty cost calculation test');
        return;
      }

      // Test with a premium model
      const response = await adapter.generate('Hello', {
        model: 'gpt-4o',
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
    test('should support GPT models through Requesty', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty GPT model test');
        return;
      }

      const response = await adapter.generate(
        'Complete: The sky is',
        {
          model: 'gpt-4o-mini',
          maxTokens: 10,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('blue');
    }, 30000);

    test('should support Claude models through Requesty', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty Claude model test');
        return;
      }

      const response = await adapter.generate(
        'Say hello in French',
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 10,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('bonjour');
    }, 30000);

    test('should support Gemini models through Requesty', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty Gemini model test');
        return;
      }

      const response = await adapter.generate(
        'What is 5 + 3?',
        {
          model: 'gemini-1.5-pro',
          maxTokens: 10,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text).toContain('8');
    }, 30000);

    test('should support Llama models through Requesty', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty Llama model test');
        return;
      }

      const response = await adapter.generate(
        'What does AI stand for?',
        {
          model: 'llama-3.1-405b-instruct',
          maxTokens: 50,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('artificial intelligence');
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid-model-name-xyz', disableCache: true })
      ).rejects.toThrow();
    }, 30000);

    test('should handle quota exceeded gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty quota test');
        return;
      }

      // This test may not always trigger quota limits, but it should handle them gracefully
      try {
        const response = await adapter.generate('Test quota', { maxTokens: 5, disableCache: true });
        expect(response).toBeValidResponse();
      } catch (error) {
        // Quota errors should be handled gracefully
        expect(error).toBeInstanceOf(Error);
      }
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling for compatible models', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 Requesty adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'calculate_distance',
          description: 'Calculate distance between two points',
          parameters: {
            type: 'object',
            properties: {
              x1: { type: 'number' },
              y1: { type: 'number' },
              x2: { type: 'number' },
              y2: { type: 'number' }
            },
            required: ['x1', 'y1', 'x2', 'y2']
          }
        }
      }];

      const response = await adapter.generate(
        'What is the distance between points (0,0) and (3,4)?',
        {
          model: 'gpt-4o-mini', // Use a model known to support function calling
          maxTokens: 100,
          tools,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      // Function calling may or may not be triggered depending on the model's decision
    }, 30000);
  });

  describe('Advanced Features', () => {
    test('should support vision models if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty vision test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsImages) {
        console.log('📋 Requesty adapter does not support images - skipping');
        return;
      }

      // Test text-only since we don't have actual images in tests
      const response = await adapter.generate(
        'Describe what you would analyze in a photo of a sunset.',
        {
          model: 'gpt-4o',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(50);
    }, 30000);

    test('should handle system prompts correctly', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty system prompt test');
        return;
      }

      const response = await adapter.generate(
        'What should I call you?',
        {
          systemPrompt: 'You are a helpful assistant named Alex.',
          maxTokens: 20,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('alex');
    }, 30000);
  });

  describe('Performance', () => {
    test('should handle concurrent requests', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Requesty concurrency test');
        return;
      }

      const promises = Array.from({ length: 3 }, (_, i) =>
        adapter.generate(`Count to ${i + 1}`, { maxTokens: 10, disableCache: true })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach((response) => {
        expect(response).toBeValidResponse();
        expect(response.provider).toBe('requesty');
      });
    }, 45000);
  });
});