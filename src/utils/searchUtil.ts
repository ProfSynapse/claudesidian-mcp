import { TFile, prepareFuzzySearch, App } from 'obsidian';
import { VaultManager } from '../services/VaultManager';

interface SearchWeights {
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

export const MEMORY_SEARCH_WEIGHTS: SearchWeights = {
    fuzzyMatch: 0.8,
    exactMatch: 1.2,
    lastViewed: 1.0,
    accessCount: 0.7,
    metadata: {
        title: 1.5,
        tags: 1.0,
        category: 2.0,  // Higher weight for memory category
        description: 1.2
    }
};

export interface SearchResult {
    file: TFile;
    score: number;
    matches: {
        type: string;
        term: string;
        score: number;
        location: string;
    }[];
    metadata?: Record<string, any>;
}

export class SearchUtil {
    private static DEFAULT_WEIGHTS: SearchWeights = {
        fuzzyMatch: 1.0,
        exactMatch: 1.5,
        lastViewed: 0.8,
        accessCount: 0.5,
        metadata: {
            title: 2.0,
            tags: 1.2,
            category: 1.0,
            description: 0.7,
        }
    };

    private vault: VaultManager;
    private app: App;
    private weights: SearchWeights;

    constructor(vault: VaultManager, weights?: Partial<SearchWeights>) {
        this.vault = vault;
        this.weights = { ...SearchUtil.DEFAULT_WEIGHTS, ...weights };
        // Get app instance from vault manager's getApp() method
        this.app = vault.getApp();
    }

    async search(query: string, options: {
        path?: string;
        limit?: number;
        includeFolders?: boolean;
        includeMetadata?: boolean;
        searchFields?: string[];
    } = {}): Promise<SearchResult[]> {
        const {
            path,
            limit = 10,
            includeFolders = false,
            includeMetadata = true,
            searchFields = ['title', 'content', 'tags']
        } = options;

        // Break query into searchable terms
        const searchTerms = this.prepareSearchTerms(query);
        
        // Get files to search
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !path || file.path.startsWith(path));

        const results: SearchResult[] = [];

        for (const file of files) {
            const metadata = includeMetadata ? 
                await this.vault.getNoteMetadata(file.path) : undefined;

            const matches = [];
            let totalScore = 0;

            // Fuzzy path matching
            const pathScore = this.scoreFuzzyMatch(file.path, searchTerms);
            if (pathScore.score > 0) {
                totalScore += pathScore.score * this.weights.fuzzyMatch;
                matches.push(...pathScore.matches.map(m => ({
                    type: 'fuzzy',
                    ...m,
                    location: 'path'
                })));
            }

            // Metadata matching if available
            if (metadata) {
                const metadataScore = this.scoreMetadata(metadata, searchTerms);
                totalScore += metadataScore.score;
                matches.push(...metadataScore.matches);

                // Access tracking boost
                if (metadata.lastViewedAt) {
                    const recencyScore = this.calculateRecencyScore(metadata.lastViewedAt);
                    totalScore += recencyScore * this.weights.lastViewed;
                }
                if (metadata.accessCount) {
                    const accessScore = Math.log(metadata.accessCount + 1) * this.weights.accessCount;
                    totalScore += accessScore;
                    matches.push({
                        type: 'access',
                        term: 'accessCount',
                        score: accessScore,
                        location: 'metadata'
                    });
                }
            }

            if (totalScore > 0) {
                results.push({
                    file,
                    score: totalScore,
                    matches,
                    metadata: metadata || undefined
                });
            }
        }

        // Sort by score and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    private prepareSearchTerms(query: string): string[] {
        const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to']);
        return query.toLowerCase()
            .split(/\s+/)
            .filter(word => !stopWords.has(word) && word.length > 1);
    }

    private scoreFuzzyMatch(text: string, terms: string[]): {
        score: number;
        matches: Array<{ term: string; score: number }>;
    } {
        const matches = [];
        let totalScore = 0;

        for (const term of terms) {
            const fuzzyMatch = prepareFuzzySearch(term)(text.toLowerCase());
            if (fuzzyMatch && fuzzyMatch.score > 0) {
                totalScore += fuzzyMatch.score;
                matches.push({ term, score: fuzzyMatch.score });
            }

            // Boost score for exact matches
            if (text.toLowerCase().includes(term)) {
                const exactScore = this.weights.exactMatch;
                totalScore += exactScore;
                matches.push({ term, score: exactScore });
            }
        }

        return { score: totalScore, matches };
    }

    private scoreMetadata(metadata: Record<string, any>, terms: string[]): {
        score: number;
        matches: Array<{ type: string; term: string; score: number; location: string }>;
    } {
        let totalScore = 0;
        const matches = [];

        // Score each metadata field
        for (const [field, weight] of Object.entries(this.weights.metadata)) {
            if (metadata[field]) {
                const fieldValue = Array.isArray(metadata[field])
                    ? metadata[field].join(' ')
                    : String(metadata[field]);

                const { score, matches: fieldMatches } = this.scoreFuzzyMatch(fieldValue, terms);
                const weightedScore = score * weight;
                totalScore += weightedScore;

                matches.push(...fieldMatches.map(m => ({
                    type: 'metadata',
                    term: m.term,
                    score: m.score * weight,
                    location: field
                })));
            }
        }

        return { score: totalScore, matches };
    }

    private calculateRecencyScore(lastViewedAt: string): number {
        const lastViewed = new Date(lastViewedAt).getTime();
        const now = Date.now();
        const hoursSinceViewed = (now - lastViewed) / (1000 * 60 * 60);
        
        // Decay factor - score decreases over time
        return Math.exp(-hoursSinceViewed / 168); // 168 hours = 1 week
    }
}
