import { TFile, Vault, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { VaultManager } from './VaultManager';
import { injectable } from 'inversify';

export interface SearchOptions {
    /** Maximum results to return */
    limit?: number;
    /** Whether to search in file content */
    searchContent?: boolean;
    /** File extensions to include */
    extensions?: string[];
    /** Match threshold (0-100) */
    threshold?: number;
}

export interface SearchResult {
    file: TFile;
    score: number;
    matches: FuzzyMatch<TFile>[];
}

const DEFAULT_OPTIONS: SearchOptions = {
    limit: 10,
    searchContent: true,
    extensions: ['md'],
    threshold: 60
};

@injectable()
export class SearchEngine {
    private cache: Map<string, Array<FuzzyMatch<TFile>>>;
    private lastIndexTime: number;

    constructor(
        private vault: Vault,
        private vaultManager: VaultManager,
        private cacheTimeout: number = 300000 // 5 minutes
    ) {
        this.cache = new Map();
        this.lastIndexTime = 0;
    }

    /**
     * Search through vault files and content
     */
    async search(query: string, options: SearchOptions = {}): Promise<Array<FuzzyMatch<TFile>>> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        
        // Check cache first
        const cacheKey = this.getCacheKey(query, opts);
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const files = this.vault.getFiles()
                .filter(file => (opts.extensions || []).includes(file.extension));

            const fuzzySearch = prepareFuzzySearch(query);
            const results: Array<FuzzyMatch<TFile>> = [];

            for (const file of files) {
                // Search filename
                const fileMatch = fuzzySearch(file.basename);
                if (fileMatch) {
                    results.push({
                        item: file,
                        match: fileMatch
                    });
                }

                // Optionally search content
                if (opts.searchContent && fileMatch) {
                    const content = await this.vaultManager.readNote(file.path);
                    const contentMatch = fuzzySearch(content);
                    if (contentMatch && contentMatch.score > (fileMatch?.score || 0)) {
                        results[results.length - 1].match = contentMatch;
                    }
                }
            }

            // Sort by score descending
            results.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0));

            // Limit results
            const limitedResults = results.slice(0, opts.limit);

            // Cache results
            this.cache.set(cacheKey, limitedResults);

            return limitedResults;

        } catch (error) {
            console.error('SearchEngine search error:', error);
            return [];
        }
    }

    /**
     * Clear the search cache
     */
    clearCache(): void {
        this.cache.clear();
        this.lastIndexTime = 0;
    }

    /**
     * Get cache key for query and options
     */
    private getCacheKey(query: string, options: SearchOptions): string {
        return `${query}:${JSON.stringify(options)}`;
    }

    /**
     * Get results from cache if still valid
     */
    private getFromCache(key: string): Array<FuzzyMatch<TFile>> | null {
        if (!this.cache.has(key)) return null;

        const now = Date.now();
        if (now - this.lastIndexTime > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }

        return this.cache.get(key) || null;
    }
}