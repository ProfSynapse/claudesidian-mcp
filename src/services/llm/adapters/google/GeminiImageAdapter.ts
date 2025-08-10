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
  ImageUsage
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
  readonly supportedModels: ImageModel[] = ['imagen-4', 'imagen-4-ultra'];
  readonly supportedSizes: string[] = ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'];
  readonly supportedFormats: string[] = ['png'];
  
  private client: GoogleGenAI;
  private readonly modelMap = {
    'imagen-4': 'imagen-4.0-generate-preview-06-06',
    'imagen-4-ultra': 'imagen-4-ultra'
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

      console.log(`[Google] Generating image with model: ${modelId}, size: ${params.size || '1024x1024'}`);

      const response = await this.withRetry(async () => {
        const config: any = {
          numberOfImages: 1, // Always generate 1 image for now
        };

        // Add aspect ratio if size is specified
        if (params.size) {
          config.aspectRatio = this.getAspectRatio(params.size);
        }

        // Add person generation setting if specified
        if (params.safety) {
          config.personGeneration = params.safety === 'strict' ? 'block' : 'allow';
        }

        console.log(`[Google] Sending request to Google GenAI API...`);
        const startTime = Date.now();

        const result = await (this.client as any).models.generateImages({
          model: modelId,
          prompt: params.prompt,
          config
        });

        const requestTime = Date.now() - startTime;
        console.log(`[Google] API request completed in ${requestTime}ms`);

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

    // Size validation - convert to aspect ratios
    if (params.size) {
      if (!this.supportedSizes.includes(params.size)) {
        errors.push(`Invalid size. Supported sizes: ${this.supportedSizes.join(', ')}`);
      }
    }

    // Safety level validation
    if (params.safety && !['strict', 'standard', 'permissive'].includes(params.safety)) {
      errors.push('Invalid safety setting. Supported values: strict, standard, permissive');
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
        'safety_controls',
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
  getSupportedAspectRatios(): string[] {
    return ['1:1', '3:2', '2:3', '16:9', '9:16'];
  }

  /**
   * Get pricing for Imagen models
   */
  async getImageModelPricing(model: string = 'imagen-4'): Promise<CostDetails> {
    const pricing = {
      'imagen-4': 0.04,
      'imagen-4-ultra': 0.06
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
          lastUpdated: '2025-01-01'
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
          lastUpdated: '2025-01-01'
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

    // Extract dimensions from size parameter or use default
    const size = params.size || '1024x1024';
    const [width, height] = size.split('x').map(Number);

    const usage: ImageUsage = this.buildImageUsage(1, size, params.model || this.defaultModel);

    return {
      imageData: buffer,
      format: 'png', // Google Imagen typically returns PNG
      dimensions: { width, height },
      metadata: {
        aspectRatio: this.aspectRatioMap[size as keyof typeof this.aspectRatioMap] || '1:1',
        safety: params.safety || 'standard',
        model: params.model || this.defaultModel,
        provider: this.name,
        generatedAt: new Date().toISOString(),
        originalPrompt: params.prompt,
        personGeneration: params.safety === 'strict' ? 'block' : 'allow',
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

  /**
   * Build safety settings for Google API
   */
  private buildSafetySettings(level: string = 'standard') {
    const thresholds = {
      'strict': 'BLOCK_LOW_AND_ABOVE',
      'standard': 'BLOCK_MEDIUM_AND_ABOVE', 
      'permissive': 'BLOCK_HIGH_AND_ABOVE'
    };

    const threshold = thresholds[level as keyof typeof thresholds] || 'BLOCK_MEDIUM_AND_ABOVE';

    return [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold
      }
    ];
  }
}