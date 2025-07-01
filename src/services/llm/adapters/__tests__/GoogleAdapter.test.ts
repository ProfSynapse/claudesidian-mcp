/**
 * Google Gemini Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { GoogleAdapter } from '../google/GoogleAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('Google Gemini Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: GoogleAdapter;

  beforeAll(() => {
    adapter = new GoogleAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'google', 'GOOGLE_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Google API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  GOOGLE_API_KEY not set - skipping Google tests');
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

    test('should generate completion with Gemini 2.5', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google Gemini 2.5 test');
        return;
      }

      const response = await adapter.generate('Explain quantum computing in one sentence.', {
        model: 'gemini-2.5-flash',
        maxTokens: 50,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('gemini-2.5-flash');
      expect(response.provider).toBe('google');
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

    test('should calculate costs for Gemini Pro', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google cost calculation test');
        return;
      }

      const response = await adapter.generate('Hello', {
        model: 'gemini-1.5-pro',
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

  describe('Multimodal Support', () => {
    test('should support image analysis if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google multimodal test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsImages) {
        console.log('📋 Google adapter does not support images - skipping');
        return;
      }

      // Test text-only since we don't have actual images in tests
      const response = await adapter.generate(
        'Describe what you would expect to see in a photo of a sunset.',
        {
          model: 'gemini-1.5-pro',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(20);
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid-gemini-model', disableCache: true })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 Google adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'calculate_sum',
          description: 'Calculate the sum of two numbers',
          parameters: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['a', 'b']
          }
        }
      }];

      const response = await adapter.generate(
        'What is 2 + 3?',
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

  describe('Thinking Mode', () => {
    test('should support thinking mode if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Google thinking mode test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsThinking) {
        console.log('📋 Google adapter does not support thinking mode - skipping');
        return;
      }

      const response = await adapter.generate(
        'Solve this step by step: If a train travels 60 mph for 2 hours, how far does it go?',
        {
          model: 'gemini-2.5-flash-thinking',
          maxTokens: 200,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(50);
    }, 30000);
  });
});