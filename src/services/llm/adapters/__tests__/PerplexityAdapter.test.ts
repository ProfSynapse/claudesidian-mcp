/**
 * Perplexity Adapter Test Suite
 * Tests actual API calls and search capabilities
 */

import { PerplexityAdapter } from '../perplexity/PerplexityAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';

describe('Perplexity Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: PerplexityAdapter;

  beforeAll(() => {
    adapter = new PerplexityAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'perplexity', 'PERPLEXITY_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Perplexity API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  PERPLEXITY_API_KEY not set - skipping Perplexity tests');
      }
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Capabilities', () => {
    test('should return correct capabilities', () => {
      adapterTest.testCapabilities();
    });

    test('should support web search features', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities.supportedFeatures).toContain('web_search');
      expect(capabilities.supportedFeatures).toContain('citations');
      expect(capabilities.supportedFeatures).toContain('search_filtering');
    });
  });

  describe('Model Listing', () => {
    test('should list available models', async () => {
      await adapterTest.testModelListing();
    }, 30000);

    test('should include Sonar models', async () => {
      const models = await adapter.listModels();
      const modelNames = models.map(m => m.id);
      
      expect(modelNames).toContain('sonar');
      expect(modelNames).toContain('sonar-pro');
      expect(modelNames).toContain('sonar-reasoning');
      expect(modelNames).toContain('sonar-reasoning-pro');
      expect(modelNames).toContain('sonar-deep-research');
      expect(modelNames).toContain('r1-1776');
    });
  });

  describe('Text Completion', () => {
    test('should generate text completion', async () => {
      await adapterTest.testTextCompletion();
    }, 30000);

    test('should generate completion with Sonar Pro model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity specific model test');
        return;
      }

      const response = await adapter.generateUncached('What is the current status of AI development?', {
        model: 'sonar-pro',
        maxTokens: 200
      });

      expect(response.text).toBeTruthy();
      expect(response.model).toBe('sonar-pro');
      expect(response.provider).toBe('perplexity');
      expect(response.usage).toBeDefined();
    }, 30000);
  });

  describe('Web Search Features', () => {
    test('should generate completion with citations', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity search test');
        return;
      }

      const response = await adapter.generateUncached('What are the latest developments in quantum computing?', {
        model: 'sonar',
        maxTokens: 200
      });

      expect(response.text).toBeTruthy();
      expect(response.citations).toBeDefined();
      expect(Array.isArray(response.citations)).toBe(true);
    }, 30000);

    test('should use domain filtering', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity domain filter test');
        return;
      }

      const response = await adapter.searchWithDomainFilter(
        'Latest AI research papers',
        ['arxiv.org', 'nature.com'],
        { maxTokens: 150 }
      );

      expect(response.text).toBeTruthy();
      expect(response.citations).toBeDefined();
    }, 30000);

    test('should return related questions', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity related questions test');
        return;
      }

      const response = await adapter.searchWithRelatedQuestions(
        'How does machine learning work?',
        { maxTokens: 150 }
      );

      expect(response.text).toBeTruthy();
      expect(response.relatedQuestions).toBeDefined();
      expect(Array.isArray(response.relatedQuestions)).toBe(true);
    }, 30000);

    test('should use recency filtering', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity recency filter test');
        return;
      }

      const response = await adapter.searchRecent(
        'Latest tech news',
        'week',
        { maxTokens: 150 }
      );

      expect(response.text).toBeTruthy();
      expect(response.citations).toBeDefined();
    }, 30000);
  });

  describe('Reasoning Models', () => {
    test('should work with reasoning models', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity reasoning test');
        return;
      }

      const response = await adapter.generateUncached('Analyze the pros and cons of renewable energy adoption', {
        model: 'sonar-reasoning',
        maxTokens: 300
      });

      expect(response.text).toBeTruthy();
      expect(response.model).toBe('sonar-reasoning');
      expect(response.citations).toBeDefined();
    }, 30000);
  });

  describe('Offline Model', () => {
    test('should work with offline r1-1776 model', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity offline model test');
        return;
      }

      const response = await adapter.generateUncached('Explain the concept of recursion in programming', {
        model: 'r1-1776',
        maxTokens: 200
      });

      expect(response.text).toBeTruthy();
      expect(response.model).toBe('r1-1776');
      // Offline model should not have citations
      expect(response.citations).toEqual([]);
    }, 30000);
  });

  describe('Streaming', () => {
    test('should support streaming responses', async () => {
      await adapterTest.testStreamingResponse();
    }, 30000);

    test('should stream with citations in metadata', async () => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Perplexity streaming with citations test');
        return;
      }

      let tokens: string[] = [];
      const response = await adapter.generateStream('What is artificial intelligence?', {
        model: 'sonar',
        maxTokens: 150,
        onToken: (token) => tokens.push(token)
      });

      expect(tokens.length).toBeGreaterThan(0);
      expect(response.text).toBeTruthy();
      expect(response.citations).toBeDefined();
      expect(response.metadata?.streamed).toBe(true);
    }, 30000);
  });

  describe('JSON Mode', () => {
    test('should support JSON mode responses', async () => {
      await adapterTest.testJSONMode();
    }, 30000);
  });

  describe('Cost Calculation', () => {
    test('should calculate costs for responses', async () => {
      await adapterTest.testCostCalculation();
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      await adapterTest.testInvalidModel();
    }, 30000);

    test('should handle rate limiting', async () => {
      await adapterTest.testRateLimit();
    }, 30000);
  });

  describe('Caching', () => {
    test('should support response caching', async () => {
      await adapterTest.testCaching();
    }, 30000);
  });

  describe('Model Information', () => {
    test('should provide model pricing information', async () => {
      const pricing = await adapter.getModelPricing('sonar-pro');
      expect(pricing).toBeDefined();
      expect(pricing?.rateInputPerMillion).toBeGreaterThan(0);
      expect(pricing?.rateOutputPerMillion).toBeGreaterThan(0);
      expect(pricing?.currency).toBe('USD');
    });

    test('should return null for unknown model pricing', async () => {
      const pricing = await adapter.getModelPricing('unknown-model');
      expect(pricing).toBeNull();
    });
  });
});