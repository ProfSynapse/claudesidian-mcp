/**
 * OpenAI Deep Research Handler
 * Handles deep research models that use the Responses API
 * Separate from streaming chat functionality
 */

import OpenAI from 'openai';
import { GenerateOptions, LLMResponse, TokenUsage } from '../types';
import { LLMProviderError } from '../types';

export class DeepResearchHandler {
  constructor(private client: OpenAI) {}

  /**
   * Check if a model is a deep research model
   */
  isDeepResearchModel(model: string): boolean {
    return model.includes('deep-research');
  }

  /**
   * Generate response using deep research model
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || 'sonar-deep-research';
    
    console.log(`[DeepResearchHandler] Starting deep research for model: ${model}`);
    
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

    try {
      // Submit the deep research request
      const response = await (this.client as any).responses.create(requestParams);
      
      // Poll for completion if response is not immediately ready
      let finalResponse = response;
      if (response.status === 'in_progress' || !this.isComplete(response)) {
        finalResponse = await this.pollForCompletion(response.id, model);
      }

      // Extract the final report from the output array
      return this.parseResponse(finalResponse, model);
    } catch (error) {
      console.error(`[DeepResearchHandler] Deep research failed for ${model}:`, error);
      throw new LLMProviderError(
        `Deep research generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'openai',
        'DEEP_RESEARCH_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if deep research response is complete
   */
  private isComplete(response: any): boolean {
    return response.output && 
           response.output.length > 0 && 
           response.output.some((item: any) => 
             item.type === 'message' && 
             item.content && 
             item.content.length > 0 &&
             item.content[0].text
           );
  }

  /**
   * Poll for deep research completion
   */
  private async pollForCompletion(responseId: string, model: string, maxWaitTime = 300000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = model.includes('o4-mini') ? 2000 : 5000; // Faster polling for mini model
    
    console.log(`[DeepResearchHandler] Polling for completion of ${responseId} with ${pollInterval}ms intervals`);
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await (this.client as any).responses.retrieve(responseId);
        
        if (response.status === 'completed' || this.isComplete(response)) {
          console.log(`[DeepResearchHandler] Deep research completed after ${Date.now() - startTime}ms`);
          return response;
        }
        
        if (response.status === 'failed' || response.status === 'expired') {
          throw new Error(`Deep research ${response.status}: ${response.error || 'Unknown error'}`);
        }
        
        console.log(`[DeepResearchHandler] Deep research in progress... (${response.status})`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('Deep research')) {
          throw error; // Re-throw deep research specific errors
        }
        console.warn(`[DeepResearchHandler] Polling error:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Deep research timed out after ${maxWaitTime}ms`);
  }

  /**
   * Parse deep research response structure
   */
  private parseResponse(response: any, model: string): LLMResponse {
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
    let usage: TokenUsage | undefined;
    const usageOutput = response.output.find((item: any) => item.usage);
    if (usageOutput) {
      usage = {
        promptTokens: usageOutput.usage.prompt_tokens || usageOutput.usage.input_tokens || 0,
        completionTokens: usageOutput.usage.completion_tokens || usageOutput.usage.output_tokens || 0,
        totalTokens: usageOutput.usage.total_tokens || 0
      };
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

    return {
      text,
      model,
      provider: 'openai',
      usage,
      metadata,
      finishReason: 'stop' // Deep research always completes normally
    };
  }
}