/**
 * Data Conversion Service for HNSW Search
 * Handles conversion between different data formats following SRP
 */

import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { logger } from '../../../../utils/logger';

/**
 * Service responsible for converting data between different formats
 * Follows SRP by focusing only on data conversion logic
 */
export class DataConversionService {

  /**
   * Convert ChromaDB items to DatabaseItem format
   * Handles validation and type conversion for embeddings
   */
  convertToDatabaseItems(items: any): DatabaseItem[] {
    const databaseItems: DatabaseItem[] = [];
    
    if (!items.ids || !items.embeddings || !items.documents) {
      logger.systemWarn('Invalid ChromaDB items structure - missing required fields', 'DataConversionService');
      return databaseItems;
    }

    for (let i = 0; i < items.ids.length; i++) {
      const rawEmbedding = items.embeddings[i] || [];
      
      // Convert embedding to regular array of numbers
      const validEmbedding = this.convertEmbedding(rawEmbedding, i);
      
      const item: DatabaseItem = {
        id: String(items.ids[i]),
        embedding: validEmbedding,
        document: String(items.documents[i] || ''),
        metadata: items.metadatas?.[i] || {}
      };
      
      // Only include items that have valid embeddings
      if (item.embedding && item.embedding.length > 0) {
        databaseItems.push(item);
      } else {
        logger.systemWarn(
          `Skipping item ${i} with invalid embedding: length=${item.embedding?.length}`,
          'DataConversionService'
        );
      }
    }

    logger.systemLog(`Converted ${databaseItems.length}/${items.ids.length} items successfully`, 'DataConversionService');
    return databaseItems;
  }

  /**
   * Convert various embedding formats to number array
   */
  private convertEmbedding(rawEmbedding: any, itemIndex: number): number[] {
    let validEmbedding: number[] = [];
    
    if (rawEmbedding && typeof rawEmbedding === 'object' && rawEmbedding.length > 0) {
      // Handle typed arrays (Float32Array, Float64Array, etc.) and regular arrays
      if (Array.isArray(rawEmbedding) || rawEmbedding.constructor?.name?.includes('Array')) {
        validEmbedding = Array.from(rawEmbedding).map((val: any) => {
          const numVal = Number(val);
          if (isNaN(numVal) || !isFinite(numVal)) {
            logger.systemWarn(
              `Invalid embedding value at item ${itemIndex}: ${val}, defaulting to 0`, 
              'DataConversionService'
            );
            return 0; // Default to 0 for invalid values
          }
          return numVal;
        });
      }
    }
    
    return validEmbedding;
  }

  /**
   * Validate embedding dimensions
   */
  validateEmbeddingDimensions(embeddings: number[][], expectedDimension?: number): boolean {
    if (embeddings.length === 0) {
      return true; // Empty is valid
    }

    const firstDimension = embeddings[0].length;
    
    // Check if expected dimension is provided and matches
    if (expectedDimension && firstDimension !== expectedDimension) {
      logger.systemWarn(
        `Embedding dimension mismatch: expected ${expectedDimension}, got ${firstDimension}`,
        'DataConversionService'
      );
      return false;
    }

    // Check if all embeddings have the same dimension
    for (let i = 1; i < embeddings.length; i++) {
      if (embeddings[i].length !== firstDimension) {
        logger.systemWarn(
          `Inconsistent embedding dimensions: first=${firstDimension}, item ${i}=${embeddings[i].length}`,
          'DataConversionService'
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Extract embeddings from database items
   */
  extractEmbeddings(items: DatabaseItem[]): number[][] {
    return items
      .map(item => item.embedding)
      .filter(embedding => embedding && embedding.length > 0);
  }

  /**
   * Get statistics about converted data
   */
  getConversionStats(items: DatabaseItem[]): {
    totalItems: number;
    validEmbeddings: number;
    averageDimension: number;
    dimensionRange: { min: number; max: number };
  } {
    const validEmbeddings = items.filter(item => item.embedding && item.embedding.length > 0);
    const dimensions = validEmbeddings.map(item => item.embedding.length);
    
    return {
      totalItems: items.length,
      validEmbeddings: validEmbeddings.length,
      averageDimension: dimensions.length > 0 ? Math.round(dimensions.reduce((a, b) => a + b, 0) / dimensions.length) : 0,
      dimensionRange: {
        min: dimensions.length > 0 ? Math.min(...dimensions) : 0,
        max: dimensions.length > 0 ? Math.max(...dimensions) : 0
      }
    };
  }
}