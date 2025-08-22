/**
 * Google Gemini Image Generation Adapter
 * Supports Google's Imagen 4 models for image generation
 * Based on 2025 API documentation using @google/genai SDK
 */

import { GoogleGenAI } from '@google/genai';
import { BaseImageAdapter } from '../BaseImageAdapter';
import { 
  ImageGenerationParams, 
  ImageGenerationResponse, 
  ImageValidationResult,
  ImageModel,
  ImageUsage,
  AspectRatio
} from '../../types/ImageTypes';
import { 
  ProviderConfig,
  ProviderCapabilities,
  ModelInfo,
  CostDetails
} from '../types';

export class GeminiImageAdapter extends BaseImageAdapter {
  readonly name = 'gemini-image';
  readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  readonly supportedModels: ImageModel[] = ['imagen-4', 'imagen-4-ultra', 'imagen-4-fast'];
  readonly supportedSizes: string[] = ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'];
  readonly supportedFormats: string[] = ['png'];
  
  private client: GoogleGenAI;
  private readonly modelMap = {
    'imagen-4': 'imagen-4.0-generate-001',
    'imagen-4-ultra': 'imagen-4.0-ultra-generate-001',
    'imagen-4-fast': 'imagen-4.0-fast-generate-001'
  };
  private readonly defaultModel = 'imagen-4';
  private readonly aspectRatioMap = {
    '1024x1024': '1:1',
    '1536x1024': '3:4',
    '1024x1536': '4:3', 
    '1792x1024': '16:9',
    '1024x1792': '9:16'
  };

  constructor(config?: ProviderConfig) {
    const apiKey = config?.apiKey || '';
    super(apiKey, 'imagen-4', config?.baseUrl);
    
    this.client = new GoogleGenAI({
      apiKey: apiKey
    });

    this.initializeCache();
  }

  /**
   * Generate images using Google's Imagen 4 models
   */
  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    try {
      this.validateConfiguration();
      
      const modelId = this.modelMap[params.model as keyof typeof this.modelMap] || 
                     this.modelMap[this.defaultModel as keyof typeof this.modelMap];

      const response = await this.withRetry(async () => {
        const config: any = {
          numberOfImages: params.numberOfImages || 1,
        };

        // Add aspect ratio directly from params (preferred) or convert from size (legacy)
        if (params.aspectRatio) {
          config.aspectRatio = params.aspectRatio;
        } else if (params.size) {
          config.aspectRatio = this.getAspectRatio(params.size);
        } else {
          config.aspectRatio = '1:1'; // Default aspect ratio
        }

        // Add sample image size if specified (only for imagen-4 and imagen-4-ultra)
        if (params.sampleImageSize && (params.model === 'imagen-4' || params.model === 'imagen-4-ultra')) {
          config.sampleImageSize = params.sampleImageSize;
        }

        const result = await (this.client as any).models.generateImages({
          model: modelId,
          prompt: params.prompt,
          config
        });

        return result;
      }, 2); // Reduced retry count for faster failure detection

      return this.buildImageResponse(response, params);
    } catch (error) {
      this.handleImageError(error, 'image generation', params);
    }
  }

  /**
   * Validate Google-specific image generation parameters
   */
  validateImageParams(params: ImageGenerationParams): ImageValidationResult {
    // Start with common validation
    const baseValidation = this.validateCommonParams(params);
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [...baseValidation.errors];
    const warnings: string[] = [...(baseValidation.warnings || [])];
    const adjustedParams: Partial<ImageGenerationParams> = {};

    // Validate prompt length (Imagen 4 has a 480 token limit)
    if (params.prompt.length > 2000) { // Rough approximation of 480 tokens
      errors.push('Prompt too long (approximately 480 tokens max for Imagen 4)');
    }

    // Validate model
    if (params.model && !this.supportedModels.includes(params.model as ImageModel)) {
      errors.push(`Invalid model. Supported models: ${this.supportedModels.join(', ')}`);
    }

    // Size validation - convert to aspect ratios (legacy support)
    if (params.size) {
      if (!this.supportedSizes.includes(params.size)) {
        errors.push(`Invalid size. Supported sizes: ${this.supportedSizes.join(', ')}`);
      }
    }

    // Number of images validation
    if (params.numberOfImages && (params.numberOfImages < 1 || params.numberOfImages > 4)) {
      errors.push('numberOfImages must be between 1 and 4');
    }

    // Sample image size validation (only for imagen-4 and imagen-4-ultra)
    if (params.sampleImageSize) {
      if (!['1K', '2K'].includes(params.sampleImageSize)) {
        errors.push('sampleImageSize must be "1K" or "2K"');
      }
      if (params.sampleImageSize === '2K' && params.model === 'imagen-4-fast') {
        errors.push('2K resolution is not supported for imagen-4-fast model');
      }
    }

    // Set default model if not specified
    if (!params.model) {
      adjustedParams.model = this.defaultModel;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedParams
    };
  }

  /**
   * Get Google Imagen capabilities
   */
  getImageCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      supportsImageGeneration: true,
      maxContextWindow: 480, // Token limit for prompts
      supportedFeatures: [
        'text_to_image',
        'multi_image_generation',
        'aspect_ratio_control',
        'high_quality_output',
        'enhanced_text_rendering'
      ]
    };
  }

  /**
   * Get supported aspect ratios (converted from sizes)
   */
  getSupportedImageSizes(): string[] {
    return [...this.supportedSizes];
  }

  /**
   * Get supported aspect ratios
   */
  getSupportedAspectRatios(): AspectRatio[] {
    return [AspectRatio.SQUARE, AspectRatio.PORTRAIT_3_4, AspectRatio.LANDSCAPE_4_3, AspectRatio.PORTRAIT_9_16, AspectRatio.LANDSCAPE_16_9];
  }

  /**
   * Get pricing for Imagen models (2025 pricing)
   */
  async getImageModelPricing(model: string = 'imagen-4'): Promise<CostDetails> {
    const pricing = {
      'imagen-4': 0.04,      // Standard
      'imagen-4-ultra': 0.06, // Ultra
      'imagen-4-fast': 0.02   // Fast
    };

    const basePrice = pricing[model as keyof typeof pricing] || 0.04;

    return {
      inputCost: 0,
      outputCost: basePrice,
      totalCost: basePrice,
      currency: 'USD',
      rateInputPerMillion: 0,
      rateOutputPerMillion: basePrice * 1_000_000
    };
  }

  /**
   * List available Google image models
   */
  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'imagen-4',
        name: 'Imagen 4',
        contextWindow: 480,
        maxOutputTokens: 0,
        supportsJSON: false,
        supportsImages: false,
        supportsFunctions: false,
        supportsStreaming: false,
        supportsThinking: false,
        supportsImageGeneration: true,
        pricing: {
          inputPerMillion: 0,
          outputPerMillion: 0,
          imageGeneration: 0.04,
          currency: 'USD',
          lastUpdated: '2025-08-22'
        }
      },
      {
        id: 'imagen-4-ultra',
        name: 'Imagen 4 Ultra',
        contextWindow: 480,
        maxOutputTokens: 0,
        supportsJSON: false,
        supportsImages: false,
        supportsFunctions: false,
        supportsStreaming: false,
        supportsThinking: false,
        supportsImageGeneration: true,
        pricing: {
          inputPerMillion: 0,
          outputPerMillion: 0,
          imageGeneration: 0.06,
          currency: 'USD',
          lastUpdated: '2025-08-22'
        }
      },
      {
        id: 'imagen-4-fast',
        name: 'Imagen 4 Fast',
        contextWindow: 480,
        maxOutputTokens: 0,
        supportsJSON: false,
        supportsImages: false,
        supportsFunctions: false,
        supportsStreaming: false,
        supportsThinking: false,
        supportsImageGeneration: true,
        pricing: {
          inputPerMillion: 0,
          outputPerMillion: 0,
          imageGeneration: 0.02,
          currency: 'USD',
          lastUpdated: '2025-08-22'
        }
      }
    ];
  }

  // Private helper methods

  private buildImageResponse(
    response: any, 
    params: ImageGenerationParams
  ): ImageGenerationResponse {
    // Handle Google GenAI SDK response format
    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No image data received from Google');
    }

    const generatedImage = response.generatedImages[0];
    if (!generatedImage.image || !generatedImage.image.imageBytes) {
      throw new Error('No image bytes found in Google response');
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(generatedImage.image.imageBytes, 'base64');

    // Extract dimensions from aspectRatio or size parameter
    let width = 1024, height = 1024; // Default square
    let aspectRatio: AspectRatio = params.aspectRatio || AspectRatio.SQUARE;
    let size = '1024x1024';
    
    if (params.aspectRatio) {
      // Use aspect ratio to calculate dimensions
      const aspectRatioToDimensions: Record<AspectRatio, [number, number]> = {
        [AspectRatio.SQUARE]: [1024, 1024],
        [AspectRatio.PORTRAIT_3_4]: [1152, 896], // Google's typical dimensions for 3:4
        [AspectRatio.LANDSCAPE_4_3]: [896, 1152], // Google's typical dimensions for 4:3  
        [AspectRatio.PORTRAIT_9_16]: [576, 1024], // Google's typical dimensions for 9:16
        [AspectRatio.LANDSCAPE_16_9]: [1024, 576]  // Google's typical dimensions for 16:9
      };
      [width, height] = aspectRatioToDimensions[params.aspectRatio] || [1024, 1024];
      size = `${width}x${height}`;
    } else if (params.size) {
      // Legacy: extract from size parameter
      const [w, h] = params.size.split('x').map(Number);
      width = w;
      height = h;
      size = params.size;
      const mappedRatio = this.aspectRatioMap[size as keyof typeof this.aspectRatioMap];
      aspectRatio = (mappedRatio as AspectRatio) || AspectRatio.SQUARE;
    }

    const usage: ImageUsage = this.buildImageUsage(1, size, params.model || this.defaultModel);

    return {
      imageData: buffer,
      format: 'png', // Google Imagen typically returns PNG
      dimensions: { width, height },
      metadata: {
        aspectRatio,
        model: params.model || this.defaultModel,
        provider: this.name,
        generatedAt: new Date().toISOString(),
        originalPrompt: params.prompt,
        synthidWatermarking: true // Google adds SynthID watermarking
      },
      usage
    };
  }

  /**
   * Convert size to aspect ratio for Google API
   */
  private getAspectRatio(size: string): string {
    return this.aspectRatioMap[size as keyof typeof this.aspectRatioMap] || '1:1';
  }

}