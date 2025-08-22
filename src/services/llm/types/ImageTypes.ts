/**
 * Location: src/services/llm/types/ImageTypes.ts
 * 
 * Purpose: Comprehensive TypeScript types for image generation functionality
 * Integration: Extends existing LLM adapter architecture with image-specific operations
 * 
 * Used by:
 * - BaseImageAdapter: Abstract base class for image adapters
 * - OpenAIImageAdapter: OpenAI gpt-image-1 implementation (available but disabled)
 * - GeminiImageAdapter: Google Imagen 4 implementation
 * - ImageGenerationService: Core orchestration service
 * - ImageFileManager: Vault file operations
 * - GenerateImageMode: MCP interface mode
 */

import { CostDetails, TokenUsage, LLMProviderError } from '../adapters/types';

// Core image generation parameter interfaces
export interface ImageGenerationParams {
  prompt: string;
  provider: 'google'; // Only Google Imagen supported
  model?: string; // imagen-4, imagen-4-ultra, imagen-4-fast
  size?: string; // Legacy support for pixel dimensions (converted to aspectRatio)
  aspectRatio?: AspectRatio; // Google Imagen aspect ratios
  numberOfImages?: number; // 1-4 images
  sampleImageSize?: '1K' | '2K'; // Image resolution
  savePath: string; // vault relative path
  sessionId?: string;
  context?: string;
}

// Image generation response from adapters
export interface ImageGenerationResponse {
  imageData: Buffer;
  format: 'png' | 'jpeg' | 'webp';
  dimensions: { width: number; height: number };
  metadata: Record<string, any>;
  usage?: ImageUsage;
  revisedPrompt?: string; // Some providers may revise the prompt
}

// Image-specific usage tracking
export interface ImageUsage {
  imagesGenerated: number;
  resolution: string;
  model: string;
  provider: string;
}

// Image model pricing structure
export interface ImageModelPricing {
  provider: string;
  model: string;
  costPerImage: number;
  costPerMegapixel?: number;
  currency: string;
  sizes: Record<string, number>; // size -> cost multiplier
  lastUpdated: string; // ISO date string
}

// Image cost calculation details
export interface ImageCostDetails extends Omit<CostDetails, 'rateInputPerMillion' | 'rateOutputPerMillion'> {
  ratePerImage: number;
  ratePerMegapixel?: number;
  resolution: string;
  imagesGenerated: number;
}

// Validation result for image parameters
export interface ImageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  adjustedParams?: Partial<ImageGenerationParams>;
}

// File save operation result
export interface ImageSaveResult {
  success: boolean;
  filePath: string;
  fileName: string;
  fileSize: number;
  dimensions: { width: number; height: number };
  format: string;
  error?: string;
}

// Complete image generation result
export interface ImageGenerationResult {
  success: boolean;
  data?: {
    imagePath: string;
    prompt: string;
    revisedPrompt?: string;
    model: string;
    provider: string;
    dimensions: { width: number; height: number };
    fileSize: number;
    format: string;
    cost?: ImageCostDetails;
    usage?: ImageUsage;
    metadata?: Record<string, any>;
  };
  error?: string;
  validationErrors?: string[];
}

// Provider-specific configuration
export interface ImageProviderConfig {
  provider: 'openai' | 'google'; // OpenAI available but not active
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultSize?: string;
  defaultQuality?: string;
  maxFileSize?: number; // bytes
  supportedFormats?: string[];
  supportedSizes?: string[];
  supportedQualities?: string[];
}

// Image buffer with metadata for internal processing
export interface ImageBuffer {
  data: Buffer;
  format: 'png' | 'jpeg' | 'webp';
  dimensions: { width: number; height: number };
  metadata: {
    prompt: string;
    revisedPrompt?: string;
    model: string;
    provider: string;
    generatedAt: string;
    fileSize: number;
    originalResponse?: Record<string, any>;
  };
}

// OpenAI specific types (available but not active)
export namespace OpenAI {
  export interface ImageGenerationRequest {
    model: 'gpt-4.1'; // Model that supports image_generation tool
    input: string;
    tools: Array<{
      type: 'image_generation';
      size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
      quality?: 'low' | 'medium' | 'high' | 'auto';
      background?: 'transparent' | 'opaque' | 'auto';
    }>;
  }

  export interface ImageGenerationResponse {
    created: number;
    data: Array<{
      url?: string;
      b64_json?: string;
      revised_prompt?: string;
    }>;
  }
}

// Google specific types
export namespace Google {
  export interface ImageGenerationRequest {
    model: 'imagen-4' | 'imagen-4-ultra';
    prompt: { text: string };
    safetySettings?: SafetySetting[];
    generationConfig?: {
      responseMimeType?: string;
      responseSchema?: any;
      seed?: number;
      candidateCount?: number;
    };
  }

  export interface SafetySetting {
    category: string;
    threshold: 'BLOCK_NONE' | 'BLOCK_LOW_AND_ABOVE' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_HIGH_AND_ABOVE';
  }

  export interface ImageGenerationResponse {
    candidates: Array<{
      content?: {
        parts: Array<{
          inlineData?: {
            mimeType: string;
            data: string; // base64
          };
          text?: string;
        }>;
      };
      safetyRatings?: Array<{
        category: string;
        probability: string;
      }>;
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  }
}

// Image generation error types
export class ImageGenerationError extends LLMProviderError {
  constructor(
    message: string,
    provider: string,
    code?: string,
    originalError?: Error,
    public imageParams?: ImageGenerationParams
  ) {
    super(message, provider, code, originalError);
    this.name = 'ImageGenerationError';
  }
}

// Supported providers and models
export type ImageProvider = 'openai' | 'google'; // OpenAI available but not active

export type ImageModel = 
  | 'gpt-image-1'        // OpenAI (available but not active)
  | 'imagen-4'           // Google
  | 'imagen-4-ultra'     // Google
  | 'imagen-4-fast';     // Google

// Aspect ratio constants
export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  LANDSCAPE_4_3 = '4:3',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_16_9 = '16:9'
}

// Image size presets
export const IMAGE_SIZES = {
  SQUARE_1024: '1024x1024',
  PORTRAIT: '1024x1536',  // Supported by both providers
  LANDSCAPE: '1536x1024', // Supported by both providers
  AUTO: 'auto'            // OpenAI automatic sizing (available but not active)
} as const;

export type ImageSize = typeof IMAGE_SIZES[keyof typeof IMAGE_SIZES];

// Image quality options
export const IMAGE_QUALITIES = {
  STANDARD: 'standard',
  HD: 'hd'
} as const;

export type ImageQuality = typeof IMAGE_QUALITIES[keyof typeof IMAGE_QUALITIES];

// Supported image formats
export const IMAGE_FORMATS = {
  PNG: 'png',
  JPEG: 'jpeg', 
  WEBP: 'webp'
} as const;

export type ImageFormat = typeof IMAGE_FORMATS[keyof typeof IMAGE_FORMATS];

// Safety levels for content filtering
export const SAFETY_LEVELS = {
  STRICT: 'strict',
  STANDARD: 'standard', 
  PERMISSIVE: 'permissive'
} as const;

export type SafetyLevel = typeof SAFETY_LEVELS[keyof typeof SAFETY_LEVELS];