/**
 * Anthropic Claude Adapter Test Suite
 * Tests actual API calls and pricing calculations
 */

import { AnthropicAdapter } from '../anthropic/AnthropicAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('Anthropic Claude Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: AnthropicAdapter;

  beforeAll(() => {
    adapter = new AnthropicAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'anthropic', 'ANTHROPIC_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Anthropic API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  ANTHROPIC_API_KEY not set - skipping Anthropic tests');
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

    test('should generate completion with Claude 4', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic Claude 4 test');
        return;
      }

      const response = await adapter.generate('What is the capital of France?', {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 20,
        disableCache: true
      });

      expect(response).toBeValidResponse();
      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.provider).toBe('anthropic');
      expect(response.text.toLowerCase()).toContain('paris');
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

    test('should calculate costs for Claude Haiku', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic cost calculation test');
        return;
      }

      const response = await adapter.generate('Hello', {
        model: 'claude-3-5-haiku-latest',
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

  describe('System Prompts', () => {
    test('should handle system prompts correctly', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic system prompt test');
        return;
      }

      const response = await adapter.generate(
        'What should I call you?',
        {
          systemPrompt: 'You are a helpful assistant named Bob.',
          maxTokens: 50,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.toLowerCase()).toContain('bob');
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic error handling test');
        return;
      }

      await expect(
        adapter.generate('test', { model: 'invalid-claude-model', disableCache: true })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Function Calling', () => {
    test('should support function calling if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic function calling test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsFunctions) {
        console.log('📋 Anthropic adapter does not support function calling - skipping');
        return;
      }

      const tools = [{
        type: 'function' as const,
        function: {
          name: 'get_time',
          description: 'Get the current time',
          parameters: {
            type: 'object',
            properties: {
              timezone: { type: 'string' }
            }
          }
        }
      }];

      const response = await adapter.generate(
        'What time is it in UTC?',
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

  describe('Vision Support', () => {
    test('should support image analysis if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic vision test');
        return;
      }

      const capabilities = adapter.getCapabilities();
      if (!capabilities.supportsImages) {
        console.log('📋 Anthropic adapter does not support images - skipping');
        return;
      }

      // Test text-only since we don't have actual images in tests
      const response = await adapter.generate(
        'If I showed you a picture of a cat, what would you be able to tell me about it?',
        {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 150,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(50);
    }, 30000);
  });

  describe('Claude Computer Use', () => {
    test('should support computer use if available', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Anthropic computer use test');
        return;
      }

      // Test if computer use tools are supported
      const capabilities = adapter.getCapabilities();
      const supportsComputerUse = capabilities.supportedFeatures?.includes('computer_use');
      
      if (!supportsComputerUse) {
        console.log('📋 Anthropic adapter does not support computer use - skipping');
        return;
      }

      const response = await adapter.generate(
        'Describe what computer use capabilities enable you to do.',
        {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 100,
          disableCache: true
        }
      );

      expect(response).toBeValidResponse();
      expect(response.text.length).toBeGreaterThan(30);
    }, 30000);
  });
});