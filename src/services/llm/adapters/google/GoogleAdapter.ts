/**
 * Google Gemini Adapter with true streaming support
 * Implements Google Gemini streaming protocol using generateContentStream
 * Based on official Google Gemini JavaScript SDK documentation
 */

import { GoogleGenAI } from '@google/genai';
import { BaseAdapter } from '../BaseAdapter';
import {
  GenerateOptions,
  StreamChunk,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ModelPricing,
  SearchResult
} from '../types';
import { GOOGLE_MODELS, GOOGLE_DEFAULT_MODEL } from './GoogleModels';
import { WebSearchUtils } from '../../utils/WebSearchUtils';
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';

export class GoogleAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'google';
  readonly baseUrl = 'https://generativelanguage.googleapis.com/v1';

  private client: GoogleGenAI;
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any, model?: string) {
    super(apiKey, model || GOOGLE_DEFAULT_MODEL);

    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    this.mcpConnector = mcpConnector;
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        console.log('[Google Adapter] generateUncached called', {
          hasTools: !!options?.tools,
          toolCount: options?.tools?.length || 0,
          enableTools: options?.enableTools,
          toolNames: options?.tools?.map(t => t.function?.name)
        });

        // If tools are provided (pre-converted by ChatService), use tool-enabled generation
        if (options?.tools && options.tools.length > 0) {
          console.log('[Google Adapter] Using tool-enabled generation', {
            toolCount: options.tools.length
          });
          return await this.generateWithProvidedTools(prompt, options);
        }

        // Otherwise use basic message generation
        console.log('[Google Adapter] Using basic message generation (no tools)');
        return await this.generateWithBasicMessages(prompt, options);
      } catch (error) {
        this.handleError(error, 'generation');
      }
    });
  }

  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('[Google Adapter] Starting streaming response', {
        hasTools: !!options?.tools,
        toolCount: options?.tools?.length || 0,
        enableTools: options?.enableTools,
        hasConversationHistory: !!options?.conversationHistory,
        conversationHistoryLength: options?.conversationHistory?.length || 0,
        toolNames: options?.tools?.map(t => t.function?.name)
      });

      // Build contents - use conversation history if provided (for tool continuations)
      let contents: any[];
      if (options?.conversationHistory && options.conversationHistory.length > 0) {
        console.log('[Google Adapter] Using conversation history', {
          historyLength: options.conversationHistory.length
        });
        contents = options.conversationHistory;
      } else {
        contents = [{
          role: 'user',
          parts: [{ text: prompt }]
        }];
      }

      const request: any = {
        model: options?.model || this.currentModel,
        contents: contents,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens || 4096,
          topK: 40,
          topP: 0.95
        }
      };

      // Add system instruction if provided
      if (options?.systemPrompt) {
        request.systemInstruction = {
          parts: [{ text: options.systemPrompt }]
        };
      }

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        request.tools = this.convertTools(options.tools);

        // Add function calling config to encourage tool use
        request.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO' // Let model decide when to use tools
          }
        };

        console.log('[Google Adapter] Added tools to request', {
          toolsCount: options.tools.length,
          firstToolName: options.tools[0]?.function?.name,
          hasFunctionCallingConfig: true,
          firstThreeTools: options.tools.slice(0, 3).map(t => ({
            name: t.function?.name,
            description: t.function?.description?.substring(0, 100)
          }))
        });
      }

      console.log('[Google Adapter] Sending request', {
        model: request.model,
        hasSystemInstruction: !!request.systemInstruction,
        hasTools: !!request.tools,
        contentsLength: request.contents.length
      });

      const response = await this.client.models.generateContentStream(request);

      let usage: any = undefined;
      const toolCallAccumulator: Map<string, any> = new Map();

      for await (const chunk of response) {
        console.log('[Google Adapter] Stream chunk received', {
          hasText: !!chunk.text,
          hasCandidates: !!chunk.candidates,
          candidatesCount: chunk.candidates?.length || 0,
          finishReason: chunk.candidates?.[0]?.finishReason
        });

        // Extract text from parts
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        const partTypeDetails = parts.map((p: any) => ({
          hasText: !!p.text,
          hasFunctionCall: !!p.functionCall,
          hasFunctionResponse: !!p.functionResponse,
          keys: Object.keys(p)
        }));

        console.log('[Google Adapter] Processing parts', {
          partsCount: parts.length,
          partTypeDetails: partTypeDetails
        });

        for (const part of parts) {
          if (part.text) {
            console.log('[Google Adapter] Yielding text chunk', {
              textLength: part.text.length,
              textPreview: part.text.substring(0, 100)
            });
            yield {
              content: part.text,
              complete: false
            };
          }

          // Accumulate function calls
          if (part.functionCall) {
            const toolId = part.functionCall.name + '_' + Date.now();
            console.log('[Google Adapter] ⚙️ Found functionCall in part', {
              functionName: part.functionCall.name,
              hasArgs: !!part.functionCall.args,
              argsKeys: Object.keys(part.functionCall.args || {})
            });
            toolCallAccumulator.set(toolId, {
              id: toolId,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {})
              }
            });
          } else {
            // Log why no function call
            console.log('[Google Adapter] ❌ No functionCall in part', {
              partKeys: Object.keys(part),
              hasText: !!part.text
            });
          }
        }

        // Extract usage information if available
        if (chunk.usageMetadata) {
          usage = chunk.usageMetadata;
        }
      }

      // Final chunk with usage information and tool calls
      const finalToolCalls = toolCallAccumulator.size > 0
        ? Array.from(toolCallAccumulator.values())
        : undefined;

      console.log('[Google Adapter] Stream completed', {
        accumulatorSize: toolCallAccumulator.size,
        hasToolCalls: !!finalToolCalls,
        toolCallsCount: finalToolCalls?.length || 0,
        toolCallNames: finalToolCalls?.map(tc => tc.function?.name)
      });

      yield {
        content: '',
        complete: true,
        usage: this.extractUsage({ usageMetadata: usage }),
        toolCalls: finalToolCalls
      };

      console.log('[Google Adapter] Streaming completed');
    } catch (error) {
      console.error('[GoogleAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return GOOGLE_MODELS.map(model => ({
        id: model.apiName,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        supportsJSON: model.capabilities.supportsJSON,
        supportsImages: model.capabilities.supportsImages,
        supportsFunctions: model.capabilities.supportsFunctions,
        supportsStreaming: model.capabilities.supportsStreaming,
        supportsThinking: model.capabilities.supportsThinking,
        costPer1kTokens: {
          input: model.inputCostPerMillion / 1000,
          output: model.outputCostPerMillion / 1000
        },
        pricing: {
          inputPerMillion: model.inputCostPerMillion,
          outputPerMillion: model.outputCostPerMillion,
          currency: 'USD',
          lastUpdated: new Date().toISOString()
        }
      }));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: true,
      maxContextWindow: 2097152,
      supportedFeatures: [
        'messages',
        'function_calling',
        'vision',
        'streaming',
        'json_mode',
        'thinking_mode'
      ]
    };
  }

  /**
   * Generate with pre-converted tools (from ChatService) using centralized execution
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    let systemInstruction: any = undefined;

    return MCPToolExecution.executeWithToolSupport(
      this,
      'google',
      {
        model,
        tools: options?.tools || [],
        prompt,
        systemPrompt: options?.systemPrompt,
        onToolEvent: options?.onToolEvent
      },
      {
        buildMessages: (prompt: string, systemPrompt?: string) => {
          const contents = [];

          // System instruction is handled separately in Gemini
          if (systemPrompt) {
            systemInstruction = {
              parts: [{ text: systemPrompt }]
            };
          }

          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });

          return contents;
        },

        buildRequestBody: (messages: any[], isInitial: boolean) => {
          const requestParams: any = {
            model,
            contents: messages,
            generationConfig: {
              temperature: options?.temperature,
              maxOutputTokens: options?.maxTokens || 4096,
              topK: 40,
              topP: 0.95
            }
          };

          // Add system instruction if available
          if (systemInstruction) {
            requestParams.systemInstruction = systemInstruction;
          }

          // Add tools
          if (options?.tools && options.tools.length > 0) {
            requestParams.tools = this.convertTools(options.tools);

            // Add function calling config to encourage tool use
            requestParams.toolConfig = {
              functionCallingConfig: {
                mode: 'AUTO' // Let model decide when to use tools
              }
            };
          }

          return requestParams;
        },

        makeApiCall: async (requestBody: any) => {
          return await this.client.models.generateContent(requestBody);
        },

        extractResponse: async (response: any) => {
          const toolCalls = this.extractToolCalls(response);
          const textContent = this.extractTextFromParts(response.candidates?.[0]?.content?.parts || []);

          return {
            content: textContent,
            usage: this.extractUsage(response),
            finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
            toolCalls: toolCalls,
            choice: {
              message: {
                role: 'model',
                content: response.candidates?.[0]?.content,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined
              }
            }
          };
        },

        buildLLMResponse: async (
          content: string,
          model: string,
          usage?: any,
          metadata?: any,
          finishReason?: any,
          toolCalls?: any[]
        ) => {
          return this.buildLLMResponse(content, model, usage, metadata, finishReason, toolCalls);
        }
      }
    );
  }

  /**
   * Generate using basic message API without tools
   */
  private async generateWithBasicMessages(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // Validate web search support
    if (options?.webSearch) {
      WebSearchUtils.validateWebSearchRequest('google', options.webSearch);
    }

    const request: any = {
      model: options?.model || this.currentModel,
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
        topK: 40,
        topP: 0.95
      }
    };

    // Add system instruction if provided
    if (options?.systemPrompt) {
      request.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }

    // Add web search tool if requested
    if (options?.webSearch) {
      const tools = [{
        type: 'function',
        function: {
          name: 'google_search',
          description: 'Search the web for current information',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      }];
      request.tools = this.convertTools(tools);
      request.toolConfig = {
        functionCallingConfig: {
          mode: 'AUTO'
        }
      };
    }

    const response = await this.client.models.generateContent(request);

    const extractedUsage = this.extractUsage(response);
    const finishReason = this.mapFinishReason(response.candidates?.[0]?.finishReason);
    const toolCalls = this.extractToolCalls(response);

    // Extract web search results if web search was enabled
    const webSearchResults = options?.webSearch
      ? this.extractGoogleSources(response)
      : undefined;

    const textContent = this.extractTextFromParts(response.candidates?.[0]?.content?.parts || []);

    return await this.buildLLMResponse(
      textContent,
      options?.model || this.currentModel,
      extractedUsage,
      { webSearchResults },
      finishReason,
      toolCalls
    );
  }

  // Private methods
  private convertTools(tools: any[]): any[] {
    // Gemini uses functionDeclarations wrapper (NOT OpenAI's flat array)
    return [{
      functionDeclarations: tools.map(tool => {
        if (tool.type === 'function') {
          return {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          };
        }
        return tool;
      })
    }];
  }

  private extractToolCalls(response: any): any[] {
    // Extract from response.candidates[0].content.parts
    const parts = response.candidates?.[0]?.content?.parts || [];
    const toolCalls: any[] = [];

    console.log('[Google Adapter] extractToolCalls called', {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0,
      hasContent: !!response.candidates?.[0]?.content,
      partsLength: parts.length,
      partTypes: parts.map((p: any) => Object.keys(p))
    });

    for (const part of parts) {
      if (part.functionCall) {
        console.log('[Google Adapter] Found functionCall', {
          name: part.functionCall.name,
          args: part.functionCall.args
        });
        toolCalls.push({
          id: part.functionCall.name + '_' + Date.now(),
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }

    console.log('[Google Adapter] Extracted tool calls', {
      count: toolCalls.length,
      toolNames: toolCalls.map(tc => tc.function?.name)
    });

    return toolCalls;
  }

  private extractTextFromParts(parts: any[]): string {
    return parts
      .filter(part => part.text)
      .map(part => part.text)
      .join('');
  }

  /**
   * Extract search results from Google response
   * Google may include sources in grounding chunks or tool results
   */
  private extractGoogleSources(response: any): SearchResult[] {
    try {
      const sources: SearchResult[] = [];

      // Check for grounding metadata (Google's web search citations)
      if (response.groundingMetadata?.webSearchQueries) {
        const groundingChunks = response.groundingMetadata.groundingChunks || [];
        for (const chunk of groundingChunks) {
          const result = WebSearchUtils.validateSearchResult({
            title: chunk.title || 'Unknown Source',
            url: chunk.web?.uri || chunk.uri,
            date: chunk.publishedDate
          });
          if (result) sources.push(result);
        }
      }

      // Check for function call results (if google_search tool was used)
      const functionCalls = response.functionCalls || [];
      for (const call of functionCalls) {
        if (call.name === 'google_search' && call.response) {
          try {
            const searchData = call.response;
            if (searchData.results && Array.isArray(searchData.results)) {
              const extractedSources = WebSearchUtils.extractSearchResults(searchData.results);
              sources.push(...extractedSources);
            }
          } catch (error) {
            console.warn('[Google] Failed to parse search tool response:', error);
          }
        }
      }

      return sources;
    } catch (error) {
      console.warn('[Google] Failed to extract search sources:', error);
      return [];
    }
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): any {
    const usage = response.usageMetadata || response.usage;
    if (usage) {
      return {
        promptTokens: usage.promptTokenCount || usage.inputTokens || 0,
        completionTokens: usage.candidatesTokenCount || usage.outputTokens || 0,
        totalTokens: usage.totalTokenCount || usage.totalTokens || 0
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const model = GOOGLE_MODELS.find(m => m.apiName === modelId);
    if (!model) return undefined;
    
    return {
      input: model.inputCostPerMillion / 1000,
      output: model.outputCostPerMillion / 1000
    };
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    const costs = this.getCostPer1kTokens(modelId);
    if (!costs) return null;
    
    return {
      rateInputPerMillion: costs.input * 1000,
      rateOutputPerMillion: costs.output * 1000,
      currency: 'USD'
    };
  }
}