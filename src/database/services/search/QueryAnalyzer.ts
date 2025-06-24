/**
 * QueryAnalyzer - Analyzes search queries to determine optimal search strategy
 * Classifies queries and extracts keywords, concepts, and fuzzy terms
 */

export interface QueryAnalysis {
  queryType: 'exact' | 'conceptual' | 'exploratory' | 'mixed';
  keywords: string[];
  concepts: string[];
  fuzzyTerms: string[];
  weights: SearchWeights;
  exactPhrases: string[];
  technicalTerms: string[];
  hasQuotes: boolean;
  hasQuestionWords: boolean;
}

export interface SearchWeights {
  semantic: number;    // 0.0 - 1.0
  keyword: number;     // 0.0 - 1.0  
  fuzzy: number;       // 0.0 - 1.0
}

export interface IntentSignals {
  queryLength: number;
  hasQuotes: boolean;
  hasQuestionWords: boolean;
  technicalTerms: string[];
  queryComplexity: 'simple' | 'medium' | 'complex';
}

export class QueryAnalyzer {
  private technicalTerms: Set<string>;
  private questionWords: Set<string>;
  private stopWords: Set<string>;

  constructor() {
    // Domain-specific technical terms for weighting
    this.technicalTerms = new Set([
      'clustering', 'algorithm', 'neural', 'machine', 'learning', 'data',
      'analysis', 'model', 'training', 'classification', 'regression',
      'embedding', 'vector', 'similarity', 'database', 'index',
      'kabbalah', 'mystical', 'folklore', 'tradition', 'spiritual',
      'recipe', 'cooking', 'ingredient', 'preparation', 'cuisine'
    ]);

    this.questionWords = new Set([
      'what', 'how', 'why', 'when', 'where', 'who', 'which', 'explain', 'describe'
    ]);

    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being'
    ]);
  }

  /**
   * Main analysis method - determines search strategy for a query
   */
  analyzeQuery(query: string): QueryAnalysis {
    const normalizedQuery = query.toLowerCase().trim();
    const intentSignals = this.extractIntentSignals(query);
    
    // Extract different types of terms
    const exactPhrases = this.extractExactPhrases(query);
    const keywords = this.extractKeywords(normalizedQuery);
    const concepts = this.extractConcepts(normalizedQuery);
    const fuzzyTerms = this.extractFuzzyTerms(normalizedQuery);
    const technicalTerms = this.identifyTechnicalTerms(normalizedQuery);

    // Classify query type based on signals
    const queryType = this.classifyQueryType(intentSignals, keywords, concepts);
    
    // Calculate optimal weights based on query type and signals
    const weights = this.calculateSearchWeights(queryType, intentSignals);

    return {
      queryType,
      keywords,
      concepts,
      fuzzyTerms,
      weights,
      exactPhrases,
      technicalTerms,
      hasQuotes: intentSignals.hasQuotes,
      hasQuestionWords: intentSignals.hasQuestionWords
    };
  }

  /**
   * Extract intent signals from query structure
   */
  private extractIntentSignals(query: string): IntentSignals {
    const hasQuotes = /["'].*?["']/.test(query);
    const hasQuestionWords = this.questionWords.has(query.toLowerCase().split(' ')[0]);
    const technicalTerms = this.identifyTechnicalTerms(query.toLowerCase());
    const queryLength = query.split(/\s+/).length;
    
    let queryComplexity: 'simple' | 'medium' | 'complex';
    if (queryLength <= 2) queryComplexity = 'simple';
    else if (queryLength <= 5) queryComplexity = 'medium';
    else queryComplexity = 'complex';

    return {
      queryLength,
      hasQuotes,
      hasQuestionWords,
      technicalTerms,
      queryComplexity
    };
  }

  /**
   * Extract exact phrases from quoted text
   */
  private extractExactPhrases(query: string): string[] {
    const phraseMatches = query.match(/["'](.*?)["']/g);
    return phraseMatches ? phraseMatches.map(match => 
      match.replace(/["']/g, '').toLowerCase()
    ) : [];
  }

  /**
   * Extract keywords for exact matching
   */
  private extractKeywords(normalizedQuery: string): string[] {
    const words = normalizedQuery
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
    
    // Prioritize technical terms and meaningful words
    return words.filter(word => 
      this.technicalTerms.has(word) || 
      word.length > 3 ||
      /^[A-Z]/.test(word) // Capitalized terms often important
    );
  }

  /**
   * Extract concepts for semantic search
   */
  private extractConcepts(normalizedQuery: string): string[] {
    // For concepts, we want broader terms and phrases
    const words = normalizedQuery.split(/\s+/);
    const concepts: string[] = [];
    
    // Add individual meaningful words
    words.forEach(word => {
      if (word.length > 3 && !this.stopWords.has(word)) {
        concepts.push(word);
      }
    });

    // Add meaningful bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!this.stopWords.has(words[i]) && !this.stopWords.has(words[i + 1])) {
        concepts.push(bigram);
      }
    }

    return concepts;
  }

  /**
   * Extract terms for fuzzy matching (typos, variations)
   */
  private extractFuzzyTerms(normalizedQuery: string): string[] {
    // For fuzzy search, focus on longer, potentially misspelled terms
    return normalizedQuery
      .split(/\s+/)
      .filter(word => word.length > 4 && !this.stopWords.has(word));
  }

  /**
   * Identify domain-specific technical terms
   */
  private identifyTechnicalTerms(normalizedQuery: string): string[] {
    const words = normalizedQuery.split(/\s+/);
    return words.filter(word => this.technicalTerms.has(word));
  }

  /**
   * Classify the overall query type
   */
  private classifyQueryType(
    signals: IntentSignals, 
    keywords: string[], 
    concepts: string[]
  ): 'exact' | 'conceptual' | 'exploratory' | 'mixed' {
    
    // Exact: Short, specific, technical terms, quotes
    if (signals.hasQuotes || 
        (signals.queryComplexity === 'simple' && signals.technicalTerms.length > 0)) {
      return 'exact';
    }
    
    // Exploratory: Question words, complex queries, broad concepts
    if (signals.hasQuestionWords || 
        signals.queryComplexity === 'complex' ||
        concepts.length > keywords.length * 1.5) {
      return 'exploratory';
    }
    
    // Conceptual: Medium complexity, mix of technical and conceptual terms
    if (signals.technicalTerms.length > 0 && concepts.length > 2) {
      return 'conceptual';
    }
    
    // Mixed: Default for balanced queries
    return 'mixed';
  }

  /**
   * Calculate optimal search weights based on query analysis
   */
  private calculateSearchWeights(
    queryType: 'exact' | 'conceptual' | 'exploratory' | 'mixed',
    signals: IntentSignals
  ): SearchWeights {
    
    let weights: SearchWeights;
    
    switch (queryType) {
      case 'exact':
        weights = { keyword: 0.7, semantic: 0.2, fuzzy: 0.1 };
        break;
      case 'conceptual':
        weights = { semantic: 0.6, keyword: 0.3, fuzzy: 0.1 };
        break;
      case 'exploratory':
        weights = { semantic: 0.8, fuzzy: 0.15, keyword: 0.05 };
        break;
      case 'mixed':
      default:
        weights = { semantic: 0.4, keyword: 0.4, fuzzy: 0.2 };
        break;
    }

    // Adjust weights based on specific signals
    if (signals.hasQuotes) {
      weights.keyword += 0.2;
      weights.semantic -= 0.1;
      weights.fuzzy -= 0.1;
    }

    if (signals.technicalTerms.length > 1) {
      weights.keyword += 0.1;
      weights.semantic += 0.1;
      weights.fuzzy -= 0.2;
    }

    // Normalize weights to sum to 1.0
    const total = weights.keyword + weights.semantic + weights.fuzzy;
    weights.keyword /= total;
    weights.semantic /= total;
    weights.fuzzy /= total;

    return weights;
  }

  /**
   * Get query-specific boosting factors for different content types
   */
  getContentTypeBoosts(analysis: QueryAnalysis): Record<string, number> {
    const baseBoosts = {
      mainContent: 1.0,
      headers: 1.2,
      codeBlocks: 0.9,
      tags: 0.6,
      metadata: 0.4
    };

    // For exact queries, boost headers more (section headers are important)
    if (analysis.queryType === 'exact') {
      baseBoosts.headers = 1.5;
      baseBoosts.tags = 0.4; // Reduce tag importance for exact queries
    }

    // For exploratory queries, tags become more valuable
    if (analysis.queryType === 'exploratory') {
      baseBoosts.tags = 0.8;
      baseBoosts.metadata = 0.6;
    }

    return baseBoosts;
  }
}