/**
 * KeywordSearchService - BM25-based keyword search with multi-field weighting
 * Implements industry-standard term frequency/inverse document frequency scoring
 */

import { TFile } from 'obsidian';
import { SnippetGenerator, SnippetOptions } from './utils/SnippetGenerator';

export interface KeywordSearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  searchMethod: 'keyword';
  metadata: {
    filePath: string;
    fileId: string;
    timestamp: number;
    fieldMatches: FieldMatch[];
    exactMatches: number;
    phraseMatches: number;
    // ✅ ENHANCED QUALITY METADATA FOR SCORE-BASED RANKING
    originalBM25Score?: number;
    normalizedScore?: number;
    maxBM25InSet?: number;
    minBM25InSet?: number;
    qualityTier?: 'high' | 'medium' | 'low' | 'minimal';
    confidenceLevel?: number;
    matchType?: string;
    qualityDescription?: string;
    scoreMethod?: string;
  };
  content?: string;
}

export interface FieldMatch {
  field: 'title' | 'headers' | 'content' | 'tags';
  matches: number;
  weight: number;
  score: number;
}

export interface SearchableDocument {
  id: string;
  title: string;
  headers: string[];
  content: string;
  tags: string[];
  filePath: string;
  metadata: Record<string, any>;
}

export interface BM25Parameters {
  k1: number; // Controls term frequency saturation (typically 1.2-2.0)
  b: number;  // Controls length normalization (typically 0.75)
}

export class KeywordSearchService {
  private documents: Map<string, SearchableDocument> = new Map();
  private termFrequency: Map<string, Map<string, number>> = new Map(); // term -> docId -> frequency
  private documentFrequency: Map<string, number> = new Map(); // term -> number of docs containing it
  private documentLengths: Map<string, number> = new Map(); // docId -> document length
  private averageDocumentLength = 0;
  private totalDocuments = 0;

  // BM25 parameters
  private readonly bm25Params: BM25Parameters = {
    k1: 1.5,  // Slightly higher than standard for knowledge base content
    b: 0.75   // Standard length normalization
  };

  // Field weights for multi-field search
  private readonly fieldWeights = {
    title: 3.0,     // Title matches are very important
    headers: 2.0,   // Section headers are important
    content: 1.0,   // Base content weight
    tags: 0.5       // Tags less important to prevent spam
  };

  // Configurable snippet context length
  private snippetContextLength = 75;

  /**
   * Index a document for keyword search
   */
  indexDocument(doc: SearchableDocument): void {
    this.documents.set(doc.id, doc);
    
    // Remove old document from indexes if it exists
    this.removeDocumentFromIndexes(doc.id);
    
    // Tokenize and index all fields
    const allText = this.getAllDocumentText(doc);
    const tokens = this.tokenize(allText);
    
    // Calculate document length (for BM25 normalization)
    const docLength = tokens.length;
    this.documentLengths.set(doc.id, docLength);
    
    // Index each unique term
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      // Update term frequency
      if (!this.termFrequency.has(term)) {
        this.termFrequency.set(term, new Map());
      }
      
      const termCount = tokens.filter(t => t === term).length;
      this.termFrequency.get(term)!.set(doc.id, termCount);
      
      // Update document frequency
      this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
    }
    
    this.totalDocuments = this.documents.size;
    this.updateAverageDocumentLength();
  }

  /**
   * Remove a document from the search index
   */
  removeDocument(docId: string): void {
    const doc = this.documents.get(docId);
    if (!doc) return;
    
    this.removeDocumentFromIndexes(docId);
    this.documents.delete(docId);
    this.documentLengths.delete(docId);
    
    this.totalDocuments = this.documents.size;
    this.updateAverageDocumentLength();
  }

  /**
   * Search for documents using BM25 scoring
   */
  search(
    query: string, 
    limit = 10,
    exactPhrases: string[] = [],
    filteredFiles?: TFile[]
  ): KeywordSearchResult[] {
    if (!query.trim()) return [];
    
    const queryTerms = this.tokenize(query.toLowerCase());
    const phraseTerms = exactPhrases.flatMap(phrase => this.tokenize(phrase.toLowerCase()));
    
    // Calculate BM25 scores for all documents
    const scores = new Map<string, number>();
    const fieldMatches = new Map<string, FieldMatch[]>();
    
    for (const [docId, doc] of this.documents) {
      // Apply file filtering if provided
      if (filteredFiles) {
        const allowedPaths = filteredFiles.map(f => f.path);
        if (!allowedPaths.includes(doc.filePath)) {
          continue;
        }
      }
      
      const docScore = this.calculateBM25Score(docId, queryTerms, phraseTerms);
      const matches = this.calculateFieldMatches(doc, queryTerms, phraseTerms);
      
      if (docScore > 0) {
        scores.set(docId, docScore);
        fieldMatches.set(docId, matches);
      }
    }
    
    // Sort by score and return top results
    const sortedResults = Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit);
    
    return sortedResults.map(([docId, score]) => {
      const doc = this.documents.get(docId)!;
      const matches = fieldMatches.get(docId) || [];
      
      const exactMatches = this.countExactMatches(doc, queryTerms);
      const phraseMatches = exactPhrases.reduce((count, phrase) => 
        count + this.countPhraseMatches(doc, phrase), 0);
      
      return {
        id: docId,
        title: doc.title,
        snippet: SnippetGenerator.generateDocumentSnippet(doc, queryTerms, phraseTerms, { contextLength: this.snippetContextLength }),
        score,
        searchMethod: 'keyword' as const,
        metadata: {
          filePath: doc.filePath,
          fileId: docId,
          timestamp: Date.now(),
          fieldMatches: matches,
          exactMatches,
          phraseMatches
        }
      };
    });
  }

  /**
   * Calculate BM25 score for a document given query terms
   */
  private calculateBM25Score(docId: string, queryTerms: string[], phraseTerms: string[]): number {
    const doc = this.documents.get(docId)!;
    const docLength = this.documentLengths.get(docId) || 0;
    
    let totalScore = 0;
    
    // Score for regular query terms
    for (const term of new Set(queryTerms)) {
      totalScore += this.calculateTermScore(docId, term, docLength);
    }
    
    // Boost score for phrase terms (exact phrases get higher weight)
    for (const term of new Set(phraseTerms)) {
      totalScore += this.calculateTermScore(docId, term, docLength) * 1.5;
    }
    
    // Apply field-specific boosts
    const fieldBoosts = this.calculateFieldBoosts(doc, queryTerms);
    totalScore *= fieldBoosts;
    
    return totalScore;
  }

  /**
   * Calculate BM25 score for a single term in a document
   */
  private calculateTermScore(docId: string, term: string, docLength: number): number {
    const termFreq = this.termFrequency.get(term)?.get(docId) || 0;
    if (termFreq === 0) return 0;
    
    const docFreq = this.documentFrequency.get(term) || 0;
    if (docFreq === 0) return 0;
    
    // BM25 components
    const idf = Math.log((this.totalDocuments - docFreq + 0.5) / (docFreq + 0.5));
    const tf = (termFreq * (this.bm25Params.k1 + 1)) / 
               (termFreq + this.bm25Params.k1 * (1 - this.bm25Params.b + 
                this.bm25Params.b * (docLength / this.averageDocumentLength)));
    
    return Math.max(0, idf * tf);
  }

  /**
   * Calculate field-specific boosts based on where terms appear
   */
  private calculateFieldBoosts(doc: SearchableDocument, queryTerms: string[]): number {
    let totalBoost = 1.0;
    
    for (const term of queryTerms) {
      // Check each field for term presence
      if (doc.title.toLowerCase().includes(term)) {
        totalBoost += this.fieldWeights.title * 0.1;
      }
      
      if (doc.headers.some(h => h.toLowerCase().includes(term))) {
        totalBoost += this.fieldWeights.headers * 0.1;
      }
      
      if (doc.tags.some(t => t.toLowerCase().includes(term))) {
        totalBoost += this.fieldWeights.tags * 0.1;
      }
    }
    
    return totalBoost;
  }

  /**
   * Calculate detailed field matches for result metadata
   */
  private calculateFieldMatches(
    doc: SearchableDocument, 
    queryTerms: string[], 
    phraseTerms: string[]
  ): FieldMatch[] {
    const allTerms = [...queryTerms, ...phraseTerms];
    const matches: FieldMatch[] = [];
    
    // Title matches
    const titleMatches = allTerms.reduce((count, term) => 
      count + (doc.title.toLowerCase().includes(term) ? 1 : 0), 0);
    if (titleMatches > 0) {
      matches.push({
        field: 'title',
        matches: titleMatches,
        weight: this.fieldWeights.title,
        score: titleMatches * this.fieldWeights.title
      });
    }
    
    // Header matches
    const headerMatches = allTerms.reduce((count, term) => 
      count + doc.headers.reduce((hCount, header) => 
        hCount + (header.toLowerCase().includes(term) ? 1 : 0), 0), 0);
    if (headerMatches > 0) {
      matches.push({
        field: 'headers',
        matches: headerMatches,
        weight: this.fieldWeights.headers,
        score: headerMatches * this.fieldWeights.headers
      });
    }
    
    // Content matches
    const contentMatches = allTerms.reduce((count, term) => 
      count + (doc.content.toLowerCase().split(term).length - 1), 0);
    if (contentMatches > 0) {
      matches.push({
        field: 'content',
        matches: contentMatches,
        weight: this.fieldWeights.content,
        score: contentMatches * this.fieldWeights.content
      });
    }
    
    // Tag matches
    const tagMatches = allTerms.reduce((count, term) => 
      count + doc.tags.reduce((tCount, tag) => 
        tCount + (tag.toLowerCase().includes(term) ? 1 : 0), 0), 0);
    if (tagMatches > 0) {
      matches.push({
        field: 'tags',
        matches: tagMatches,
        weight: this.fieldWeights.tags,
        score: tagMatches * this.fieldWeights.tags
      });
    }
    
    return matches;
  }

  /**
   * Count exact word matches in a document
   */
  private countExactMatches(doc: SearchableDocument, queryTerms: string[]): number {
    const allText = this.getAllDocumentText(doc).toLowerCase();
    return queryTerms.reduce((count, term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = allText.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  /**
   * Count phrase matches in a document
   */
  private countPhraseMatches(doc: SearchableDocument, phrase: string): number {
    const allText = this.getAllDocumentText(doc).toLowerCase();
    const normalizedPhrase = phrase.toLowerCase();
    return (allText.split(normalizedPhrase).length - 1);
  }

  /**
   * Set the context length for snippet generation
   */
  setSnippetContextLength(contextLength: number): void {
    this.snippetContextLength = contextLength;
  }

  /**
   * Tokenize text into searchable terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(token => token.length > 1 && !/^\d+$/.test(token)); // Filter short and numeric tokens
  }

  /**
   * Get all searchable text from a document
   */
  private getAllDocumentText(doc: SearchableDocument): string {
    return [
      doc.title,
      ...doc.headers,
      doc.content,
      ...doc.tags
    ].join(' ');
  }

  /**
   * Remove document from all indexes
   */
  private removeDocumentFromIndexes(docId: string): void {
    // Remove from term frequency maps
    for (const [term, docMap] of this.termFrequency) {
      if (docMap.has(docId)) {
        docMap.delete(docId);
        
        // Update document frequency
        const currentDocFreq = this.documentFrequency.get(term) || 0;
        if (currentDocFreq > 1) {
          this.documentFrequency.set(term, currentDocFreq - 1);
        } else {
          this.documentFrequency.delete(term);
          this.termFrequency.delete(term);
        }
      }
    }
  }

  /**
   * Update average document length for BM25 normalization
   */
  private updateAverageDocumentLength(): void {
    if (this.totalDocuments === 0) {
      this.averageDocumentLength = 0;
      return;
    }
    
    const totalLength = Array.from(this.documentLengths.values())
      .reduce((sum, length) => sum + length, 0);
    this.averageDocumentLength = totalLength / this.totalDocuments;
  }

  /**
   * Get search statistics
   */
  getStats(): {
    totalDocuments: number;
    totalTerms: number;
    averageDocumentLength: number;
  } {
    return {
      totalDocuments: this.totalDocuments,
      totalTerms: this.termFrequency.size,
      averageDocumentLength: this.averageDocumentLength
    };
  }
}