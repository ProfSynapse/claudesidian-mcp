/**
 * Common utilities for embedding providers
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
}

export interface ProviderConfig {
  name: string;
  rateLimit: RateLimitConfig;
  retry: RetryConfig;
  batchSize?: number;
}

/**
 * Provider-specific configurations
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    rateLimit: {
      requestsPerMinute: 3000,
      requestsPerHour: 10000
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    },
    batchSize: 10
  },
  mistral: {
    name: 'Mistral',
    rateLimit: {
      requestsPerMinute: 30, // Very conservative for Mistral
      requestsPerHour: 1000
    },
    retry: {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2
    },
    batchSize: 3
  },
  gemini: {
    name: 'Google Gemini',
    rateLimit: {
      requestsPerMinute: 15, // Conservative due to free tier limits
      requestsPerHour: 1500
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1500,
      maxDelay: 15000,
      backoffMultiplier: 2
    },
    batchSize: 1 // Gemini processes one at a time
  },
  cohere: {
    name: 'Cohere',
    rateLimit: {
      requestsPerMinute: 100,
      requestsPerHour: 5000
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    },
    batchSize: 96 // Cohere supports up to 96 texts per request
  },
  voyageai: {
    name: 'VoyageAI',
    rateLimit: {
      requestsPerMinute: 300,
      requestsPerHour: 10000
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    },
    batchSize: 128
  }
};

/**
 * Common error types for embedding providers
 */
export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public providerId?: string,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

export class RateLimitError extends EmbeddingProviderError {
  constructor(message: string, providerId?: string) {
    super(message, 429, providerId, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Sleep utility function
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Calculate delay for exponential backoff
 */
export const calculateBackoffDelay = (
  attempt: number,
  config: RetryConfig
): number => {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier || 2, attempt);
  return Math.min(delay, config.maxDelay || 30000);
};

/**
 * Check if an error is retryable
 */
export const isRetryableError = (error: any): boolean => {
  if (error instanceof EmbeddingProviderError) {
    return error.isRetryable;
  }
  
  // Check for common retryable HTTP status codes
  if (error.statusCode || error.status) {
    const status = error.statusCode || error.status;
    return status === 429 || status === 503 || status === 502 || status === 504;
  }
  
  // Check error messages for retryable conditions
  const message = error.message?.toLowerCase() || '';
  return message.includes('rate limit') || 
         message.includes('too many requests') ||
         message.includes('service unavailable') ||
         message.includes('timeout');
};

/**
 * Parse error response from API
 */
export const parseErrorResponse = async (
  response: Response,
  providerId: string
): Promise<EmbeddingProviderError> => {
  let errorData: any;
  
  try {
    const errorText = await response.text();
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: { message: errorText } };
    }
  } catch {
    errorData = { error: { message: 'Unknown error' } };
  }
  
  const message = errorData.error?.message || errorData.message || response.statusText;
  const isRetryable = response.status === 429 || response.status >= 500;
  
  if (response.status === 429) {
    return new RateLimitError(`${providerId} rate limit exceeded: ${message}`, providerId);
  }
  
  return new EmbeddingProviderError(
    `${providerId} API error (${response.status}): ${message}`,
    response.status,
    providerId,
    isRetryable
  );
};

/**
 * Generic retry wrapper with exponential backoff
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  providerId: string,
  operationName: string = 'operation'
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === config.maxRetries) {
        console.error(`${providerId} ${operationName} failed after ${config.maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      if (!isRetryableError(error)) {
        console.error(`${providerId} ${operationName} failed with non-retryable error:`, error);
        throw error;
      }
      
      const delay = calculateBackoffDelay(attempt, config);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`${providerId} ${operationName} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, errorMessage);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Fetch with retry and error handling
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  providerId: string,
  config?: RetryConfig
): Promise<Response> => {
  const retryConfig = config || PROVIDER_CONFIGS[providerId]?.retry || {
    maxRetries: 3,
    baseDelay: 1000,
    backoffMultiplier: 2
  };
  
  return withRetry(
    async () => {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw await parseErrorResponse(response, providerId);
      }
      
      return response;
    },
    retryConfig,
    providerId,
    'fetch'
  );
};

/**
 * Validate response data format
 */
export const validateEmbeddingResponse = (
  data: any,
  providerId: string,
  expectedDataField: string = 'data'
): number[][] => {
  if (!data[expectedDataField] || !Array.isArray(data[expectedDataField])) {
    throw new EmbeddingProviderError(
      `Invalid response format from ${providerId} API: missing or invalid ${expectedDataField} field`,
      undefined,
      providerId
    );
  }
  
  const embeddings = data[expectedDataField];
  
  // Handle different response formats by provider
  if (providerId === 'Cohere') {
    // Cohere returns embeddings directly as arrays of numbers
    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i];
      if (!Array.isArray(embedding) || typeof embedding[0] !== 'number') {
        throw new EmbeddingProviderError(
          `Invalid embedding format at index ${i} from ${providerId} API: expected array of numbers`,
          undefined,
          providerId
        );
      }
    }
    return embeddings;
  } else {
    // Other providers wrap embeddings in objects
    for (let i = 0; i < embeddings.length; i++) {
      const item = embeddings[i];
      const embedding = item.embedding || item.values || item;
      
      if (!Array.isArray(embedding)) {
        throw new EmbeddingProviderError(
          `Invalid embedding format at index ${i} from ${providerId} API`,
          undefined,
          providerId
        );
      }
    }
    return embeddings.map((item: any) => item.embedding || item.values || item);
  }
};

/**
 * Log provider operation
 */
export const logProviderOperation = (
  providerId: string,
  operation: string,
  textsCount: number,
  model?: string
): void => {
};