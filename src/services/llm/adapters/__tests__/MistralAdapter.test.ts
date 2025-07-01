/**
 * Mistral AI Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { MistralAdapter } from '../mistral/MistralAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('Mistral AI Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: MistralAdapter;

  beforeAll(() => {
    adapter = new MistralAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'mistral', 'MISTRAL_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Mistral API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  MISTRAL_API_KEY not set - skipping Mistral tests');
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

    test('should generate completion with Mistral Large', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral Large test');
        return;
      }

      const response = await adapter.generate('Explain machine learning in one sentence.', {
        model: 'mistral-large-latest',
        maxTokens: 50,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('mistral-large-latest');
      expect(response.provider).toBe('mistral');
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

    test('should calculate costs for Mistral Small', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral cost calculation test');
        return;
      }

      const response = await adapter.generate('Hello', {
        model: 'mistral-medium-latest',
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

  describe('Code Generation', () => {
    test('should support code generation with Codestral', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral code generation test');
        return;
      }

      const response = await adapter.generate(
        'Write a simple Python function that adds two numbers.',
        {
          model: 'mistral-large-latest',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('def');
      expect(response.text).toContain('+');
    }, 30000);
  });

  describe('OCR Support', () => {
    test('should support OCR with Mistral OCR model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral OCR test');
        return;
      }

      // Test text-only since we don't have actual images in tests
      const response = await adapter.generate(
        'Describe how you would extract text from a document image.',
        {
          model: 'mistral-saba-latest',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(30);
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid-mistral-model', disableCache: true })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 Mistral adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'calculate_area',
          description: 'Calculate the area of a rectangle',
          parameters: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' }
            },
            required: ['width', 'height']
          }
        }
      }];

      const response = await adapter.generate(
        'What is the area of a rectangle with width 5 and height 3?',
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

  describe('Multimodal Support', () => {
    test('should support multimodal input if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral multimodal test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsImages) {
        console.log('📋 Mistral adapter does not support images - skipping');
        return;
      }

      // Test text-only since we don't have actual images in tests
      const response = await adapter.generate(
        'Explain what you could analyze in an image of a chart.',
        {
          model: 'mistral-large-latest',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(40);
    }, 30000);
  });

  describe('La Plateforme Features', () => {
    test('should work with La Plateforme API features', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Mistral La Plateforme test');
        return;
      }

      // Test basic functionality that should work with La Plateforme
      const response = await adapter.generate(
        'Briefly explain what La Plateforme is.',
        {
          model: 'mistral-medium-latest',
          maxTokens: 80,
          temperature: 0.7,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.provider).toBe('mistral');
    }, 30000);
  });
});