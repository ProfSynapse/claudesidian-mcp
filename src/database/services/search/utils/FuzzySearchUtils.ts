/**
 * FuzzySearchUtils - Utility functions for fuzzy search operations
 * Location: src/database/services/search/utils/FuzzySearchUtils.ts
 * Usage: Provides common algorithms and utilities for fuzzy matching operations
 */

import { 
  SynonymMappings, 
  StemCache, 
  SoundexMapping,
  FUZZY_SEARCH_DEFAULTS 
} from '@/types/search/FuzzySearchTypes';

export class FuzzySearchUtils {
  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Simple stemming algorithm (Porter-like)
   */
  static stem(word: string, cache: StemCache): string {
    if (cache.has(word)) {
      return cache.get(word)!;
    }
    
    let stem = word.toLowerCase();
    
    // Remove common suffixes
    const suffixes = [
      'ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion', 'ness', 'ment', 'ful', 'less', 'able', 'ible', 's'
    ];
    
    for (const suffix of suffixes) {
      if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
        stem = stem.slice(0, -suffix.length);
        break;
      }
    }
    
    cache.set(word, stem);
    return stem;
  }

  /**
   * Simple Soundex algorithm for phonetic matching
   */
  static soundex(word: string): string {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length === 0) return '0000';
    
    let soundex = cleaned[0].toUpperCase();
    
    const mapping: SoundexMapping = {
      'b': '1', 'f': '1', 'p': '1', 'v': '1',
      'c': '2', 'g': '2', 'j': '2', 'k': '2', 'q': '2', 's': '2', 'x': '2', 'z': '2',
      'd': '3', 't': '3',
      'l': '4',
      'm': '5', 'n': '5',
      'r': '6'
    };
    
    for (let i = 1; i < cleaned.length && soundex.length < 4; i++) {
      const code = mapping[cleaned[i]];
      if (code && code !== soundex[soundex.length - 1]) {
        soundex += code;
      }
    }
    
    return soundex.padEnd(4, '0').substring(0, FUZZY_SEARCH_DEFAULTS.SOUNDEX_LENGTH);
  }

  /**
   * Tokenize text into words
   */
  static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  /**
   * Initialize domain-specific synonym mappings
   */
  static createSynonymMappings(): Map<string, string[]> {
    const synonyms: SynonymMappings = {
      'clustering': ['grouping', 'classification', 'segmentation', 'partitioning'],
      'algorithm': ['method', 'procedure', 'technique', 'approach'],
      'machine': ['automated', 'artificial', 'computer'],
      'learning': ['training', 'education', 'acquisition'],
      'neural': ['network', 'brain', 'artificial'],
      'data': ['information', 'dataset', 'records'],
      'model': ['framework', 'structure', 'representation'],
      'analysis': ['examination', 'study', 'investigation'],
      'kabbalah': ['mysticism', 'esoteric', 'spiritual'],
      'folklore': ['mythology', 'tradition', 'legend'],
      'recipe': ['formula', 'instructions', 'method'],
      'cooking': ['culinary', 'kitchen', 'preparation']
    };
    
    const synonymMap = new Map<string, string[]>();
    for (const [key, values] of Object.entries(synonyms)) {
      synonymMap.set(key, values);
    }
    
    return synonymMap;
  }
}