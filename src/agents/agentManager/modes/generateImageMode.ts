/**
 * Generate Image Mode - Image generation workflow for AgentManager
 * Integrates with ImageGenerationService and follows AgentManager patterns
 */

import { BaseMode } from '../../baseMode';
import { CommonResult, CommonParameters } from '../../../types';
import { createResult } from '../../../utils/schemaUtils';
import { ImageGenerationService } from '../../../services/llm/ImageGenerationService';
import { 
  ImageGenerationParams,
  ImageGenerationResult,
  AspectRatio
} from '../../../services/llm/types/ImageTypes';
import { SchemaBuilder, SchemaType } from '../../../utils/schemas/SchemaBuilder';
import { Vault } from 'obsidian';
import { LLMProviderSettings } from '../../../types/llm/ProviderTypes';

export interface GenerateImageParams extends CommonParameters {
  prompt: string;
  provider: 'google'; // Only Google Imagen supported
  model?: 'imagen-4' | 'imagen-4-ultra';
  aspectRatio?: AspectRatio;
  savePath: string;
}

export interface GenerateImageModeResult extends CommonResult {
  data?: {
    imagePath: string;
    prompt: string;
    revisedPrompt?: string;
    model: string;
    provider: string;
    dimensions: { width: number; height: number };
    fileSize: number;
    format: string;
    cost?: {
      totalCost: number;
      currency: string;
      ratePerImage: number;
    };
    usage?: {
      imagesGenerated: number;
      resolution: string;
      model: string;
      provider: string;
    };
    metadata?: Record<string, any>;
  };
}

/**
 * Image Generation Mode for AgentManager
 * Handles AI image generation requests through OpenAI and Google providers
 */
export class GenerateImageMode extends BaseMode<GenerateImageParams, GenerateImageModeResult> {
  private imageService: ImageGenerationService | null = null;
  private schemaBuilder: SchemaBuilder;
  private vault: Vault | null = null;
  private llmSettings: LLMProviderSettings | null = null;

  constructor() {
    super(
      'generateImage',
      'Generate Image',
      'Generate images using AI providers (OpenAI GPT-Image-1, Google Imagen 4) and save to vault',
      '1.0.0'
    );

    this.schemaBuilder = new SchemaBuilder(null);
  }

  /**
   * Set the vault instance for image generation service
   */
  setVault(vault: Vault): void {
    this.vault = vault;
    this.initializeImageService();
  }

  /**
   * Set LLM provider settings
   */
  setLLMSettings(llmSettings: LLMProviderSettings): void {
    this.llmSettings = llmSettings;
    this.initializeImageService();
  }

  /**
   * Initialize image service when both vault and settings are available
   */
  private initializeImageService(): void {
    if (this.vault && this.llmSettings) {
      this.imageService = new ImageGenerationService(this.vault, this.llmSettings);
    }
  }

  /**
   * Execute image generation
   */
  async execute(params: GenerateImageParams): Promise<GenerateImageModeResult> {
    try {
      // Validate service availability
      if (!this.imageService) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          'Image generation service not initialized. Vault instance required.'
        );
      }

      // Check if any providers are available
      if (!this.imageService.hasAvailableProviders()) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          'No image generation providers available. Please configure OPENAI_API_KEY or GOOGLE_API_KEY environment variables.'
        );
      }

      // Validate parameters
      const validation = await this.imageService.validateParams({
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        aspectRatio: params.aspectRatio,
        savePath: params.savePath,
        sessionId: params.sessionId,
        context: typeof params.context === 'object' ? JSON.stringify(params.context) : params.context
      });

      if (!validation.isValid) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          `Parameter validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Generate the image
      const result = await this.imageService.generateImage({
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        aspectRatio: params.aspectRatio,
        savePath: params.savePath,
        sessionId: params.sessionId,
        context: typeof params.context === 'object' ? JSON.stringify(params.context) : params.context
      });

      if (!result.success) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          result.error || 'Image generation failed'
        );
      }

      // Return successful result
      return createResult<GenerateImageModeResult>(
        true,
        result.data ? {
          imagePath: result.data.imagePath,
          prompt: result.data.prompt,
          revisedPrompt: result.data.revisedPrompt,
          model: result.data.model,
          provider: result.data.provider,
          dimensions: result.data.dimensions,
          fileSize: result.data.fileSize,
          format: result.data.format,
          cost: result.data.cost,
          usage: result.data.usage,
          metadata: result.data.metadata
        } : undefined,
        'Image generated successfully'
      );

    } catch (error) {
      return createResult<GenerateImageModeResult>(
        false,
        undefined,
        `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get parameter schema for MCP
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text prompt describing the image to generate',
          minLength: 1,
          maxLength: 32000
        },
        provider: {
          type: 'string',
          enum: ['openai', 'google'],
          description: 'AI provider for image generation (openai for GPT-Image-1, google for Imagen 4)'
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'imagen-4', 'imagen-4-ultra'],
          description: 'Specific model to use (optional, will use provider default)'
        },
        size: {
          type: 'string',
          description: 'Image size (e.g., "1024x1024", "1536x1024", "1024x1536"). Use "auto" for OpenAI automatic sizing.',
          examples: ['1024x1024', '1536x1024', '1024x1536', '1792x1024', 'auto']
        },
        quality: {
          type: 'string',
          enum: ['standard', 'hd'],
          description: 'Image quality setting (standard or hd). HD costs more but provides better detail.'
        },
        safety: {
          type: 'string',
          enum: ['strict', 'standard', 'permissive'],
          description: 'Content safety level. Strict blocks more content, permissive allows more creative freedom.'
        },
        savePath: {
          type: 'string',
          description: 'Vault-relative path where the image should be saved (e.g., "images/my-image.png")',
          pattern: '^[^/].*\\.(png|jpg|jpeg|webp)$'
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Image format (optional, inferred from savePath extension or provider default)'
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier for tracking and context'
        },
        context: {
          type: 'string',
          description: 'Additional context or notes to include in metadata file'
        }
      },
      required: ['prompt', 'provider', 'savePath', 'sessionId']
    };
  }

  /**
   * Get result schema for MCP
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the image generation succeeded'
        },
        message: {
          type: 'string',
          description: 'Status message'
        },
        data: {
          type: 'object',
          properties: {
            imagePath: {
              type: 'string',
              description: 'Path where the image was saved in the vault'
            },
            prompt: {
              type: 'string',
              description: 'Original prompt used for generation'
            },
            revisedPrompt: {
              type: 'string',
              description: 'Provider-revised prompt (if applicable)'
            },
            model: {
              type: 'string',
              description: 'AI model used for generation'
            },
            provider: {
              type: 'string',
              description: 'AI provider used (openai or google)'
            },
            dimensions: {
              type: 'object',
              properties: {
                width: {
                  type: 'number',
                  description: 'Image width in pixels'
                },
                height: {
                  type: 'number',
                  description: 'Image height in pixels'
                }
              },
              required: ['width', 'height']
            },
            fileSize: {
              type: 'number',
              description: 'File size in bytes'
            },
            format: {
              type: 'string',
              description: 'Image format (png, jpeg, webp)'
            },
            cost: {
              type: 'object',
              properties: {
                totalCost: {
                  type: 'number',
                  description: 'Total cost in USD'
                },
                currency: {
                  type: 'string',
                  description: 'Currency (USD)'
                },
                ratePerImage: {
                  type: 'number',
                  description: 'Cost per image'
                }
              }
            },
            usage: {
              type: 'object',
              properties: {
                imagesGenerated: {
                  type: 'number',
                  description: 'Number of images generated'
                },
                resolution: {
                  type: 'string',
                  description: 'Image resolution'
                },
                model: {
                  type: 'string',
                  description: 'Model used'
                },
                provider: {
                  type: 'string',
                  description: 'Provider used'
                }
              }
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata'
            }
          }
        }
      },
      required: ['success']
    };
  }

  /**
   * Get available providers and their status
   */
  async getAvailableProviders() {
    if (!this.imageService) {
      return [];
    }
    return await this.imageService.getAvailableProviders();
  }

  /**
   * Get supported models for Google provider
   */
  async getSupportedModels(provider: 'google' = 'google'): Promise<string[]> {
    if (!this.imageService) {
      return [];
    }
    return await this.imageService.getSupportedModels(provider);
  }

  /**
   * Get supported sizes for Google provider
   */
  getSupportedSizes(provider: 'google' = 'google'): string[] {
    if (!this.imageService) {
      return [];
    }
    return this.imageService.getSupportedSizes(provider);
  }

  /**
   * Estimate cost for image generation
   */
  async estimateCost(params: Pick<GenerateImageParams, 'provider' | 'model'>): Promise<{
    estimatedCost: number;
    currency: string;
    breakdown: string;
  } | null> {
    if (!this.imageService) {
      return null;
    }
    return await this.imageService.estimateCost({
      prompt: 'example',
      provider: params.provider,
      model: params.model,
      savePath: 'example.png',
      sessionId: 'example'
    });
  }
}