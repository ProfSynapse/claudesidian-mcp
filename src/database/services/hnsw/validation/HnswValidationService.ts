/**
 * HnswValidationService - Centralized validation for HNSW operations
 * Follows Single Responsibility Principle by focusing only on validation
 * Leverages existing ValidationUtils to eliminate code duplication
 */

import { validateParams, ValidationError, formatValidationErrors } from '../../../../utils/validationUtils';
import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';

export interface EmbeddingValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  formattedError?: string;
}

export interface ItemValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  skippedReason?: string;
}

export class HnswValidationService {
  private config: HnswConfig;

  constructor(config: HnswConfig) {
    this.config = config;
  }

  /**
   * Validate query embedding for search operations
   * @param embedding Query embedding to validate
   * @returns Validation result with detailed error information
   */
  validateQueryEmbedding(embedding: number[]): EmbeddingValidationResult {
    const schema = {
      type: 'array',
      items: {
        type: 'number',
      },
      minItems: 1,
      maxItems: 4096, // Reasonable upper limit for embeddings
    };

    const errors = validateParams(embedding, schema);

    // Additional validation for embedding values
    if (errors.length === 0) {
      const invalidValues = embedding.filter(val => 
        typeof val !== 'number' || 
        isNaN(val) || 
        !isFinite(val)
      );

      if (invalidValues.length > 0) {
        errors.push({
          path: ['embedding'],
          message: `Embedding contains ${invalidValues.length} invalid values (NaN or infinite)`,
          code: 'INVALID_EMBEDDING_VALUES',
          hint: 'All embedding values must be finite numbers',
        });
      }
    }

    const isValid = errors.length === 0;
    if (!isValid && this.config.validation.strictEmbeddingValidation) {
      logger.systemWarn(
        `Query embedding validation failed: ${formatValidationErrors(errors)}`,
        'HnswValidationService'
      );
    }

    return {
      isValid,
      errors,
      formattedError: errors.length > 0 ? formatValidationErrors(errors) : undefined,
    };
  }

  /**
   * Validate database item for indexing
   * @param item Database item to validate
   * @param expectedDimension Expected embedding dimension
   * @returns Validation result
   */
  validateDatabaseItem(item: DatabaseItem, expectedDimension: number): ItemValidationResult {
    const errors: ValidationError[] = [];

    // Validate item structure
    const itemSchema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
        },
        embedding: {
          type: 'array',
          items: { type: 'number' },
          minItems: expectedDimension,
          maxItems: expectedDimension,
        },
        document: {
          type: 'string',
        },
        metadata: {
          type: 'object',
        },
      },
    };

    const structureErrors = validateParams(item, itemSchema);
    errors.push(...structureErrors);

    // Validate embedding specifically if present
    if (item.embedding) {
      const embeddingResult = this.validateItemEmbedding(item.embedding, expectedDimension);
      if (!embeddingResult.isValid) {
        errors.push(...embeddingResult.errors);
      }
    } else {
      errors.push({
        path: ['embedding'],
        message: 'Embedding is required for indexing',
        code: 'MISSING_EMBEDDING',
        hint: 'Database items must have an embedding array to be indexed',
      });
    }

    const isValid = errors.length === 0;
    let skippedReason: string | undefined;

    if (!isValid) {
      skippedReason = `Validation failed: ${errors.map(e => e.message).join(', ')}`;
      
      if (this.config.validation.strictEmbeddingValidation) {
        logger.systemWarn(
          `Database item validation failed for item ${item.id}: ${skippedReason}`,
          'HnswValidationService'
        );
      }
    }

    return {
      isValid,
      errors,
      skippedReason,
    };
  }

  /**
   * Validate embedding array for a database item
   * @param embedding Embedding array to validate
   * @param expectedDimension Expected dimension
   * @returns Validation result
   */
  private validateItemEmbedding(embedding: number[], expectedDimension: number): EmbeddingValidationResult {
    const errors: ValidationError[] = [];

    // Check dimension
    if (embedding.length !== expectedDimension) {
      errors.push({
        path: ['embedding', 'length'],
        message: `Embedding dimension mismatch: expected ${expectedDimension}, got ${embedding.length}`,
        code: 'DIMENSION_MISMATCH',
        hint: `All embeddings in a collection must have the same dimension (${expectedDimension})`,
      });
    }

    // Check for invalid values
    const invalidIndices: number[] = [];
    embedding.forEach((val, idx) => {
      if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        invalidIndices.push(idx);
      }
    });

    if (invalidIndices.length > 0) {
      errors.push({
        path: ['embedding', 'values'],
        message: `Embedding contains ${invalidIndices.length} invalid values at indices: ${invalidIndices.slice(0, 5).join(', ')}${invalidIndices.length > 5 ? '...' : ''}`,
        code: 'INVALID_EMBEDDING_VALUES',
        hint: 'All embedding values must be finite numbers (not NaN or infinite)',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate collection parameters for indexing
   * @param collectionName Collection name
   * @param items Items to validate
   * @returns Validation summary
   */
  validateCollectionForIndexing(collectionName: string, items: DatabaseItem[]): {
    isValid: boolean;
    validItems: DatabaseItem[];
    invalidItems: Array<{ item: DatabaseItem; reason: string }>;
    dimension: number | null;
  } {
    const collectionSchema = {
      type: 'object',
      required: ['collectionName', 'items'],
      properties: {
        collectionName: {
          type: 'string',
          minLength: 1,
          pattern: '^[a-zA-Z0-9_-]+$',
        },
        items: {
          type: 'array',
          minItems: 0,
        },
      },
    };

    const collectionErrors = validateParams({ collectionName, items }, collectionSchema);
    if (collectionErrors.length > 0) {
      logger.systemError(
        new Error(`Collection validation failed: ${formatValidationErrors(collectionErrors)}`),
        'HnswValidationService'
      );
      return {
        isValid: false,
        validItems: [],
        invalidItems: items.map(item => ({ item, reason: 'Collection validation failed' })),
        dimension: null,
      };
    }

    if (items.length === 0) {
      return {
        isValid: true,
        validItems: [],
        invalidItems: [],
        dimension: null,
      };
    }

    // Determine expected dimension from first valid embedding
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    if (!firstEmbedding) {
      logger.systemWarn(
        `No valid embeddings found in collection ${collectionName}`,
        'HnswValidationService'
      );
      return {
        isValid: false,
        validItems: [],
        invalidItems: items.map(item => ({ item, reason: 'No valid embeddings in collection' })),
        dimension: null,
      };
    }

    const expectedDimension = firstEmbedding.length;
    const validItems: DatabaseItem[] = [];
    const invalidItems: Array<{ item: DatabaseItem; reason: string }> = [];

    // Validate each item
    for (const item of items) {
      const validationResult = this.validateDatabaseItem(item, expectedDimension);
      if (validationResult.isValid) {
        validItems.push(item);
      } else {
        invalidItems.push({
          item,
          reason: validationResult.skippedReason || 'Unknown validation error',
        });
      }
    }

    const isValid = validItems.length > 0;
    if (!isValid) {
      logger.systemWarn(
        `No valid items found in collection ${collectionName} after validation`,
        'HnswValidationService'
      );
    } else if (invalidItems.length > 0) {
      logger.systemLog(
        `Collection ${collectionName}: ${validItems.length} valid items, ${invalidItems.length} invalid items`,
        'HnswValidationService'
      );
    }

    return {
      isValid,
      validItems,
      invalidItems,
      dimension: expectedDimension,
    };
  }

  /**
   * Validate search parameters
   * @param params Search parameters to validate
   * @returns Validation result
   */
  validateSearchParameters(params: {
    collectionName: string;
    queryEmbedding: number[];
    nResults?: number;
    where?: any;
  }): EmbeddingValidationResult {
    const schema = {
      type: 'object',
      required: ['collectionName', 'queryEmbedding'],
      properties: {
        collectionName: {
          type: 'string',
          minLength: 1,
        },
        queryEmbedding: {
          type: 'array',
          items: { type: 'number' },
          minItems: 1,
        },
        nResults: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
        },
        where: {
          type: 'object',
        },
      },
    };

    const errors = validateParams(params, schema);

    // Additional validation for query embedding
    if (errors.length === 0) {
      const embeddingResult = this.validateQueryEmbedding(params.queryEmbedding);
      if (!embeddingResult.isValid) {
        errors.push(...embeddingResult.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      formattedError: errors.length > 0 ? formatValidationErrors(errors) : undefined,
    };
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}