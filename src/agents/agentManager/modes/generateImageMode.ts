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
  model?: 'imagen-4' | 'imagen-4-ultra' | 'imagen-4-fast';
  aspectRatio?: AspectRatio;
  numberOfImages?: number;
  sampleImageSize?: '1K' | '2K';
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
 * Handles AI image generation requests through Google provider
 */
export class GenerateImageMode extends BaseMode<GenerateImageParams, GenerateImageModeResult> {
  private imageService: ImageGenerationService | null = null;
  private schemaBuilder: SchemaBuilder;
  private vault: Vault | null = null;
  private llmSettings: LLMProviderSettings | null = null;

  constructor(dependencies?: { vault?: Vault; llmSettings?: LLMProviderSettings }) {
    super(
      'generateImage',
      'Generate Image',
      'Generate images using Google Imagen 4 and save to vault',
      '1.0.0'
    );

    this.schemaBuilder = new SchemaBuilder(null);

    // Use injected dependencies if provided
    if (dependencies) {
      if (dependencies.vault) {
        this.vault = dependencies.vault;
      }
      if (dependencies.llmSettings) {
        this.llmSettings = dependencies.llmSettings;
      }

      // Initialize service if both dependencies are available
      if (this.vault && this.llmSettings) {
        this.initializeImageService();
      }
    }
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
          'Image generation service not initialized. Vault instance required.',
          undefined,
          undefined,
          params.context.sessionId,
          params.context
        );
      }

      // Check if any providers are available
      if (!this.imageService.hasAvailableProviders()) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          'No image generation providers available. Please configure Google API key in plugin settings.',
          undefined,
          undefined,
          params.context.sessionId,
          params.context
        );
      }

      // Validate parameters
      const validation = await this.imageService.validateParams({
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        aspectRatio: params.aspectRatio,
        numberOfImages: params.numberOfImages,
        sampleImageSize: params.sampleImageSize,
        savePath: params.savePath,
        sessionId: params.context.sessionId,
        context: typeof params.context === 'string' ? params.context : JSON.stringify(params.context)
      });

      if (!validation.isValid) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          `Parameter validation failed: ${validation.errors.join(', ')}`,
          undefined,
          undefined,
          params.context.sessionId,
          params.context
        );
      }

      // Generate the image
      const result = await this.imageService.generateImage({
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        aspectRatio: params.aspectRatio,
        numberOfImages: params.numberOfImages,
        sampleImageSize: params.sampleImageSize,
        savePath: params.savePath,
        sessionId: params.context.sessionId,
        context: typeof params.context === 'string' ? params.context : JSON.stringify(params.context)
      });

      if (!result.success) {
        return createResult<GenerateImageModeResult>(
          false,
          undefined,
          result.error || 'Image generation failed',
          undefined,
          undefined,
          params.context.sessionId,
          params.context
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
        'Image generated successfully',
        undefined,
        undefined,
        params.context.sessionId,
        params.context
      );

    } catch (error) {
      return createResult<GenerateImageModeResult>(
        false,
        undefined,
        `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        undefined,
        params.context.sessionId,
        params.context
      );
    }
  }

  /**
   * Get parameter schema for MCP
   */
  getParameterSchema(): any {
    const modeSchema = {
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
          enum: ['google'],
          description: 'AI provider for image generation (google for Imagen 4)'
        },
        model: {
          type: 'string',
          enum: ['imagen-4', 'imagen-4-ultra', 'imagen-4-fast'],
          description: 'Specific model to use (optional, will use provider default)'
        },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '3:4', '4:3', '9:16', '16:9'],
          description: 'Aspect ratio for the generated image'
        },
        numberOfImages: {
          type: 'number',
          minimum: 1,
          maximum: 4,
          description: 'Number of images to generate (1-4)'
        },
        sampleImageSize: {
          type: 'string',
          enum: ['1K', '2K'],
          description: 'Image resolution (1K or 2K). 2K only available for imagen-4 and imagen-4-ultra'
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
        }
      },
      required: ['prompt', 'provider', 'savePath']
    };
    
    return this.getMergedSchema(modeSchema);
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
              description: 'AI provider used (google)'
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