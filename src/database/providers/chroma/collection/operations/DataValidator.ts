/**
 * DataValidator - Handles input validation and type conversion
 * Follows Single Responsibility Principle by focusing only on data validation
 */

import { ChromaAddParams, ChromaGetParams, ChromaUpdateParams, ChromaDeleteParams, ChromaQueryParams } from '../../PersistentChromaClient';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface NormalizedAddParams {
  ids: string[];
  embeddings: number[][];
  metadatas: Record<string, any>[];
  documents: string[];
}

export interface NormalizedUpdateParams {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}

/**
 * Service responsible for input validation and type conversion
 * Follows SRP by focusing only on validation operations
 */
export class DataValidator {
  /**
   * Validate and normalize add parameters
   */
  validateAndNormalizeAddParams(params: ChromaAddParams): {
    valid: boolean;
    error?: string;
    normalized?: NormalizedAddParams;
  } {
    try {
      // Validate required parameters
      if (!params.ids) {
        return { valid: false, error: 'IDs are required' };
      }

      // Convert all params to arrays for consistent handling
      const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
      const embeddings = params.embeddings ? (Array.isArray(params.embeddings[0]) 
        ? params.embeddings as number[][] 
        : [params.embeddings as number[]]) : [];
      
      const metadatas = params.metadatas ? (Array.isArray(params.metadatas) 
        ? params.metadatas as Record<string, any>[] 
        : [params.metadatas as Record<string, any>]) : [];
      
      const documents = params.documents ? (Array.isArray(params.documents) 
        ? params.documents as string[] 
        : [params.documents as string]) : [];

      // Validate array lengths match
      if (embeddings.length > 0 && embeddings.length !== ids.length) {
        return { valid: false, error: 'Embeddings array length must match IDs array length' };
      }

      if (metadatas.length > 0 && metadatas.length !== ids.length) {
        return { valid: false, error: 'Metadatas array length must match IDs array length' };
      }

      if (documents.length > 0 && documents.length !== ids.length) {
        return { valid: false, error: 'Documents array length must match IDs array length' };
      }

      // Validate ID uniqueness
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        return { valid: false, error: 'All IDs must be unique' };
      }

      // Validate embedding dimensions if provided
      if (embeddings.length > 0) {
        const firstEmbeddingDim = embeddings[0].length;
        for (let i = 1; i < embeddings.length; i++) {
          if (embeddings[i].length !== firstEmbeddingDim) {
            return { valid: false, error: 'All embeddings must have the same dimension' };
          }
        }
      }

      return {
        valid: true,
        normalized: {
          ids,
          embeddings,
          metadatas,
          documents
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate get parameters
   */
  validateGetParams(params: ChromaGetParams): ValidationResult {
    try {
      // Validate include parameter
      if (params.include) {
        const validIncludes = ['embeddings', 'metadatas', 'documents', 'distances'];
        const invalidIncludes = params.include.filter(inc => !validIncludes.includes(inc));
        if (invalidIncludes.length > 0) {
          return { valid: false, error: `Invalid include values: ${invalidIncludes.join(', ')}` };
        }
      }

      // Validate limit and offset
      if (params.limit !== undefined && params.limit <= 0) {
        return { valid: false, error: 'Limit must be greater than 0' };
      }

      if (params.offset !== undefined && params.offset < 0) {
        return { valid: false, error: 'Offset must be non-negative' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate and normalize update parameters
   */
  validateAndNormalizeUpdateParams(params: ChromaUpdateParams): {
    valid: boolean;
    error?: string;
    normalized?: NormalizedUpdateParams;
  } {
    try {
      // Validate required parameters
      if (!params.ids || !Array.isArray(params.ids) || params.ids.length === 0) {
        return { valid: false, error: 'IDs array is required and must not be empty' };
      }

      const ids = params.ids;
      const embeddings = params.embeddings;
      const metadatas = params.metadatas;
      const documents = params.documents;

      // Validate array lengths match if provided
      if (embeddings && embeddings.length !== ids.length) {
        return { valid: false, error: 'Embeddings array length must match IDs array length' };
      }

      if (metadatas && metadatas.length !== ids.length) {
        return { valid: false, error: 'Metadatas array length must match IDs array length' };
      }

      if (documents && documents.length !== ids.length) {
        return { valid: false, error: 'Documents array length must match IDs array length' };
      }

      // Validate embedding dimensions if provided
      if (embeddings && embeddings.length > 0) {
        const firstEmbeddingDim = embeddings[0].length;
        for (let i = 1; i < embeddings.length; i++) {
          if (embeddings[i].length !== firstEmbeddingDim) {
            return { valid: false, error: 'All embeddings must have the same dimension' };
          }
        }
      }

      return {
        valid: true,
        normalized: {
          ids,
          embeddings,
          metadatas,
          documents
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate delete parameters
   */
  validateDeleteParams(params: ChromaDeleteParams): ValidationResult {
    try {
      // At least one of ids or where must be provided
      if (!params.ids && !params.where) {
        return { valid: false, error: 'Either IDs or where clause must be provided' };
      }

      // Validate IDs if provided
      if (params.ids && (!Array.isArray(params.ids) || params.ids.length === 0)) {
        return { valid: false, error: 'IDs must be a non-empty array if provided' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate query parameters
   */
  validateQueryParams(params: ChromaQueryParams): ValidationResult {
    try {
      // Either queryEmbeddings, queryTexts, or where clause must be provided
      // This enables metadata-only filtering without semantic search
      if (!params.queryEmbeddings && !params.queryTexts && !params.where) {
        return { valid: false, error: 'Either queryEmbeddings, queryTexts, or where clause must be provided' };
      }

      // Validate nResults
      if (params.nResults !== undefined && params.nResults <= 0) {
        return { valid: false, error: 'nResults must be greater than 0' };
      }

      // Validate include parameter
      if (params.include) {
        const validIncludes = ['embeddings', 'metadatas', 'documents', 'distances'];
        const invalidIncludes = params.include.filter(inc => !validIncludes.includes(inc));
        if (invalidIncludes.length > 0) {
          return { valid: false, error: `Invalid include values: ${invalidIncludes.join(', ')}` };
        }
      }

      // Validate embedding dimensions if provided
      if (params.queryEmbeddings && params.queryEmbeddings.length > 0) {
        const firstEmbeddingDim = params.queryEmbeddings[0].length;
        for (let i = 1; i < params.queryEmbeddings.length; i++) {
          if (params.queryEmbeddings[i].length !== firstEmbeddingDim) {
            return { valid: false, error: 'All query embeddings must have the same dimension' };
          }
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}