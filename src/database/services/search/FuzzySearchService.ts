/**
 * FuzzySearchService - Handles typos, variations, stemming, and synonym matching
 * Provides intelligent fuzzy matching with domain-specific enhancements
 */

import { TFile } from 'obsidian';

export interface FuzzySearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  searchMethod: 'fuzzy';
  metadata: {
    filePath: string;
    fileId: string;
    timestamp: number;
    fuzzyMatches: FuzzyMatch[];
    editDistance: number;
    similarity: number;
    // ✅ ENHANCED QUALITY METADATA
    qualityTier?: 'high' | 'medium' | 'low' | 'minimal';
    confidenceLevel?: number;
    matchType?: string;
    qualityDescription?: string;
    matchCount?: number;
    searchTermCount?: number;
    matchRatio?: number;
    averageEditDistance?: number;
    exactMatches?: number;
    typoMatches?: number;
    phoneticMatches?: number;
    scoreMethod?: string;
  };
  content?: string;
}

export interface FuzzyMatch {
  original: string;
  matched: string;
  distance: number;
  similarity: number;
  matchType: 'typo' | 'stem' | 'synonym' | 'phonetic';
}

export interface FuzzyDocument {
  id: string;
  title: string;
  content: string;
  filePath: string;
  metadata: Record<string, any>;
}

export class FuzzySearchService {
  private documents: Map<string, FuzzyDocument> = new Map();
  private stemCache: Map<string, string> = new Map();
  private synonymMap: Map<string, string[]> = new Map();

  constructor() {
    this.initializeSynonymMap();
  }

  /**
   * Index a document for fuzzy search
   */
  indexDocument(doc: FuzzyDocument): void {
    this.documents.set(doc.id, doc);
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): void {
    this.documents.delete(docId);
  }

  /**
   * Search documents using fuzzy matching
   * ENHANCED: Score-based ranking with quality classification
   */
  search(
    query: string,
    fuzzyTerms: string[],
    limit = 10,
    threshold = 0.6, // Preserved for API compatibility but ignored when threshold = 0
    filteredFiles?: TFile[]
  ): FuzzySearchResult[] {
    if (!query.trim() && fuzzyTerms.length === 0) return [];

    const searchTerms = fuzzyTerms.length > 0 ? fuzzyTerms : [query];
    const results: Array<{ 
      doc: FuzzyDocument; 
      score: number; 
      matches: FuzzyMatch[]; 
      distance: number;
      qualityAssessment?: {
        tier: 'high' | 'medium' | 'low' | 'minimal';
        confidence: number;
        matchType: string;
        description: string;
      };
    }> = [];
    const useThresholdFiltering = threshold > 0; // Enable score-based ranking when threshold is 0

    console.log('[FUZZY_SEARCH] Search mode:', useThresholdFiltering ? 'threshold-filtered' : 'score-based ranking');
    console.log('[FUZZY_SEARCH] Processing', this.documents.size, 'documents...');

    for (const [docId, doc] of this.documents) {
      // Apply file filtering if provided
      if (filteredFiles) {
        const allowedPaths = filteredFiles.map(f => f.path);
        if (!allowedPaths.includes(doc.filePath)) {
          continue;
        }
      }

      const matchResult = this.calculateFuzzyMatches(doc, searchTerms);
      
      // ✅ INCLUDE ALL FUZZY MATCHES WHEN THRESHOLD = 0 (score-based ranking)
      if (!useThresholdFiltering || matchResult.score >= threshold) {
        // ✅ QUALITY CLASSIFICATION FOR ALL MATCHES
        const qualityAssessment = this.classifyFuzzyQuality(matchResult, searchTerms);
        
        results.push({
          doc,
          score: matchResult.score,
          matches: matchResult.matches,
          distance: matchResult.totalDistance,
          qualityAssessment
        });
      }
    }

    console.log('[FUZZY_SEARCH] Found', results.length, 'fuzzy matches');
    
    if (!useThresholdFiltering && results.length > 0) {
      const qualityDistribution = this.calculateFuzzyQualityDistribution(results);
      console.log('[FUZZY_SEARCH] Quality distribution:', qualityDistribution);
    }

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(result => ({
      id: result.doc.id,
      title: result.doc.title,
      snippet: this.generateSnippet(result.doc, searchTerms),
      score: result.score,
      searchMethod: 'fuzzy' as const,
      metadata: {
        filePath: result.doc.filePath,
        fileId: result.doc.id,
        timestamp: Date.now(),
        fuzzyMatches: result.matches,
        editDistance: result.distance,
        similarity: result.score,
        
        // ✅ ENHANCED QUALITY METADATA
        ...(result.qualityAssessment && {
          qualityTier: result.qualityAssessment.tier,
          confidenceLevel: result.qualityAssessment.confidence,
          matchType: result.qualityAssessment.matchType,
          qualityDescription: result.qualityAssessment.description,
          
          // ✅ FUZZY-SPECIFIC METADATA
          matchCount: result.matches.length,
          searchTermCount: searchTerms.length,
          matchRatio: result.matches.length / searchTerms.length,
          averageEditDistance: result.distance / Math.max(result.matches.length, 1),
          
          // ✅ MATCH DETAILS
          exactMatches: result.matches.filter(m => m.distance === 0).length,
          typoMatches: result.matches.filter(m => m.distance === 1).length,
          phoneticMatches: result.matches.filter(m => m.matchType === 'phonetic').length,
          scoreMethod: 'fuzzy'
        })
      }
    }));
  }

  /**
   * Calculate fuzzy matches for a document against search terms
   */
  private calculateFuzzyMatches(
    doc: FuzzyDocument, 
    searchTerms: string[]
  ): { score: number; matches: FuzzyMatch[]; totalDistance: number } {
    const allText = (doc.title + ' ' + doc.content).toLowerCase();
    const words = this.tokenize(allText);
    
    let totalScore = 0;
    let totalMatches = 0;
    let totalDistance = 0;
    const matches: FuzzyMatch[] = [];

    for (const term of searchTerms) {
      const termMatches = this.findBestMatches(term.toLowerCase(), words);
      
      if (termMatches.length > 0) {
        const bestMatch = termMatches[0];
        matches.push(bestMatch);
        totalScore += bestMatch.similarity;
        totalDistance += bestMatch.distance;
        totalMatches++;
      }
    }

    // Calculate average score
    const averageScore = totalMatches > 0 ? totalScore / totalMatches : 0;
    
    // Boost score based on number of matches
    const matchRatio = totalMatches / searchTerms.length;
    const finalScore = averageScore * (0.7 + 0.3 * matchRatio);

    return {
      score: finalScore,
      matches,
      totalDistance
    };
  }

  /**
   * Find the best fuzzy matches for a term against a list of words
   */
  private findBestMatches(term: string, words: string[]): FuzzyMatch[] {
    const matches: FuzzyMatch[] = [];

    for (const word of words) {
      // Skip very short words unless they're exact matches
      if (word.length < 3 && word !== term) continue;

      // Try different match types
      const typoMatch = this.tryTypoMatch(term, word);
      if (typoMatch) matches.push(typoMatch);

      const stemMatch = this.tryStemMatch(term, word);
      if (stemMatch) matches.push(stemMatch);

      const synonymMatch = this.trySynonymMatch(term, word);
      if (synonymMatch) matches.push(synonymMatch);

      const phoneticMatch = this.tryPhoneticMatch(term, word);
      if (phoneticMatch) matches.push(phoneticMatch);
    }

    // Sort by similarity (best first) and return top matches
    return matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3); // Keep top 3 matches per term
  }

  /**
   * Try to match based on edit distance (typos)
   */
  private tryTypoMatch(term: string, word: string): FuzzyMatch | null {
    const distance = this.levenshteinDistance(term, word);
    const maxDistance = Math.max(2, Math.floor(term.length * 0.3)); // Allow 30% character changes
    
    if (distance <= maxDistance && distance > 0) {
      const similarity = 1 - (distance / Math.max(term.length, word.length));
      
      if (similarity >= 0.6) {
        return {
          original: term,
          matched: word,
          distance,
          similarity,
          matchType: 'typo'
        };
      }
    }
    
    return null;
  }

  /**
   * Try to match based on word stems
   */
  private tryStemMatch(term: string, word: string): FuzzyMatch | null {
    const termStem = this.stem(term);
    const wordStem = this.stem(word);
    
    if (termStem === wordStem && termStem.length > 3) {
      return {
        original: term,
        matched: word,
        distance: 0,
        similarity: 0.9, // High similarity for stem matches
        matchType: 'stem'
      };
    }
    
    return null;
  }

  /**
   * Try to match based on synonyms
   */
  private trySynonymMatch(term: string, word: string): FuzzyMatch | null {
    const synonyms = this.synonymMap.get(term) || [];
    
    if (synonyms.includes(word)) {
      return {
        original: term,
        matched: word,
        distance: 0,
        similarity: 0.8, // Good similarity for synonyms
        matchType: 'synonym'
      };
    }
    
    // Check reverse mapping
    for (const [key, values] of this.synonymMap) {
      if (values.includes(term) && key === word) {
        return {
          original: term,
          matched: word,
          distance: 0,
          similarity: 0.8,
          matchType: 'synonym'
        };
      }
    }
    
    return null;
  }

  /**
   * Try to match based on phonetic similarity (Soundex-like)
   */
  private tryPhoneticMatch(term: string, word: string): FuzzyMatch | null {
    const termPhonetic = this.soundex(term);
    const wordPhonetic = this.soundex(word);
    
    if (termPhonetic === wordPhonetic && termPhonetic !== '0000' && term !== word) {
      return {
        original: term,
        matched: word,
        distance: 1,
        similarity: 0.7, // Moderate similarity for phonetic matches
        matchType: 'phonetic'
      };
    }
    
    return null;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
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
  private stem(word: string): string {
    if (this.stemCache.has(word)) {
      return this.stemCache.get(word)!;
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
    
    this.stemCache.set(word, stem);
    return stem;
  }

  /**
   * Simple Soundex algorithm for phonetic matching
   */
  private soundex(word: string): string {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length === 0) return '0000';
    
    let soundex = cleaned[0].toUpperCase();
    
    const mapping: Record<string, string> = {
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
    
    return soundex.padEnd(4, '0').substring(0, 4);
  }

  /**
   * Initialize domain-specific synonym mappings
   */
  private initializeSynonymMap(): void {
    const synonyms: Record<string, string[]> = {
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
    
    for (const [key, values] of Object.entries(synonyms)) {
      this.synonymMap.set(key, values);
    }
  }

  /**
   * Generate a snippet highlighting fuzzy matches
   */
  private generateSnippet(doc: FuzzyDocument, searchTerms: string[], maxLength = 300): string {
    const content = doc.content;
    
    if (!content || content.length === 0) {
      return doc.title;
    }
    
    if (content.length <= maxLength) {
      return content.trim();
    }
    
    // Try to find a good section containing search terms or similar words
    const words = content.split(/\s+/);
    let bestStart = 0;
    let maxRelevance = 0;
    
    const windowSize = Math.min(50, words.length);
    for (let i = 0; i <= words.length - windowSize; i++) {
      const window = words.slice(i, i + windowSize).join(' ').toLowerCase();
      
      let relevance = 0;
      for (const term of searchTerms) {
        // Direct matches
        if (window.includes(term.toLowerCase())) {
          relevance += 3;
        }
        
        // Fuzzy matches
        const windowWords = window.split(/\s+/);
        for (const word of windowWords) {
          const distance = this.levenshteinDistance(term.toLowerCase(), word);
          if (distance <= 2 && distance > 0) {
            relevance += 1;
          }
        }
      }
      
      if (relevance > maxRelevance) {
        maxRelevance = relevance;
        bestStart = i;
      }
    }
    
    // Extract snippet around best match
    const startIdx = Math.max(0, bestStart - 10);
    const endIdx = Math.min(words.length, bestStart + windowSize + 10);
    let snippet = words.slice(startIdx, endIdx).join(' ');
    
    if (snippet.length > maxLength) {
      snippet = snippet.substring(0, maxLength);
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        snippet = snippet.substring(0, lastSpace) + '...';
      }
    }
    
    return snippet.trim();
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  /**
   * Classify fuzzy search result quality
   */
  private classifyFuzzyQuality(
    matchResult: { score: number; matches: FuzzyMatch[]; totalDistance: number }, 
    searchTerms: string[]
  ): {
    tier: 'high' | 'medium' | 'low' | 'minimal';
    confidence: number;
    matchType: string;
    description: string;
  } {
    const score = matchResult.score;
    const matchRatio = matchResult.matches.length / searchTerms.length;
    const avgDistance = matchResult.totalDistance / Math.max(matchResult.matches.length, 1);
    
    if (score >= 0.95 && avgDistance === 0) {
      return {
        tier: 'high',
        confidence: score,
        matchType: 'exact-match',
        description: 'Perfect character match'
      };
    } else if (score >= 0.8 && avgDistance <= 1) {
      return {
        tier: 'high',
        confidence: score,
        matchType: 'minor-typo',
        description: 'Near-perfect match with minor typos'
      };
    } else if (score >= 0.6 && matchRatio >= 0.8) {
      return {
        tier: 'medium',
        confidence: score,
        matchType: 'major-typo',
        description: 'Good match with some typos'
      };
    } else if (score >= 0.4 && matchRatio >= 0.5) {
      return {
        tier: 'low',
        confidence: score,
        matchType: 'partial-match',
        description: 'Partial match, potentially useful'
      };
    } else {
      return {
        tier: 'minimal',
        confidence: score,
        matchType: 'weak-fuzzy-match',
        description: 'Very weak fuzzy connection'
      };
    }
  }

  /**
   * Calculate quality distribution for fuzzy results
   */
  private calculateFuzzyQualityDistribution(results: any[]): Record<string, number> {
    const distribution = { high: 0, medium: 0, low: 0, minimal: 0 };
    
    results.forEach(result => {
      const tier = result.qualityAssessment?.tier || 'minimal';
      if (tier in distribution) {
        distribution[tier as keyof typeof distribution]++;
      }
    });
    
    return distribution;
  }

  /**
   * Get search statistics
   */
  getStats(): {
    totalDocuments: number;
    cachedStems: number;
    synonymMappings: number;
    scoreBasedRanking?: boolean;
  } {
    return {
      totalDocuments: this.documents.size,
      cachedStems: this.stemCache.size,
      synonymMappings: this.synonymMap.size,
      scoreBasedRanking: true // ✅ Indicator of enhanced functionality
    };
  }
}