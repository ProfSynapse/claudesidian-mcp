import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { CategoryType } from '../../types';

/**
 * Service to handle semantic search availability and fallback logic
 */
export class SemanticFallbackService {
  constructor(
    private embeddingService?: EmbeddingService
  ) {}

  /**
   * Check if semantic search is available
   */
  isSemanticAvailable(): boolean {
    return this.embeddingService?.areEmbeddingsEnabled() || false;
  }

  /**
   * Determine if a category should use semantic search
   */
  shouldUseSemanticSearch(category: CategoryType, forceSemanticSearch?: boolean): boolean {
    // If semantic search is forced and available, use it
    if (forceSemanticSearch && this.isSemanticAvailable()) {
      return true;
    }

    // If semantic search is not available, always return false
    if (!this.isSemanticAvailable()) {
      return false;
    }

    // Category-specific semantic search preferences
    switch (category) {
      case 'content':
      case 'workspaces':
      case 'sessions':
      case 'snapshots':
      case 'memory_traces':
        // These categories benefit most from semantic search
        return true;
      
      case 'files':
      case 'folders':
      case 'tags':
      case 'properties':
        // These categories typically work better with exact/fuzzy matching
        // unless explicitly forced
        return forceSemanticSearch || false;
      
      default:
        return false;
    }
  }

  /**
   * Get search method name for a category
   */
  getSearchMethod(category: CategoryType, forceSemanticSearch?: boolean): 'semantic' | 'fuzzy' | 'exact' | 'hybrid' {
    if (this.shouldUseSemanticSearch(category, forceSemanticSearch)) {
      return 'semantic';
    }

    switch (category) {
      case 'files':
      case 'folders':
        return 'fuzzy';
      case 'tags':
      case 'properties':
        return 'exact';
      default:
        return 'fuzzy';
    }
  }

  /**
   * Get categories that will use fallback (non-semantic) search
   */
  getFallbackCategories(requestedCategories: CategoryType[], forceSemanticSearch?: boolean): CategoryType[] {
    if (!this.isSemanticAvailable()) {
      // All categories that would prefer semantic search become fallbacks
      return requestedCategories.filter(category => 
        this.shouldUseSemanticSearch(category, true) // Check what they would prefer if semantic was available
      );
    }

    if (forceSemanticSearch) {
      // No fallbacks when semantic is forced and available
      return [];
    }

    // Categories that naturally use non-semantic methods
    return requestedCategories.filter(category => 
      !this.shouldUseSemanticSearch(category, false)
    );
  }
}