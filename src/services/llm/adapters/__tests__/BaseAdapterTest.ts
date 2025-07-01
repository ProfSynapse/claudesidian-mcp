/**
 * Base adapter test class with common test patterns
 * Provides shared test methods for all adapter implementations
 */

import { BaseAdapter } from '../BaseAdapter';
import { LLMResponse } from '../types';
import { CostCalculator } from '../CostCalculator';

export class BaseAdapterTest {
  protected adapter: BaseAdapter;
  protected providerName: string;
  protected requiredEnvVar: string;

  constructor(adapter: BaseAdapter, providerName: string, requiredEnvVar: string) {
    this.adapter = adapter;
    this.providerName = providerName;
    this.requiredEnvVar = requiredEnvVar;
  }

  /**
   * Check if the provider is available for testing
   */
  isAvailable(): boolean {
    return !!process.env[this.requiredEnvVar];
  }

  /**
   * Skip test if provider is not available
   */
  skipIfNotAvailable(): void {
    if (!this.isAvailable()) {
      console.warn(`⚠️  Skipping ${this.providerName} tests - ${this.requiredEnvVar} not set`);
    }
  }

  /**
   * Standard text completion test
   */
  async testTextCompletion(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn(`Skipping ${this.providerName} text completion test`);
      return;
    }

    const prompt = "Write a short haiku about programming. Respond with only the haiku, no additional text.";
    
    const response = await this.adapter.generate(prompt, {
      maxTokens: 100,
      temperature: 0.7,
      disableCache: true
    });

    // Validate response structure
    expect(response).toBeValidResponse();
    expect(response.provider).toBe(this.providerName);
    expect(response.text.length).toBeGreaterThan(10);
    expect(response.text.length).toBeLessThan(500);

    // Validate usage if present
    if (response.usage) {
      expect(response).toHaveValidUsage();
    }

    console.log(`✅ ${this.providerName} text completion: "${response.text.substring(0, 50)}..."`);
  }

  /**
   * Test JSON mode (if supported)
   */
  async testJsonMode(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn(`Skipping ${this.providerName} JSON mode test`);
      return;
    }

    const capabilities = this.adapter.getCapabilities();
    if (!capabilities.supportsJSON) {
      console.log(`📋 ${this.providerName} does not support JSON mode - skipping`);
      return;
    }

    const prompt = "Return a JSON object with two fields: 'language' set to 'TypeScript' and 'description' set to 'A strongly typed programming language'.";
    
    const response = await this.adapter.generate(prompt, {
      maxTokens: 100,
      jsonMode: true,
      disableCache: true
    });

    expect(response).toBeValidResponse();
    
    // Try to parse as JSON
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(response.text);
      expect(parsedJson).toHaveProperty('language');
      expect(parsedJson).toHaveProperty('description');
      console.log(`✅ ${this.providerName} JSON mode successful`);
    } catch (error) {
      console.warn(`⚠️  ${this.providerName} JSON mode returned invalid JSON: ${response.text}`);
      throw error;
    }
  }

  /**
   * Test streaming (if supported)
   */
  async testStreaming(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn(`Skipping ${this.providerName} streaming test`);
      return;
    }

    const capabilities = this.adapter.getCapabilities();
    if (!capabilities.supportsStreaming) {
      console.log(`📡 ${this.providerName} does not support streaming - skipping`);
      return;
    }

    const prompt = "Count from 1 to 5, one number per line.";
    let chunks: string[] = [];
    let streamComplete = false;

    const response = await this.adapter.generateStream(prompt, {
      maxTokens: 50,
      disableCache: true,
      onToken: (token: string) => {
        chunks.push(token);
      },
      onComplete: (finalResponse: LLMResponse) => {
        streamComplete = true;
        expect(finalResponse).toBeValidResponse();
      }
    });

    expect(response).toBeValidResponse();
    expect(chunks.length).toBeGreaterThan(0);
    expect(streamComplete).toBe(true);
    
    const fullText = chunks.join('');
    expect(fullText).toBe(response.text);
    
    console.log(`✅ ${this.providerName} streaming with ${chunks.length} chunks`);
  }

  /**
   * Test cost calculation accuracy
   */
  async testCostCalculation(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn(`Skipping ${this.providerName} cost calculation test`);
      return;
    }

    const prompt = "Hello, world!";
    
    const response = await this.adapter.generate(prompt, {
      maxTokens: 20,
      disableCache: true
    });

    expect(response).toBeValidResponse();

    // Test cost calculation if usage is available
    if (response.usage) {
      const costBreakdown = await CostCalculator.calculateCostWithTokenCounting(
        this.providerName,
        response.model,
        prompt,
        response.text,
        {
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
          source: 'provider_api'
        }
      );

      if (costBreakdown) {
        expect(costBreakdown.totalCost).toBeGreaterThan(0);
        expect(costBreakdown.inputCost).toBeGreaterThanOrEqual(0);
        expect(costBreakdown.outputCost).toBeGreaterThanOrEqual(0);
        expect(costBreakdown.provider).toBe(this.providerName);
        expect(costBreakdown.model).toBe(response.model);

        console.log(`✅ ${this.providerName} cost: $${costBreakdown.totalCost.toFixed(6)} (${response.usage.totalTokens} tokens)`);
      } else {
        console.warn(`⚠️  ${this.providerName} cost calculation failed - model not in registry`);
      }
    } else {
      console.warn(`⚠️  ${this.providerName} did not return usage information`);
    }
  }

  /**
   * Test model listing
   */
  async testModelListing(): Promise<void> {
    if (!this.isAvailable()) {
      console.warn(`Skipping ${this.providerName} model listing test`);
      return;
    }

    const models = await this.adapter.listModels();
    
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    
    // Check first model structure
    if (models.length > 0) {
      const firstModel = models[0];
      expect(firstModel).toHaveProperty('id');
      expect(firstModel).toHaveProperty('name');
      expect(typeof firstModel?.id).toBe('string');
      expect(typeof firstModel?.name).toBe('string');
    }

    console.log(`✅ ${this.providerName} models: ${models.length} available`);
  }

  /**
   * Test capabilities
   */
  testCapabilities(): void {
    const capabilities = this.adapter.getCapabilities();
    
    expect(capabilities).toHaveProperty('supportsStreaming');
    expect(capabilities).toHaveProperty('supportsJSON');
    expect(capabilities).toHaveProperty('supportsImages');
    expect(capabilities).toHaveProperty('supportsFunctions');
    expect(capabilities).toHaveProperty('maxContextWindow');
    
    expect(typeof capabilities.supportsStreaming).toBe('boolean');
    expect(typeof capabilities.supportsJSON).toBe('boolean');
    expect(typeof capabilities.supportsImages).toBe('boolean');
    expect(typeof capabilities.supportsFunctions).toBe('boolean');
    expect(typeof capabilities.maxContextWindow).toBe('number');
    expect(capabilities.maxContextWindow).toBeGreaterThan(0);

    console.log(`✅ ${this.providerName} capabilities: streaming=${capabilities.supportsStreaming}, JSON=${capabilities.supportsJSON}, images=${capabilities.supportsImages}, functions=${capabilities.supportsFunctions}, context=${capabilities.maxContextWindow}`);
  }

  /**
   * Run all standard tests
   */
  async runAllTests(): Promise<void> {
    console.log(`\n🧪 Testing ${this.providerName} adapter...`);
    
    if (!this.isAvailable()) {
      console.warn(`⚠️  Skipping all ${this.providerName} tests - ${this.requiredEnvVar} not set`);
      return;
    }

    try {
      this.testCapabilities();
      await this.testModelListing();
      await this.testTextCompletion();
      await this.testJsonMode();
      await this.testStreaming();
      await this.testCostCalculation();
      
      console.log(`✅ ${this.providerName} adapter tests completed successfully!`);
    } catch (error) {
      console.error(`❌ ${this.providerName} adapter test failed:`, error);
      throw error;
    }
  }
}