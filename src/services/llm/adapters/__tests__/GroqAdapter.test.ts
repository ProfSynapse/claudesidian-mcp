/**
 * Groq Adapter Test Suite
 * Tests ultra-fast inference, extended usage metrics, and performance benchmarks
 */

import { GroqAdapter } from '../groq/GroqAdapter';
import { BaseAdapterTest } from './BaseAdapterTest';
import { GROQ_MODELS, GROQ_MODEL_CATEGORIES } from '../groq/GroqModels';

describe('Groq Adapter', () => {
  let adapterTest: BaseAdapterTest;
  let adapter: GroqAdapter;

  beforeAll(() => {
    adapter = new GroqAdapter();
    adapterTest = new BaseAdapterTest(adapter, 'groq', 'GROQ_API_KEY');
  });

  describe('Adapter Availability', () => {
    test('should check if Groq API key is available', () => {
      const isAvailable = adapterTest.isAvailable();
      if (!isAvailable) {
        console.warn('⚠️  GROQ_API_KEY not set - skipping Groq tests');
      }
      expect(typeof isAvailable).toBe('boolean');
    });

    test('should have correct base URL', () => {
      expect(adapter.baseUrl).toBe('https://api.groq.com/openai/v1');
    });

    test('should have correct provider name', () => {
      expect(adapter.name).toBe('groq');
    });
  });

  describe('Capabilities', () => {
    test('should return correct capabilities', () => {
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities.supportsStreaming).toBe(true);
      expect(capabilities.supportsJSON).toBe(true);
      expect(capabilities.supportsImages).toBe(true); // Via vision models
      expect(capabilities.supportsFunctions).toBe(true);
      expect(capabilities.supportsThinking).toBe(true); // Via reasoning models
      expect(capabilities.maxContextWindow).toBe(131072);
      
      // Check Groq-specific features
      expect(capabilities.supportedFeatures).toContain('ultra_fast_inference');
      expect(capabilities.supportedFeatures).toContain('extended_usage_metrics');
      expect(capabilities.supportedFeatures).toContain('vision');
      expect(capabilities.supportedFeatures).toContain('audio_transcription');
      expect(capabilities.supportedFeatures).toContain('compound_models');
      expect(capabilities.supportedFeatures).toContain('reasoning');
    });
  });

  describe('Model Management', () => {
    test('should list available models', async () => {
      const models = await adapter.listModels();
      
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      
      // Check that we have the expected model categories
      const modelIds = models.map(m => m.id);
      expect(modelIds).toContain('llama-3.1-70b-versatile');
      expect(modelIds).toContain('llama-3.1-8b-instant');
      expect(modelIds).toContain('llama-3.2-90b-vision-preview');
      expect(modelIds).toContain('whisper-large-v3');
    });

    test('should validate supported models', () => {
      // Test with valid model
      expect(() => {
        adapter.setModel('llama-3.1-70b-versatile');
      }).not.toThrow();

      // Test model capability checking
      expect(adapter.supportsCapability('llama-3.2-90b-vision-preview', 'supportsImages')).toBe(true);
      expect(adapter.supportsCapability('llama-3.1-8b-instant', 'supportsImages')).toBe(false);
      expect(adapter.supportsCapability('llama-3.1-405b-reasoning', 'supportsThinking')).toBe(true);
    });

    test('should get recommended models for use cases', () => {
      expect(adapter.getRecommendedModel('speed')).toBe('llama-3.1-8b-instant');
      expect(adapter.getRecommendedModel('quality')).toBe('llama-3.1-70b-versatile');
      expect(adapter.getRecommendedModel('vision')).toBe('llama-3.2-90b-vision-preview');
      expect(adapter.getRecommendedModel('audio')).toBe('whisper-large-v3');
      expect(adapter.getRecommendedModel('reasoning')).toBe('llama-3.1-405b-reasoning');
    });
  });

  describe('Model Categories', () => {
    test('should have correct model categories', () => {
      expect(GROQ_MODEL_CATEGORIES.FAST_TEXT).toContain('llama-3.1-8b-instant');
      expect(GROQ_MODEL_CATEGORIES.QUALITY_TEXT).toContain('llama-3.1-70b-versatile');
      expect(GROQ_MODEL_CATEGORIES.VISION).toContain('llama-3.2-90b-vision-preview');
      expect(GROQ_MODEL_CATEGORIES.AUDIO).toContain('whisper-large-v3');
      expect(GROQ_MODEL_CATEGORIES.REASONING).toContain('llama-3.1-405b-reasoning');
    });

    test('should filter models by category', () => {
      const fastModels = GROQ_MODELS.filter(m => 
        GROQ_MODEL_CATEGORIES.FAST_TEXT.includes(m.apiName)
      );
      expect(fastModels.length).toBeGreaterThan(0);
      
      const visionModels = GROQ_MODELS.filter(m => 
        GROQ_MODEL_CATEGORIES.VISION.includes(m.apiName)
      );
      expect(visionModels.length).toBeGreaterThan(0);
      expect(visionModels.every(m => m.capabilities.supportsImages)).toBe(true);
    });
  });

  describe('Pricing', () => {
    test('should return pricing information', async () => {
      const pricing = await adapter.getModelPricing('llama-3.1-70b-versatile');
      
      expect(pricing).not.toBeNull();
      expect(pricing!.currency).toBe('USD');
      expect(pricing!.rateInputPerMillion).toBeGreaterThan(0);
      expect(pricing!.rateOutputPerMillion).toBeGreaterThan(0);
    });

    test('should return null for unknown models', async () => {
      const pricing = await adapter.getModelPricing('unknown-model');
      expect(pricing).toBeNull();
    });
  });

  // Performance and integration tests (only run if API key is available)
  describe('Text Generation', () => {
    beforeEach(() => {
      if (!adapterTest.isAvailable()) {
        console.warn('Skipping Groq integration tests - API key not available');
      }
    });

    test('should generate text completion with performance metrics', async () => {
      if (!adapterTest.isAvailable()) return;

      const startTime = Date.now();
      const response = await adapter.generate('Write a haiku about speed.');
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.text).toBeTruthy();
      expect(response.provider).toBe('groq');
      expect(response.usage).toBeDefined();
      expect(response.usage!.totalTokens).toBeGreaterThan(0);

      // Check for Groq-specific metadata
      expect(response.metadata).toBeDefined();
      expect(response.metadata!.groqMetrics).toBeDefined();
      
      // Performance assertion - Groq should be fast!
      console.log(`🚀 Groq response time: ${responseTime}ms`);
      if (response.metadata!.groqMetrics?.tokensPerSecond) {
        console.log(`⚡ Tokens per second: ${response.metadata!.groqMetrics.tokensPerSecond}`);
        expect(response.metadata!.groqMetrics.tokensPerSecond).toBeGreaterThan(50); // Should be much faster
      }
    }, 15000);

    test('should generate with specific fast model', async () => {
      if (!adapterTest.isAvailable()) return;

      const response = await adapter.generate('Count to 5.', {
        model: 'llama-3.1-8b-instant'
      });

      expect(response.text).toBeTruthy();
      expect(response.model).toBe('llama-3.1-8b-instant');
      expect(response.usage).toBeDefined();
    }, 10000);

    test('should generate JSON response', async () => {
      if (!adapterTest.isAvailable()) return;

      const response = await adapter.generate(
        'Generate a JSON object with name and age fields for a person.',
        { jsonMode: true }
      );

      expect(response.text).toBeTruthy();
      expect(() => JSON.parse(response.text)).not.toThrow();
      
      const parsed = JSON.parse(response.text);
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('age');
    }, 15000);
  });

  describe('Streaming', () => {
    test('should stream text generation with performance tracking', async () => {
      if (!adapterTest.isAvailable()) return;

      let tokenCount = 0;
      let streamedText = '';
      const startTime = Date.now();

      const response = await adapter.generateStream('Write a short story about a robot.', {
        onToken: (token) => {
          tokenCount++;
          streamedText += token;
        }
      });

      const endTime = Date.now();
      const streamTime = endTime - startTime;

      expect(response.text).toBeTruthy();
      expect(streamedText).toBe(response.text);
      expect(tokenCount).toBeGreaterThan(0);
      
      console.log(`🌊 Stream time: ${streamTime}ms, Tokens: ${tokenCount}`);
      
      // Check for extended usage metrics
      if (response.metadata?.groqMetrics) {
        expect(response.metadata.groqMetrics.totalTime).toBeDefined();
        console.log(`📊 Groq metrics:`, response.metadata.groqMetrics);
      }
    }, 20000);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!adapterTest.isAvailable()) return;

      await expect(
        adapter.generate('Test', { model: 'invalid-model' })
      ).rejects.toThrow(/not supported by Groq/);
    });

    test('should handle network errors gracefully', async () => {
      // Create adapter with invalid API key to simulate auth error
      const invalidAdapter = new GroqAdapter();
      (invalidAdapter as any).apiKey = 'invalid-key';

      await expect(
        invalidAdapter.generate('Test')
      ).rejects.toThrow();
    });
  });

  describe('Performance Benchmarks', () => {
    test('should demonstrate ultra-fast inference', async () => {
      if (!adapterTest.isAvailable()) return;

      const testPrompts = [
        'Hello',
        'What is 2+2?',
        'Name three colors.',
        'Write one sentence.',
        'Count to 3.'
      ];

      const results: Array<{
        prompt: string;
        responseTime: number;
        tokens: number;
        tokensPerSecond?: number;
      }> = [];
      
      for (const prompt of testPrompts) {
        const startTime = Date.now();
        const response = await adapter.generate(prompt, {
          model: 'llama-3.1-8b-instant',
          maxTokens: 50
        });
        const endTime = Date.now();
        
        results.push({
          prompt,
          responseTime: endTime - startTime,
          tokens: response.usage?.completionTokens || 0,
          tokensPerSecond: response.metadata?.groqMetrics?.tokensPerSecond
        });
      }

      console.log('🏁 Groq Performance Benchmark Results:');
      results.forEach(result => {
        console.log(`  "${result.prompt}": ${result.responseTime}ms, ${result.tokensPerSecond || 'N/A'} tokens/sec`);
      });

      // Average response time should be reasonable for short prompts
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      console.log(`📈 Average response time: ${avgResponseTime.toFixed(2)}ms`);
      
      expect(avgResponseTime).toBeLessThan(5000); // Should be much faster than 5 seconds
    }, 30000);
  });

  describe('Cache Performance', () => {
    test('should demonstrate cache performance', async () => {
      if (!adapterTest.isAvailable()) return;

      const prompt = 'What is the capital of France?';
      
      // First request (uncached)
      const startTime1 = Date.now();
      const response1 = await adapter.generate(prompt);
      const endTime1 = Date.now();
      const uncachedTime = endTime1 - startTime1;

      expect(response1.metadata?.cached).toBe(false);
      
      // Second request (should be cached)
      const startTime2 = Date.now();
      const response2 = await adapter.generate(prompt);
      const endTime2 = Date.now();
      const cachedTime = endTime2 - startTime2;

      expect(response2.metadata?.cached).toBe(true);
      expect(response2.text).toBe(response1.text);
      
      console.log(`💾 Cache performance: Uncached: ${uncachedTime}ms, Cached: ${cachedTime}ms`);
      expect(cachedTime).toBeLessThan(uncachedTime);
      
      // Check cache metrics
      const metrics = adapter.getPerformanceMetrics();
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    }, 20000);
  });
});