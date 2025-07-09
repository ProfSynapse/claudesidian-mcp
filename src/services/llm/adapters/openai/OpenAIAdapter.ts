/**
 * OpenAI Adapter with Responses API support
 * Supports latest OpenAI features including the new Responses API
 * Based on 2025 API documentation
 */

import OpenAI from 'openai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing 
} from '../types';
import { ModelRegistry } from '../ModelRegistry';

export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai';
  readonly baseUrl = 'https://api.openai.com/v1';
  
  private client: OpenAI;

  constructor(apiKey: string) {
    super(apiKey, 'gpt-4o');
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true, // Required for Obsidian plugin environment
    });
    
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Route deep research models to specialized handler
      if (this.isDeepResearchModel(model)) {
        return await this.generateWithDeepResearch(prompt, options);
      }
      
      // Use Chat Completions API for standard models
      return await this.generateWithChatCompletions(prompt, options);
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Deep research models don't support traditional streaming
      // Instead, we provide progress updates during the research process
      if (this.isDeepResearchModel(model)) {
        return await this.generateWithDeepResearchStreaming(prompt, options);
      }

      // Standard streaming for regular models
      const streamParams: any = {
        model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        stream: true
      };

      if (options?.temperature !== undefined) streamParams.temperature = options.temperature;
      if (options?.maxTokens !== undefined) streamParams.max_tokens = options.maxTokens;
      if (options?.jsonMode) streamParams.response_format = { type: 'json_object' };
      if (options?.stopSequences) streamParams.stop = options.stopSequences;
      if (options?.tools) streamParams.tools = options.tools;

      const stream = await this.client.chat.completions.create(streamParams);

      let fullText = '';
      let usage: any = undefined;
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

      for await (const chunk of stream as any) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          options?.onToken?.(delta);
        }
        
        if (chunk.usage) {
          usage = chunk.usage;
        }

        if (chunk.choices[0]?.finish_reason) {
          const reason = chunk.choices[0].finish_reason;
          if (reason === 'stop' || reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
            finishReason = reason;
          }
        }
      }

      const extractedUsage = this.extractUsage({ usage });
      const response = await this.buildLLMResponse(
        fullText,
        model,
        extractedUsage,
        undefined,
        finishReason
      );

      if (options?.onComplete) {
        options.onComplete(response);
      }
      return response;
    } catch (error) {
      options?.onError?.(error as Error);
      throw this.handleError(error, 'streaming generation');
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use centralized model registry instead of API call
      const openaiModels = ModelRegistry.getProviderModels('openai');
      return openaiModels.map(model => ModelRegistry.toModelInfo(model));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  // Deep research model detection
  private isDeepResearchModel(model: string): boolean {
    return model.includes('deep-research');
  }

  // Deep research streaming handler with progress updates
  private async generateWithDeepResearchStreaming(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    
    // Build input format for Deep Research API
    const input: any[] = [];
    
    // Add system message if provided
    if (options?.systemPrompt) {
      input.push({
        role: 'developer',
        content: [{ type: 'input_text', text: options.systemPrompt }]
      });
    }
    
    // Add user message
    input.push({
      role: 'user', 
      content: [{ type: 'input_text', text: prompt }]
    });

    const requestParams: any = {
      model,
      input,
      reasoning: { summary: 'auto' },
      tools: [{ type: 'web_search_preview' }], // Default tool for deep research
      background: true // Enable async processing
    };

    // Add optional tools if specified
    if (options?.tools && options.tools.length > 0) {
      // Convert tools to Deep Research API format
      const drTools = options.tools.map(tool => {
        if (tool.type === 'function') {
          return { type: 'code_interpreter', container: { type: 'auto', file_ids: [] } };
        }
        return { type: tool.type };
      });
      requestParams.tools = [...requestParams.tools, ...drTools];
    }

    // Submit the deep research request
    console.log('Submitting deep research request for model:', model);
    const response = await (this.client as any).responses.create(requestParams);
    
    // Poll for completion with progress updates
    let finalResponse = response;
    if (response.status === 'in_progress' || !this.isDeepResearchComplete(response)) {
      finalResponse = await this.pollForCompletionWithStreaming(response.id, model, options);
    }

    // Extract the final report from the output array
    const result = await this.parseDeepResearchResponse(finalResponse, model);
    
    if (options?.onComplete) {
      options.onComplete(result);
    }
    
    return result;
  }

  // Deep research handler with async processing
  private async generateWithDeepResearch(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    
    // Build input format for Deep Research API
    const input: any[] = [];
    
    // Add system message if provided
    if (options?.systemPrompt) {
      input.push({
        role: 'developer',
        content: [{ type: 'input_text', text: options.systemPrompt }]
      });
    }
    
    // Add user message
    input.push({
      role: 'user', 
      content: [{ type: 'input_text', text: prompt }]
    });

    const requestParams: any = {
      model,
      input,
      reasoning: { summary: 'auto' },
      tools: [{ type: 'web_search_preview' }], // Default tool for deep research
      background: true // Enable async processing
    };

    // Add optional tools if specified
    if (options?.tools && options.tools.length > 0) {
      // Convert tools to Deep Research API format
      const drTools = options.tools.map(tool => {
        if (tool.type === 'function') {
          return { type: 'code_interpreter', container: { type: 'auto', file_ids: [] } };
        }
        return { type: tool.type };
      });
      requestParams.tools = [...requestParams.tools, ...drTools];
    }

    // Submit the deep research request
    console.log('Submitting deep research request for model:', model);
    const response = await (this.client as any).responses.create(requestParams);
    
    // Poll for completion if response is not immediately ready
    let finalResponse = response;
    if (response.status === 'in_progress' || !this.isDeepResearchComplete(response)) {
      finalResponse = await this.pollForCompletion(response.id, model);
    }

    // Extract the final report from the output array
    return this.parseDeepResearchResponse(finalResponse, model);
  }

  // Check if deep research response is complete
  private isDeepResearchComplete(response: any): boolean {
    // Check if we have output with final content
    return response.output && 
           response.output.length > 0 && 
           response.output.some((item: any) => 
             item.type === 'message' && 
             item.content && 
             item.content.length > 0 &&
             item.content[0].text
           );
  }

  // Poll for deep research completion with streaming updates
  private async pollForCompletionWithStreaming(responseId: string, model: string, options?: StreamOptions, maxWaitTime = 300000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = model.includes('o4-mini') ? 2000 : 5000; // Faster polling for mini model
    
    console.log(`Polling for deep research completion (model: ${model}, interval: ${pollInterval}ms)`);
    
    // Send initial progress update
    if (options?.onToken) {
      options.onToken('🔍 Starting deep research...\n');
    }
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Retrieve current status
        const response = await (this.client as any).responses.retrieve(responseId);
        
        if (this.isDeepResearchComplete(response)) {
          console.log('Deep research completed successfully');
          if (options?.onToken) {
            options.onToken('✅ Research complete! Generating final report...\n');
          }
          return response;
        }
        
        if (response.status === 'failed' || response.status === 'error') {
          throw new Error(`Deep research failed: ${response.error || 'Unknown error'}`);
        }
        
        // Send progress updates to stream
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const progressMessage = `🔄 Research in progress... (${elapsed}s elapsed)\n`;
        
        if (options?.onToken) {
          options.onToken(progressMessage);
        }
        
        console.log(`Deep research in progress... (${elapsed}s elapsed)`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error('Error polling for completion:', error);
        if (options?.onError) {
          options.onError(error as Error);
        }
        throw this.handleError(error, 'deep research polling');
      }
    }
    
    throw new Error(`Deep research timed out after ${maxWaitTime / 1000} seconds`);
  }

  // Poll for deep research completion
  private async pollForCompletion(responseId: string, model: string, maxWaitTime = 300000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = model.includes('o4-mini') ? 2000 : 5000; // Faster polling for mini model
    
    console.log(`Polling for deep research completion (model: ${model}, interval: ${pollInterval}ms)`);
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Retrieve current status (this is a hypothetical API call)
        const response = await (this.client as any).responses.retrieve(responseId);
        
        if (this.isDeepResearchComplete(response)) {
          console.log('Deep research completed successfully');
          return response;
        }
        
        if (response.status === 'failed' || response.status === 'error') {
          throw new Error(`Deep research failed: ${response.error || 'Unknown error'}`);
        }
        
        console.log(`Deep research in progress... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error('Error polling for completion:', error);
        throw this.handleError(error, 'deep research polling');
      }
    }
    
    throw new Error(`Deep research timed out after ${maxWaitTime / 1000} seconds`);
  }

  // Parse deep research response structure
  private async parseDeepResearchResponse(response: any, model: string): Promise<LLMResponse> {
    if (!response.output || response.output.length === 0) {
      throw new Error('No output received from deep research');
    }

    // Find the final message in the output array
    const finalOutput = response.output[response.output.length - 1];
    
    if (finalOutput.type !== 'message' || !finalOutput.content || finalOutput.content.length === 0) {
      throw new Error('Invalid deep research response structure');
    }

    const content = finalOutput.content[0];
    const text = content.text || '';
    const annotations = content.annotations || [];

    // Extract usage information if available
    let usage;
    const usageOutput = response.output.find((item: any) => item.usage);
    if (usageOutput) {
      usage = this.extractUsage(usageOutput);
    }

    // Build metadata with citations
    const metadata: Record<string, any> = {
      deepResearch: true,
      citations: annotations.map((annotation: any) => ({
        title: annotation.title,
        url: annotation.url,
        startIndex: annotation.start_index,
        endIndex: annotation.end_index
      })),
      intermediateSteps: response.output.length - 1, // Number of intermediate processing steps
      processingTime: response.metadata?.processing_time_ms
    };

    return this.buildLLMResponse(
      text,
      model,
      usage,
      metadata,
      'stop' // Deep research always completes normally
    );
  }

  // Private methods
  private async generateWithResponsesAPI(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const responseParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      // Include usage information in response
      include_usage: true
    };

    // Add response-specific parameters
    if (options?.temperature !== undefined) responseParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) responseParams.max_completion_tokens = options.maxTokens;
    if (options?.stopSequences) responseParams.stop = options.stopSequences;
    if (options?.tools) responseParams.tools = options.tools;
    
    // Response format for structured outputs
    if (options?.jsonMode) {
      responseParams.response_format = { type: 'json_object' };
    }

    // Use the new Responses API endpoint
    const response = await (this.client as any).responses.create(responseParams);

    const extractedUsage = this.extractUsage(response);
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choice received from OpenAI Responses API');
    }
    
    const finishReason = choice.finish_reason;
    const mappedFinishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 
      finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls' || finishReason === 'content_filter' 
        ? finishReason 
        : 'stop';
    
    return await this.buildLLMResponse(
      choice.message?.content || '',
      response.model,
      extractedUsage,
      undefined,
      mappedFinishReason,
      choice.message?.tool_calls
    );
  }

  private async generateWithResponsesAPIStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const streamParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      stream: true,
      // Include usage information in streaming response
      stream_options: { include_usage: true }
    };

    if (options?.temperature !== undefined) streamParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) streamParams.max_completion_tokens = options.maxTokens;
    if (options?.jsonMode) streamParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) streamParams.stop = options.stopSequences;
    if (options?.tools) streamParams.tools = options.tools;

    // Use the new Responses API with streaming
    const stream = await (this.client as any).responses.create(streamParams);

    let fullText = '';
    let usage: any = undefined;
    let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

    for await (const chunk of stream as any) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        options?.onToken?.(delta);
      }
      
      if (chunk.usage) {
        usage = chunk.usage;
      }

      if (chunk.choices[0]?.finish_reason) {
        const reason = chunk.choices[0].finish_reason;
        if (reason === 'stop' || reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
          finishReason = reason;
        }
      }
    }

    const extractedUsage = this.extractUsage({ usage });
    const response = await this.buildLLMResponse(
      fullText,
      this.currentModel,
      extractedUsage,
      undefined,
      finishReason
    );

    if (options?.onComplete) {
      options.onComplete(response);
    }
    return response;
  }

  // Fallback to Chat Completions API if Responses API is not available
  private async generateWithChatCompletions(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const completionParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt)
    };

    if (options?.temperature !== undefined) completionParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) completionParams.max_tokens = options.maxTokens;
    if (options?.jsonMode) completionParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) completionParams.stop = options.stopSequences;
    if (options?.tools) completionParams.tools = options.tools;

    const response = await this.client.chat.completions.create(completionParams);

    const extractedUsage = this.extractUsage(response);
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choice received from OpenAI');
    }
    
    const finishReason = choice.finish_reason;
    const mappedFinishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 
      finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls' || finishReason === 'content_filter' 
        ? finishReason 
        : 'stop';
    
    return await this.buildLLMResponse(
      choice.message?.content || '',
      response.model,
      extractedUsage,
      undefined,
      mappedFinishReason,
      choice.message?.tool_calls
    );
  }



  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    console.log('OpenAIAdapter: getModelPricing called for model:', modelId);
    
    // Use centralized model registry for pricing
    const modelSpec = ModelRegistry.findModel('openai', modelId);
    console.log('OpenAIAdapter: ModelRegistry.findModel result:', modelSpec);
    
    if (modelSpec) {
      const pricing: ModelPricing = {
        rateInputPerMillion: modelSpec.inputCostPerMillion,
        rateOutputPerMillion: modelSpec.outputCostPerMillion,
        currency: 'USD'
      };
      console.log('OpenAIAdapter: returning pricing:', pricing);
      return pricing;
    }

    console.log('OpenAIAdapter: No model spec found for:', modelId);
    return null;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: true, // For reasoning models
      maxContextWindow: 200000, // Conservative estimate for GPT-4
      supportedFeatures: [
        'chat',
        'streaming',
        'json_mode',
        'function_calling',
        'vision',
        'reasoning',
        'responses_api'
      ]
    };
  }

}
