/**
 * WebLLMEngine - Main thread WebLLM engine wrapper
 *
 * Runs WebLLM in the main thread instead of a worker to avoid
 * Obsidian's sandboxed Electron restrictions that block local module bundling.
 *
 * WebGPU handles the actual GPU compute, so main thread execution
 * doesn't block the UI during inference.
 *
 * Loads WebLLM from CDN (esm.run) - this is the cleanest solution because
 * WebLLM is designed for browsers and esm.run serves browser-compatible ESM.
 */

import { WebLLMModelSpec, WebLLMError } from './types';
import { HF_MODEL_REPO, MISTRAL_MODEL_LIB_URL } from './WebLLMModels';

// Type imports for TypeScript (these are erased at runtime)
import type * as WebLLMTypes from '@mlc-ai/web-llm';

export interface EngineProgress {
  progress: number;
  stage: 'downloading' | 'loading' | 'compiling';
  message: string;
}

export interface GenerationResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface StreamChunk {
  content: string;
  tokenCount: number;
}

// Lazy-loaded WebLLM module
let webllm: typeof WebLLMTypes | null = null;

/**
 * Load WebLLM dynamically from CDN at runtime
 *
 * Uses jsDelivr's esm.run service which serves browser-compatible ESM modules.
 * This works in Electron's renderer because it has full browser capabilities.
 */
async function loadWebLLM(): Promise<typeof WebLLMTypes> {
  if (webllm) {
    console.log('[WebLLMEngine] Using cached WebLLM module');
    return webllm;
  }

  console.log('[WebLLMEngine] Loading WebLLM from CDN...');

  try {
    // Dynamic import from jsDelivr's esm.run service
    // This serves ESM modules that work in browser contexts
    // @ts-ignore - TypeScript doesn't understand CDN URLs, but Electron's renderer can import them
    const module = await import('https://esm.run/@mlc-ai/web-llm');

    webllm = module as typeof WebLLMTypes;

    if (!webllm.CreateMLCEngine) {
      throw new Error('CreateMLCEngine not found in module');
    }

    console.log('[WebLLMEngine] WebLLM loaded successfully from CDN');
    console.log('[WebLLMEngine] Available exports:', Object.keys(webllm as object).slice(0, 10));
    return webllm;
  } catch (error) {
    console.error('[WebLLMEngine] Failed to load WebLLM from CDN:', error);
    throw new WebLLMError(
      `Failed to load WebLLM: ${error instanceof Error ? error.message : String(error)}`,
      'MODULE_LOAD_FAILED',
      error
    );
  }
}

/**
 * Check if we should use stock WebLLM model for testing
 * Set to true to test with stock Mistral model instead of custom Nexus model
 */
const USE_STOCK_MODEL_FOR_TESTING = false; // Updated config with missing gen params

/**
 * Stock WebLLM model ID for testing
 * Uses official WebLLM model that's known to work
 */
const STOCK_TEST_MODEL_ID = 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC';

/**
 * Create custom app config for our Nexus model
 * This registers our HuggingFace-hosted model with WebLLM
 */
function createNexusAppConfig(): WebLLMTypes.AppConfig | undefined {
  if (USE_STOCK_MODEL_FOR_TESTING) {
    // Return undefined to use WebLLM's built-in model list
    console.log('[WebLLMEngine] Using stock WebLLM model for testing');
    return undefined;
  }

  return {
    model_list: [
      {
        model: `https://huggingface.co/${HF_MODEL_REPO}/resolve/main/`,
        model_id: 'nexus-tools-q4f16',
        model_lib: MISTRAL_MODEL_LIB_URL,
        overrides: {
          context_window_size: 32768,
        },
      },
    ],
  };
}

export class WebLLMEngine {
  private engine: WebLLMTypes.MLCEngine | null = null;
  private isGenerating = false;
  private currentModelId: string | null = null;
  private abortController: AbortController | null = null;

  /**
   * Initialize the engine with a model
   */
  async initModel(
    modelSpec: WebLLMModelSpec,
    options?: {
      onProgress?: (progress: EngineProgress) => void;
    }
  ): Promise<{ modelId: string; contextWindow: number; maxTokens: number }> {
    // If same model already loaded, skip
    if (this.engine && this.currentModelId === modelSpec.apiName) {
      console.log('[WebLLMEngine] Model already loaded:', modelSpec.apiName);
      return {
        modelId: modelSpec.apiName,
        contextWindow: 32768,
        maxTokens: 4096,
      };
    }

    // Unload existing model if different
    if (this.engine && this.currentModelId !== modelSpec.apiName) {
      await this.unloadModel();
    }

    // Use stock model for testing, or custom model for production
    const modelIdToLoad = USE_STOCK_MODEL_FOR_TESTING ? STOCK_TEST_MODEL_ID : modelSpec.apiName;
    console.log('[WebLLMEngine] Loading model:', modelIdToLoad);

    try {
      // Load WebLLM at runtime (not bundled)
      const webllmLib = await loadWebLLM();

      // Progress callback adapter
      const progressCallback = (report: WebLLMTypes.InitProgressReport) => {
        if (options?.onProgress) {
          const stage = report.text?.includes('Loading') ? 'loading' :
                        report.text?.includes('Download') ? 'downloading' : 'compiling';
          options.onProgress({
            progress: report.progress || 0,
            stage: stage as EngineProgress['stage'],
            message: report.text || '',
          });
        }
      };

      // Create custom app config for Nexus model (or undefined to use built-in list)
      const appConfig = createNexusAppConfig();

      // Create the MLC engine
      this.engine = await webllmLib.CreateMLCEngine(modelIdToLoad, {
        appConfig,
        initProgressCallback: progressCallback,
      });

      this.currentModelId = modelIdToLoad;

      console.log('[WebLLMEngine] Model loaded successfully:', modelIdToLoad);

      return {
        modelId: modelSpec.apiName,
        contextWindow: 32768, // Fixed for Nexus
        maxTokens: 4096,
      };
    } catch (error) {
      console.error('[WebLLMEngine] Failed to load model:', error);
      throw new WebLLMError(
        `Failed to initialize model: ${error instanceof Error ? error.message : String(error)}`,
        'LOAD_FAILED',
        error
      );
    }
  }

  /**
   * Generate a response (non-streaming)
   */
  async generate(
    messages: { role: string; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      stopSequences?: string[];
    }
  ): Promise<GenerationResult> {
    if (!this.engine) {
      throw new WebLLMError('Engine not initialized', 'GENERATION_FAILED');
    }

    if (this.isGenerating) {
      throw new WebLLMError('Generation already in progress', 'GENERATION_FAILED');
    }

    this.isGenerating = true;

    try {
      const response = await this.engine.chat.completions.create({
        messages: messages as WebLLMTypes.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        top_p: options?.topP ?? 0.95,
        stop: options?.stopSequences,
        stream: false,
      });

      const choice = response.choices[0];
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        content: choice.message?.content || '',
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        finishReason: choice.finish_reason || 'stop',
      };
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Generate a streaming response
   */
  async *generateStream(
    messages: { role: string; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      stopSequences?: string[];
    }
  ): AsyncGenerator<StreamChunk | GenerationResult, void, unknown> {
    if (!this.engine) {
      throw new WebLLMError('Engine not initialized', 'GENERATION_FAILED');
    }

    if (this.isGenerating) {
      throw new WebLLMError('Generation already in progress', 'GENERATION_FAILED');
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    try {
      const stream = await this.engine.chat.completions.create({
        messages: messages as WebLLMTypes.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        top_p: options?.topP ?? 0.95,
        stop: options?.stopSequences,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      let finishReason = 'stop';
      let chunkCount = 0;

      console.log('[WebLLMEngine] Starting stream iteration...');

      for await (const chunk of stream) {
        chunkCount++;

        // Log first few chunks in detail
        if (chunkCount <= 5) {
          console.log(`[WebLLMEngine] Raw chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2).slice(0, 500));
        }

        // Check for abort
        if (this.abortController?.signal.aborted) {
          finishReason = 'abort';
          break;
        }

        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        if (content) {
          fullContent += content;
          yield {
            content,
            tokenCount: fullContent.length, // Approximate
          } as StreamChunk;
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
          console.log(`[WebLLMEngine] Finish reason: ${finishReason}`);
        }

        // Capture usage from final chunk
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens || 0,
            completionTokens: chunk.usage.completion_tokens || 0,
            totalTokens: chunk.usage.total_tokens || 0,
          };
          console.log(`[WebLLMEngine] Usage:`, usage);
        }
      }

      console.log(`[WebLLMEngine] Stream complete. Chunks: ${chunkCount}, Content: "${fullContent.slice(0, 100)}..."`)

      // Yield final result
      yield {
        content: fullContent,
        usage,
        finishReason,
      } as GenerationResult;
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  /**
   * Abort current generation
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.engine && this.isGenerating) {
      this.engine.interruptGenerate();
      this.isGenerating = false;
    }
  }

  /**
   * Unload the model from GPU memory
   */
  async unloadModel(): Promise<void> {
    if (this.engine) {
      console.log('[WebLLMEngine] Unloading model:', this.currentModelId);
      await this.engine.unload();
      this.engine = null;
      this.currentModelId = null;
    }
  }

  /**
   * Check if a model is loaded
   */
  isModelLoaded(): boolean {
    return this.engine !== null && this.currentModelId !== null;
  }

  /**
   * Get the currently loaded model ID
   */
  getCurrentModelId(): string | null {
    return this.currentModelId;
  }

  /**
   * Check if generation is in progress
   */
  isGenerationInProgress(): boolean {
    return this.isGenerating;
  }

  /**
   * Dispose the engine completely
   */
  async dispose(): Promise<void> {
    await this.unloadModel();
  }
}
