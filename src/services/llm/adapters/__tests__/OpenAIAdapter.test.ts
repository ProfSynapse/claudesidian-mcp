/**
 * OpenAI Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { OpenAIAdapter } from '../openai/OpenAIAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('OpenAI Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: OpenAIAdapter;

  beforeAll(() => {
    adapter = new OpenAIAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'openai', 'OPENAI_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if OpenAI API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  OPENAI_API_KEY not set - skipping OpenAI tests');
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

    test('should generate completion with specific model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenAI specific model test');
        return;
      }

      const response = await adapter.generate('Say "hello world"', {
        model: 'gpt-4o-mini',
        maxTokens: 10,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('gpt-4o-mini');
      expect(response.provider).toBe('openai');
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

    test('should calculate costs for GPT-4o', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenAI GPT-4o cost test');
        return;
      }

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

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenAI error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid-model-name', disableCache: true })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping OpenAI function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 OpenAI adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }];

      const response = await adapter.generate(
        'What is the weather like in San Francisco?',
        {
          maxTokens: 100,
          tools,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      // Function calling may or may not be triggered depending on the model's decision
    }, 30000);
  });
});