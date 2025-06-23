/**
 * ScoringService - Advanced relevance scoring algorithms for search operations
 * 
 * Applies Single Responsibility Principle by focusing solely on scoring calculations
 * Provides reusable scoring algorithms for search services to use
 */

import { prepareFuzzySearch } from 'obsidian';
import { CachedMetadata } from 'obsidian';

/**
 * Weights for different search factors
 */
export interface SearchWeights {
    fuzzyMatch: number;
    exactMatch: number;
    lastViewed: number;
    accessCount: number;
    metadata: {
        title: number;
        tags: number;
        category: number;
        description: number;
    };
}

/**
 * Default search weights for consistent scoring
 */
export const DEFAULT_SEARCH_WEIGHTS: SearchWeights = {
    fuzzyMatch: 0.8,
    exactMatch: 1.2,
    lastViewed: 1.0,
    accessCount: 0.7,
    metadata: {
        title: 1.5,
        tags: 1.0,
        category: 2.0,
        description: 1.2
    }
};

/**
 * Score result with details about the match
 */
export interface ScoreResult {
    score: number;
    exactMatches: number;
    fuzzyMatches: number;
    metadataMatches: number;
}

/**
 * Service for calculating search relevance scores using multiple algorithms
 * Extracted from SearchOperations to provide reusable scoring functionality
 */
export class ScoringService {
    private weights: SearchWeights;

    constructor(weights: SearchWeights = DEFAULT_SEARCH_WEIGHTS) {
        this.weights = weights;
    }

    /**
     * Update scoring weights
     * @param weights New weights configuration
     */
    updateWeights(weights: SearchWeights): void {
        this.weights = weights;
    }

    /**
     * Calculate comprehensive relevance score for text content
     * @param text Text content to score
     * @param terms Search terms
     * @param options Additional scoring options
     * @returns Detailed score result
     */
    calculateRelevanceScore(
        text: string,
        terms: string[],
        options: {
            metadata?: CachedMetadata;
            lastViewedAt?: number;
            accessCount?: number;
        } = {}
    ): ScoreResult {
        const fuzzyResult = this.scoreFuzzyMatch(text, terms);
        const metadataResult = options.metadata 
            ? this.scoreMetadata(options.metadata, terms)
            : { score: 0, matches: 0 };
        
        let totalScore = fuzzyResult.score + metadataResult.score;
        
        // Apply recency boost if available
        if (options.lastViewedAt) {
            const recencyScore = this.calculateRecencyScore(options.lastViewedAt);
            totalScore += recencyScore * this.weights.lastViewed;
        }
        
        // Apply access count boost if available
        if (options.accessCount) {
            const accessScore = Math.log(options.accessCount + 1) * 0.1;
            totalScore += accessScore * this.weights.accessCount;
        }
        
        return {
            score: totalScore,
            exactMatches: fuzzyResult.exactMatches,
            fuzzyMatches: fuzzyResult.fuzzyMatches,
            metadataMatches: metadataResult.matches
        };
    }

    /**
     * Score text using fuzzy matching with exact match bonuses
     * Extracted from SearchOperations.scoreFuzzyMatch()
     * @param text Text to search in
     * @param terms Search terms
     * @returns Scoring result with match details
     */
    private scoreFuzzyMatch(text: string, terms: string[]): {
        score: number;
        exactMatches: number;
        fuzzyMatches: number;
    } {
        let totalScore = 0;
        let exactMatches = 0;
        let fuzzyMatches = 0;
        
        const lowerText = text.toLowerCase();
        
        for (const term of terms) {
            const lowerTerm = term.toLowerCase();
            
            // Check for exact matches first (higher weight)
            if (lowerText.includes(lowerTerm)) {
                totalScore += this.weights.exactMatch;
                exactMatches++;
            } else {
                // Use Obsidian's fuzzy search for partial matches
                const fuzzySearch = prepareFuzzySearch(term);
                if (fuzzySearch(text)) {
                    totalScore += this.weights.fuzzyMatch;
                    fuzzyMatches++;
                }
            }
        }
        
        return {
            score: totalScore,
            exactMatches,
            fuzzyMatches
        };
    }

    /**
     * Score metadata fields with weighted importance
     * Extracted from SearchOperations.scoreMetadata()
     * @param metadata File metadata to score
     * @param terms Search terms
     * @returns Scoring result with match count
     */
    private scoreMetadata(metadata: CachedMetadata, terms: string[]): {
        score: number;
        matches: number;
    } {
        let score = 0;
        let matches = 0;
        
        if (!metadata) {
            return { score: 0, matches: 0 };
        }
        
        // Score frontmatter fields
        if (metadata.frontmatter) {
            for (const [key, value] of Object.entries(metadata.frontmatter)) {
                const fieldScore = this.scoreMetadataField(key, value, terms);
                if (fieldScore > 0) {
                    matches++;
                    score += fieldScore;
                }
            }
        }
        
        // Score tags
        if (metadata.tags) {
            for (const tagEntry of metadata.tags) {
                const tag = tagEntry.tag.replace('#', '');
                const tagScore = this.scoreMetadataValue(tag, terms, this.weights.metadata.tags);
                if (tagScore > 0) {
                    matches++;
                    score += tagScore;
                }
            }
        }
        
        return { score, matches };
    }

    /**
     * Score individual metadata field based on key and value
     * @param key Field key
     * @param value Field value
     * @param terms Search terms
     * @returns Field score
     */
    private scoreMetadataField(key: string, value: any, terms: string[]): number {
        if (!value) return 0;
        
        const stringValue = String(value).toLowerCase();
        const lowerKey = key.toLowerCase();
        
        // Determine field weight based on key
        let weight = 1.0;
        if (lowerKey.includes('title') || lowerKey.includes('name')) {
            weight = this.weights.metadata.title;
        } else if (lowerKey.includes('tag')) {
            weight = this.weights.metadata.tags;
        } else if (lowerKey.includes('category') || lowerKey.includes('type')) {
            weight = this.weights.metadata.category;
        } else if (lowerKey.includes('description') || lowerKey.includes('summary')) {
            weight = this.weights.metadata.description;
        }
        
        return this.scoreMetadataValue(stringValue, terms, weight);
    }

    /**
     * Score metadata value against search terms with given weight
     * @param value Metadata value to score
     * @param terms Search terms
     * @param weight Weight multiplier
     * @returns Weighted score
     */
    private scoreMetadataValue(value: string, terms: string[], weight: number): number {
        const lowerValue = value.toLowerCase();
        
        for (const term of terms) {
            const lowerTerm = term.toLowerCase();
            if (lowerValue.includes(lowerTerm)) {
                return weight;
            }
        }
        
        return 0;
    }

    /**
     * Calculate time-based recency score with decay
     * Extracted from SearchOperations.calculateRecencyScore()
     * @param lastViewedAt Timestamp of last access
     * @returns Recency score (higher for more recent)
     */
    calculateRecencyScore(lastViewedAt: number): number {
        const now = Date.now();
        const daysSinceViewed = (now - lastViewedAt) / (1000 * 60 * 60 * 24);
        
        // Exponential decay: score decreases over time
        // Recent files (< 1 day) get full score
        // Score halves every 7 days
        const halfLife = 7; // days
        return Math.exp(-daysSinceViewed * Math.log(2) / halfLife);
    }

    /**
     * Prepare search terms by filtering and normalizing
     * Extracted from SearchOperations.prepareSearchTerms()
     * @param query Raw search query
     * @returns Processed search terms
     */
    static prepareSearchTerms(query: string): string[] {
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
        
        return query
            .toLowerCase()
            .split(/\s+/)
            .map(term => term.trim())
            .filter(term => term.length > 0 && !stopWords.has(term));
    }

    /**
     * Get current weights configuration
     * @returns Current search weights
     */
    getWeights(): SearchWeights {
        return { ...this.weights };
    }
}