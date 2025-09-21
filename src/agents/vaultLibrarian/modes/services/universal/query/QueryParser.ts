/**
 * QueryParser - Handles search query parsing and normalization
 * Follows Single Responsibility Principle by focusing only on query parsing
 */

// PropertyFilter removed in simplified architecture
type PropertyFilter = any;
import { UniversalSearchValidator } from '../validation/UniversalSearchValidator';

export interface ParsedSearchQuery {
  cleanQuery: string;
  tags: string[];
  properties: PropertyFilter[];
}

export interface QueryParsingResult {
  success: boolean;
  error?: string;
  parsed?: ParsedSearchQuery;
}

/**
 * Service responsible for parsing and normalizing search queries
 * Follows SRP by focusing only on query parsing operations
 */
export class QueryParser {
  private validator: UniversalSearchValidator;

  constructor() {
    this.validator = new UniversalSearchValidator();
  }
  /**
   * Parse search query into components
   */
  parseSearchQuery(query: string): QueryParsingResult {
    try {
      if (!query || typeof query !== 'string') {
        return {
          success: false,
          error: 'Query must be a non-empty string'
        };
      }

      const parsed: ParsedSearchQuery = {
        cleanQuery: query.trim(),
        tags: [],
        properties: []
      };

      // Extract tags (e.g., #tag1 #tag2)
      const tagMatches = query.match(/#[\w-]+/g);
      if (tagMatches) {
        parsed.tags = tagMatches.map(tag => tag.substring(1)); // Remove #
        // Remove tags from the clean query
        parsed.cleanQuery = parsed.cleanQuery.replace(/#[\w-]+/g, '').trim();
      }

      // Extract property filters (e.g., property:value)
      const propertyMatches = query.match(/(\w+):([^\s]+)/g);
      if (propertyMatches) {
        const context = this.validator.createValidationContext('QueryParser', 'parseSearchQuery', 'property_parsing');
        
        parsed.properties = propertyMatches.map(match => {
          // MEDIUM RISK FIX: Validate match before split() operation
          const validatedMatch = this.validator.validateQuery(match, context);
          
          if (validatedMatch.length === 0 || !validatedMatch.includes(':')) {
            return { key: '', value: '' };
          }
          
          // Now safe to split - guaranteed valid string
          const [key, value] = validatedMatch.split(':');
          return { key: key || '', value: value || '' };
        }).filter(prop => prop.key.length > 0); // Remove invalid properties
        
        // Remove property filters from the clean query
        parsed.cleanQuery = parsed.cleanQuery.replace(/\w+:[^\s]+/g, '').trim();
      }

      // Clean up extra whitespace
      parsed.cleanQuery = parsed.cleanQuery.replace(/\s+/g, ' ').trim();

      return {
        success: true,
        parsed
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse query: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Normalize query for search
   */
  normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
  }

  /**
   * Extract search terms from query with validation to prevent split() errors
   */
  extractSearchTerms(query: string): string[] {
    const context = this.validator.createValidationContext('QueryParser', 'extractSearchTerms', 'term_extraction');
    
    // Validate query before normalization and split()
    const validatedQuery = this.validator.validateQuery(query, context);
    
    if (validatedQuery.length === 0) {
      return [];
    }
    
    const normalized = this.normalizeQuery(validatedQuery);
    
    // Validate normalized query as well (defensive programming)
    const validatedNormalized = this.validator.validateQuery(normalized, context);
    
    if (validatedNormalized.length === 0) {
      return [];
    }
    
    // Now safe to split - guaranteed valid string
    return validatedNormalized.split(/\s+/).filter(term => term.length > 0);
  }

  /**
   * Check if query contains advanced syntax
   */
  hasAdvancedSyntax(query: string): boolean {
    // Check for tags, properties, or other advanced syntax
    return /#[\w-]+/.test(query) || /\w+:[^\s]+/.test(query);
  }

  /**
   * Validate query format
   */
  validateQuery(query: string): {
    valid: boolean;
    error?: string;
  } {
    if (!query || typeof query !== 'string') {
      return {
        valid: false,
        error: 'Query must be a non-empty string'
      };
    }

    if (query.trim().length === 0) {
      return {
        valid: false,
        error: 'Query cannot be empty'
      };
    }

    if (query.length > 1000) {
      return {
        valid: false,
        error: 'Query too long (max 1000 characters)'
      };
    }

    return { valid: true };
  }

  /**
   * Extract quoted phrases from query
   */
  extractQuotedPhrases(query: string): {
    phrases: string[];
    cleanQuery: string;
  } {
    const phrases: string[] = [];
    let cleanQuery = query;

    // Extract quoted phrases
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        const phrase = match.substring(1, match.length - 1); // Remove quotes
        phrases.push(phrase);
        cleanQuery = cleanQuery.replace(match, '').trim();
      });
    }

    return {
      phrases,
      cleanQuery: cleanQuery.replace(/\s+/g, ' ').trim()
    };
  }

  /**
   * Build search criteria from parsed query
   */
  buildSearchCriteria(parsed: ParsedSearchQuery): {
    hasMetadataFilters: boolean;
    hasContentQuery: boolean;
    metadataFilters: {
      tags: string[];
      properties: PropertyFilter[];
    };
    contentQuery: string;
  } {
    return {
      hasMetadataFilters: parsed.tags.length > 0 || parsed.properties.length > 0,
      hasContentQuery: parsed.cleanQuery.length > 0,
      metadataFilters: {
        tags: parsed.tags,
        properties: parsed.properties
      },
      contentQuery: parsed.cleanQuery
    };
  }

  /**
   * Get query statistics
   */
  getQueryStatistics(query: string): {
    originalLength: number;
    wordCount: number;
    tagCount: number;
    propertyCount: number;
    hasQuotedPhrases: boolean;
  } {
    const parseResult = this.parseSearchQuery(query);
    const quotedPhrases = this.extractQuotedPhrases(query);
    const words = this.extractSearchTerms(query);

    return {
      originalLength: query.length,
      wordCount: words.length,
      tagCount: parseResult.parsed?.tags.length || 0,
      propertyCount: parseResult.parsed?.properties.length || 0,
      hasQuotedPhrases: quotedPhrases.phrases.length > 0
    };
  }
}