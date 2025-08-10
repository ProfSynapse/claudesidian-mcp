/**
 * OpenAI Image Generation Adapter
 * Supports OpenAI's gpt-image-1 model for image generation
 * Based on 2025 API documentation
 */

import OpenAI from 'openai';
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

export class OpenAIImageAdapter extends BaseImageAdapter {
  readonly name = 'openai-image';
  readonly baseUrl = 'https://api.openai.com/v1';
  readonly supportedModels: ImageModel[] = ['gpt-image-1'];
  readonly supportedSizes: string[] = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
  readonly supportedFormats: string[] = ['png'];
  
  private client: OpenAI;
  private readonly imageModel = 'dall-e-3'; // Use DALL-E 3 instead of gpt-image-1

  constructor(config?: ProviderConfig) {
    const apiKey = config?.apiKey || '';
    super(apiKey, 'dall-e-3', config?.baseUrl);
    
    this.client = new OpenAI({
      apiKey: apiKey,
      organization: process.env.OPENAI_ORG_ID,
      project: process.env.OPENAI_PROJECT_ID,
      baseURL: config?.baseUrl || this.baseUrl,
      dangerouslyAllowBrowser: true // Required for Obsidian plugin environment
    });

    this.initializeCache();
  }

  /**
   * Generate images using OpenAI's gpt-image-1 model
   */
  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    try {
      this.validateConfiguration();
      
      console.log(`[OpenAI] Generating image with model: ${this.imageModel}, size: ${params.size || '1024x1024'}, quality: ${params.quality || 'standard'}`);
      
      const response = await this.withRetry(async () => {
        const requestParams: OpenAI.Images.ImageGenerateParams = {
          prompt: params.prompt,
          model: this.imageModel,
          n: 1,
          size: params.size as '1024x1024' | '1536x1024' | '1024x1536' || '1024x1024',
          quality: params.quality === 'hd' ? 'hd' : 'standard',
          response_format: 'b64_json'
        };

        console.log(`[OpenAI] Sending request to OpenAI Images API...`);
        const startTime = Date.now();
        
        const result = await this.client.images.generate(requestParams);
        
        const requestTime = Date.now() - startTime;
        console.log(`[OpenAI] Images API request completed in ${requestTime}ms`);
        
        return result;
      }, 2); // Reduced retry count for faster failure detection

      return await this.buildImageResponse(response, params);
    } catch (error) {
      this.handleImageError(error, 'image generation', params);
    }
  }

  /**
   * Validate OpenAI-specific image generation parameters
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

    // Validate prompt length (gpt-image-1 has a 32,000 character limit)
    if (params.prompt.length > 32000) {
      errors.push('Prompt too long (max 32,000 characters for gpt-image-1)');
    }

    // Validate model - only gpt-image-1 supported
    if (params.model && params.model !== 'gpt-image-1') {
      errors.push('Only gpt-image-1 model is supported for OpenAI');
    }

    // Size validation for gpt-image-1
    if (params.size) {
      const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
      if (!validSizes.includes(params.size)) {
        errors.push(`Invalid size for gpt-image-1. Supported sizes: ${validSizes.join(', ')}`);
      }
    }

    // Quality validation for gpt-image-1
    if (params.quality && !['standard', 'hd'].includes(params.quality)) {
      errors.push('Invalid quality for gpt-image-1. Supported qualities: standard, hd');
    }

    // Format validation - OpenAI only supports PNG for gpt-image-1
    if (params.format && params.format !== 'png') {
      warnings.push('OpenAI only supports PNG format, adjusting format');
      adjustedParams.format = 'png';
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedParams
    };
  }

  /**
   * Get OpenAI image generation capabilities
   */
  getImageCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      supportsImageGeneration: true,
      maxContextWindow: 32000, // Character limit for prompts
      supportedFeatures: [
        'text_to_image',
        'quality_control',
        'size_variants',
        'style_control',
        'high_resolution'
      ]
    };
  }

  /**
   * Get supported image sizes for gpt-image-1
   */
  getSupportedImageSizes(): string[] {
    return [...this.supportedSizes];
  }

  /**
   * Get pricing for gpt-image-1 image generation
   */
  async getImageModelPricing(model: string = 'gpt-image-1'): Promise<CostDetails> {
    // gpt-image-1 has fixed pricing regardless of size
    const basePrice = 0.015;

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
   * List available OpenAI image models
   */
  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: this.imageModel,
      name: 'GPT Image 1',
      contextWindow: 32000,
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
        imageGeneration: 0.015,
        currency: 'USD',
        lastUpdated: '2025-01-01'
      }
    }];
  }

  // Private helper methods

  private async buildImageResponse(
    response: OpenAI.Images.ImagesResponse, 
    params: ImageGenerationParams
  ): Promise<ImageGenerationResponse> {
    if (!response.data || response.data.length === 0) {
      throw new Error('No image data received from OpenAI');
    }

    const imageData = response.data[0];
    if (!imageData.b64_json) {
      throw new Error('No base64 image data received from OpenAI');
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.b64_json, 'base64');
    console.log(`[OpenAI] Received base64 image data (${buffer.length} bytes)`);

    // Extract dimensions from size parameter or use default
    const size = params.size || '1024x1024';
    const [width, height] = size === 'auto' ? [1024, 1024] : size.split('x').map(Number);

    const usage: ImageUsage = this.buildImageUsage(1, size, this.imageModel);

    return {
      imageData: buffer,
      format: 'png',
      dimensions: { width, height },
      metadata: {
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        responseFormat: 'b64_json',
        model: this.imageModel,
        provider: this.name,
        generatedAt: new Date().toISOString(),
        originalPrompt: params.prompt,
        created: response.created
      },
      usage,
      revisedPrompt: imageData.revised_prompt
    };
  }
}