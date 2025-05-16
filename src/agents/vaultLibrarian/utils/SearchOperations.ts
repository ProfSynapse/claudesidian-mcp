import { TFile, TFolder, prepareFuzzySearch, App, getAllTags } from 'obsidian';
import { GraphOperations } from './graph/GraphOperations';

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
 * Default search weights
 */
export const SEARCH_WEIGHTS: SearchWeights = {
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
 * Search result with scoring and match information
 */
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
    content?: string;
}

/**
 * Utility class for advanced search operations
 * Leverages Obsidian's API for improved search capabilities
 */
export class SearchOperations {
    private static graphOperations = new GraphOperations();
    /**
     * List files and folders in a folder (static version)
     * @param app Obsidian app instance
     * @param path Path to the folder
     * @param includeFiles Whether to include files (default: true)
     * @param includeFolders Whether to include folders (default: true)
     * @param includeHidden Whether to include hidden files (default: false)
     * @returns Object with files and folders
     */
    static listFolder(
        app: App,
        path: string,
        includeFiles: boolean = true,
        includeFolders: boolean = true,
        includeHidden: boolean = false
    ): { files: string[]; folders: string[] } {
        // Normalize the path before passing to instance method
        const normalizedPath = path === '.' ? '/' : path;
        return new SearchOperations(app).listFolder(normalizedPath, includeFiles, includeFolders, includeHidden);
    }

    /**
     * List notes in the vault (static version)
     * @param app Obsidian app instance
     * @param path Path to search in (optional)
     * @param extension Filter by extension (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Promise that resolves with note paths
     */
    static async listNotes(
        app: App,
        path?: string,
        extension?: string,
        limit?: number
    ): Promise<string[]> {
        return new SearchOperations(app).listNotes(path, extension, limit);
    }

    /**
     * List tags in the vault (static version)
     * @param app Obsidian app instance
     * @param prefix Filter by prefix (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Array of tags
     */
    static listTags(
        app: App,
        prefix?: string,
        limit?: number
    ): string[] {
        return new SearchOperations(app).listTags(prefix, limit);
    }

    /**
     * List properties in the vault (static version)
     * @param app Obsidian app instance
     * @param key Filter by key (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Map of property keys to values
     */
    static async listProperties(
        app: App,
        key?: string,
        limit?: number
    ): Promise<Record<string, string[]>> {
        return new SearchOperations(app).listProperties(key, limit);
    }

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

    private app: App;
    private weights: SearchWeights;

    /**
     * Create a new SearchOperations instance
     * @param app Obsidian app instance
     * @param weights Custom search weights (optional)
     */
    constructor(app: App, weights?: Partial<SearchWeights>) {
        this.app = app;
        this.weights = { ...SearchOperations.DEFAULT_WEIGHTS, ...weights };
    }

    /**
     * Search for content in files with advanced scoring
     * @param query Query to search for
     * @param options Search options
     * @returns Promise that resolves with search results
     */
    async search(query: string, options: {
        path?: string;
        limit?: number;
        includeFolders?: boolean;
        includeMetadata?: boolean;
        searchFields?: string[];
        weights?: Partial<SearchWeights>;
        includeContent?: boolean;
        useGraphBoost?: boolean;
        graphBoostFactor?: number;
        graphMaxDistance?: number;
        seedNotes?: string[];
    } = {}): Promise<SearchResult[]> {
        const {
            path,
            limit = 10,
            includeFolders = false,
            includeMetadata = true,
            searchFields = ['title', 'content', 'tags'],
            weights,
            includeContent = false,
            useGraphBoost = false,
            graphBoostFactor = 0.3,
            graphMaxDistance = 1,
            seedNotes = []
        } = options;

        // Apply custom weights if provided, otherwise use defaults
        const searchWeights = weights ? 
            { ...this.weights, ...weights } : 
            this.weights;

        // Break query into searchable terms
        const searchTerms = this.prepareSearchTerms(query);
        
        // Get files to search
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !path || file.path.startsWith(path));

        const results: SearchResult[] = [];

        for (const file of files) {
            let metadata: Record<string, any> | undefined;
            let content: string | undefined;
            
            if (includeMetadata || searchFields.includes('content')) {
                const cache = this.app.metadataCache.getFileCache(file);
                
                if (includeMetadata && cache?.frontmatter) {
                    // Filter out internal Obsidian properties
                    const { position, ...frontmatter } = cache.frontmatter;
                    metadata = frontmatter;

                    // Add tags from both frontmatter and content
                    const allTags = getAllTags(cache);
                    if (allTags) {
                        metadata.tags = allTags.map(tag => 
                            tag.startsWith('#') ? tag.slice(1) : tag
                        );
                    }
                }
                
                if (searchFields.includes('content')) {
                    content = await this.app.vault.read(file);
                    if (includeContent) {
                        // Store content in result if requested
                    } else {
                        // Don't store content in result to save memory
                        content = undefined;
                    }
                }
            }

            const matches = [];
            let totalScore = 0;

            // Fuzzy path matching with custom weights
            if (searchFields.includes('title')) {
                const pathScore = this.scoreFuzzyMatch(file.path, searchTerms, searchWeights);
                if (pathScore.score > 0) {
                    totalScore += pathScore.score * searchWeights.fuzzyMatch;
                    matches.push(...pathScore.matches.map(m => ({
                        type: 'fuzzy',
                        ...m,
                        location: 'path'
                    })));
                }
            }

            // Content matching if available
            if (searchFields.includes('content') && content) {
                const contentScore = this.scoreFuzzyMatch(content, searchTerms, searchWeights);
                if (contentScore.score > 0) {
                    totalScore += contentScore.score * searchWeights.fuzzyMatch;
                    matches.push(...contentScore.matches.map(m => ({
                        type: 'fuzzy',
                        ...m,
                        location: 'content'
                    })));
                }
            }

            // Metadata matching if available
            if (metadata) {
                const metadataScore = this.scoreMetadata(metadata, searchTerms, searchWeights);
                totalScore += metadataScore.score;
                matches.push(...metadataScore.matches);

                // Access tracking boost
                if (metadata.lastViewedAt) {
                    const recencyScore = this.calculateRecencyScore(metadata.lastViewedAt);
                    totalScore += recencyScore * searchWeights.lastViewed;
                    matches.push({
                        type: 'recency',
                        term: 'lastViewedAt',
                        score: recencyScore * searchWeights.lastViewed,
                        location: 'metadata'
                    });
                }
                if (metadata.accessCount) {
                    const accessScore = Math.log(metadata.accessCount + 1) * searchWeights.accessCount;
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
                    metadata: metadata || undefined,
                    content: includeContent ? content : undefined
                });
            }
        }

        // Sort by score and limit results
        let sortedResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
            
        // Apply graph boost if enabled
        if (useGraphBoost) {
            sortedResults = SearchOperations.applyGraphBoost(sortedResults, {
                useGraphBoost,
                boostFactor: graphBoostFactor,
                maxDistance: graphMaxDistance,
                seedNotes
            });
            
            // Re-sort after boosting
            sortedResults.sort((a, b) => b.score - a.score);
        }
        
        return sortedResults;
    }

    /**
     * Prepare search terms from a query
     * @param query Query to prepare
     * @returns Array of search terms
     */
    private prepareSearchTerms(query: string): string[] {
        const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to']);
        return query.toLowerCase()
            .split(/\s+/)
            .filter(word => !stopWords.has(word) && word.length > 1);
    }

    /**
     * Score fuzzy matches in text
     * @param text Text to search in
     * @param terms Terms to search for
     * @param weights Search weights
     * @returns Score and matches
     */
    private scoreFuzzyMatch(text: string, terms: string[], weights: SearchWeights): {
        score: number;
        matches: Array<{ term: string; score: number }>;
    } {
        const matches = [];
        let totalScore = 0;

        for (const term of terms) {
            // Use Obsidian's prepareFuzzySearch for better matching
            const fuzzyMatch = prepareFuzzySearch(term)(text.toLowerCase());
            if (fuzzyMatch && fuzzyMatch.score > 0) {
                totalScore += fuzzyMatch.score;
                matches.push({ term, score: fuzzyMatch.score });
            }

            // Boost score for exact matches
            if (text.toLowerCase().includes(term)) {
                const exactScore = weights.exactMatch;
                totalScore += exactScore;
                matches.push({ term, score: exactScore });
            }
        }

        return { score: totalScore, matches };
    }

    /**
     * Score metadata matches
     * @param metadata Metadata to search in
     * @param terms Terms to search for
     * @param weights Search weights
     * @returns Score and matches
     */
    private scoreMetadata(metadata: Record<string, any>, terms: string[], weights: SearchWeights): {
        score: number;
        matches: Array<{ type: string; term: string; score: number; location: string }>;
    } {
        let totalScore = 0;
        const matches = [];

        // Score each metadata field
        for (const [field, weight] of Object.entries(weights.metadata)) {
            if (metadata[field]) {
                const fieldValue = Array.isArray(metadata[field])
                    ? metadata[field].join(' ')
                    : String(metadata[field]);

                const { score, matches: fieldMatches } = this.scoreFuzzyMatch(fieldValue, terms, weights);
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

    /**
     * Calculate recency score based on last viewed time
     * @param lastViewedAt Last viewed timestamp
     * @returns Recency score
     */
    private calculateRecencyScore(lastViewedAt: string): number {
        const lastViewed = new Date(lastViewedAt).getTime();
        const now = Date.now();
        const hoursSinceViewed = (now - lastViewed) / (1000 * 60 * 60);
        
        // Decay factor - score decreases over time
        return Math.exp(-hoursSinceViewed / 168); // 168 hours = 1 week
    }

    /**
     * Get a snippet from content based on match
     * @param content Content to get snippet from
     * @param term Term that matched
     * @param contextSize Number of characters to include before and after the match
     * @returns Snippet with context
     */
    getSnippet(content: string, term: string, contextSize: number = 40): string {
        const lowerContent = content.toLowerCase();
        const lowerTerm = term.toLowerCase();
        const position = lowerContent.indexOf(lowerTerm);
        
        if (position === -1) {
            return '';
        }
        
        // Find line containing the match
        const lines = content.split('\n');
        let currentPos = 0;
        let matchLine = '';
        let lineNumber = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (currentPos <= position && position < currentPos + line.length) {
                matchLine = line;
                lineNumber = i;
                break;
            }
            currentPos += line.length + 1; // +1 for the newline character
        }
        
        // Create snippet with context
        const start = Math.max(0, position - contextSize);
        const end = Math.min(content.length, position + term.length + contextSize);
        const snippet = (start > 0 ? '...' : '') + 
                        content.substring(start, end) + 
                        (end < content.length ? '...' : '');
        
        return snippet;
    }

    /**
     * Search for files with a specific tag
     * @param tag Tag to search for
     * @param options Search options
     * @returns Promise that resolves with files containing the tag
     */
    async searchByTag(tag: string, options: {
        path?: string;
        limit?: number;
    } = {}): Promise<TFile[]> {
        const { path, limit } = options;
        
        // Ensure tag starts with #
        const searchTag = tag.startsWith('#') ? tag : '#' + tag;
        
        // Get files to search
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !path || file.path.startsWith(path));
        
        const results: TFile[] = [];
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;
            
            const tags = getAllTags(cache);
            if (!tags) continue;
            
            // Check both with and without '#' prefix
            if (tags.includes(searchTag) || tags.includes(tag)) {
                results.push(file);
                
                // Limit results if specified
                if (limit && results.length >= limit) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * Search for files with a specific property
     * @param key Property key
     * @param value Property value (optional)
     * @param options Search options
     * @returns Promise that resolves with files containing the property
     */
    async searchByProperty(key: string, value?: string, options: {
        path?: string;
        limit?: number;
    } = {}): Promise<TFile[]> {
        const { path, limit } = options;
        
        // Get files to search
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !path || file.path.startsWith(path));
        
        const results: TFile[] = [];
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            // Check if frontmatter contains the property
            if (cache.frontmatter[key] !== undefined) {
                const propertyValue = cache.frontmatter[key];
                
                // If value is specified, check if it matches
                if (!value || String(propertyValue) === value) {
                    results.push(file);
                    
                    // Limit results if specified
                    if (limit && results.length >= limit) {
                        break;
                    }
                }
            }
        }
        
        return results;
    }

    /**
     * List files and folders in a folder
     * @param app Obsidian app instance
     * @param path Path to the folder
     * @param includeFiles Whether to include files (default: true)
     * @param includeFolders Whether to include folders (default: true)
     * @param includeHidden Whether to include hidden files (default: false)
     * @returns Object with files and folders
     */
    listFolder(
        path: string,
        includeFiles: boolean = true,
        includeFolders: boolean = true,
        includeHidden: boolean = false
    ): { files: string[]; folders: string[] } {
        const files: string[] = [];
        const folders: string[] = [];
        
        // Normalize the path - handle special cases for root
        const normalizedPath = path === '.' ? '/' : path;
        
        // Get the folder
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (!folder || !(folder instanceof TFolder)) {
            return { files, folders };
        }
        
        // List files and folders
        for (const child of folder.children) {
            // Skip hidden files
            if (!includeHidden && child.name.startsWith('.')) {
                continue;
            }
            
            if (child instanceof TFile && includeFiles) {
                files.push(child.path);
            } else if (child instanceof TFolder && includeFolders) {
                folders.push(child.path);
            }
        }
        
        return { files, folders };
    }

    /**
     * List notes in the vault
     * @param path Path to search in (optional)
     * @param extension Filter by extension (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Promise that resolves with note paths
     */
    async listNotes(
        path?: string,
        extension?: string,
        limit?: number
    ): Promise<string[]> {
        const results: string[] = [];
        
        // Get files to search
        const files = await this.getFilesToSearch(path ? [path] : undefined);
        
        // Filter files
        for (const file of files) {
            // Skip if we've reached the limit
            if (limit && results.length >= limit) {
                break;
            }
            
            // Check extension
            if (extension && !file.path.endsWith(extension)) {
                continue;
            }
            
            results.push(file.path);
        }
        
        return results;
    }

    /**
     * List tags in the vault
     * @param prefix Filter by prefix (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Array of tags
     */
    listTags(
        prefix?: string,
        limit?: number
    ): string[] {
        // Get all tags from the metadata cache
        const allTags = new Set<string>();
        
        // Use Obsidian's metadata cache to efficiently collect tags
        // Iterate through files but use the cache to avoid reading file content
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache) {
                // Use Obsidian's getAllTags utility function
                const tags = getAllTags(cache) || [];
                for (const tag of tags) {
                    // Remove # prefix if present
                    const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
                    
                    // Filter by prefix if provided
                    if (!prefix || cleanTag.startsWith(prefix)) {
                        allTags.add(cleanTag);
                    }
                }
            }
        }
        
        // Convert to array
        let tags = Array.from(allTags);
        
        // Sort tags alphabetically
        tags.sort();
        
        // Limit results if specified
        if (limit) {
            tags = tags.slice(0, limit);
        }
        
        return tags;
    }

    /**
     * List properties in the vault
     * @param key Filter by key (optional)
     * @param limit Maximum number of results to return (optional)
     * @returns Map of property keys to values
     */
    async listProperties(
        key?: string,
        limit?: number
    ): Promise<Record<string, string[]>> {
        const properties: Record<string, string[]> = {};
        
        // Get all files more efficiently using the metadata cache
        const files = this.app.vault.getMarkdownFiles();
        
        // Process each file
        for (const file of files) {
            // Skip if we've reached the limit
            if (limit && Object.keys(properties).length >= limit) {
                break;
            }
            
            // Get file metadata from cache
            const metadata = this.app.metadataCache.getFileCache(file);
            if (!metadata?.frontmatter) continue;
            
            // Process each property in frontmatter
            for (const [propKey, propValue] of Object.entries(metadata.frontmatter)) {
                // Skip position property (internal Obsidian property)
                if (propKey === 'position') continue;
                
                // Skip if key is specified and doesn't match
                if (key && propKey !== key) {
                    continue;
                }
                
                // Initialize property array if needed
                if (!properties[propKey]) {
                    properties[propKey] = [];
                }
                
                // Add value based on its type
                if (typeof propValue === 'string') {
                    // Add string value directly
                    properties[propKey].push(propValue);
                } else if (Array.isArray(propValue)) {
                    // Add array values individually
                    for (const item of propValue) {
                        if (typeof item === 'string') {
                            properties[propKey].push(item);
                        }
                    }
                } else if (propValue !== null && typeof propValue !== 'undefined') {
                    // Convert other types to string
                    properties[propKey].push(String(propValue));
                }
            }
        }
        
        // Sort values for each property
        for (const key in properties) {
            properties[key].sort();
        }
        
        return properties;
    }

    /**
     * Get files to search
     * @param paths Paths to search in (optional)
     * @returns Promise that resolves with files to search
     */
    private async getFilesToSearch(
        paths?: string[]
    ): Promise<TFile[]> {
        if (!paths || paths.length === 0) {
            // If no paths specified, search all markdown files
            return this.app.vault.getMarkdownFiles();
        }
        
        const files: TFile[] = [];
        
        // Process each path
        for (const path of paths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            
            if (!file) {
                continue;
            }
            
            if (file instanceof TFile) {
                files.push(file);
            } else if (file instanceof TFolder) {
                // Add all files in the folder
                this.addFilesInFolder(file, files);
            }
        }
        
        return files;
    }

    /**
     * Add files in a folder to an array
     * @param folder Folder to process
     * @param files Array to add files to
     */
    private addFilesInFolder(folder: TFolder, files: TFile[]): void {
        for (const child of folder.children) {
            if (child instanceof TFile) {
                files.push(child);
            } else if (child instanceof TFolder) {
                this.addFilesInFolder(child, files);
            }
        }
    }

    /**
     * Apply graph boosting to search results
     * @param results Search results to boost
     * @param options Graph boosting options
     * @returns Boosted search results
     */
    static applyGraphBoost(
        results: SearchResult[],
        options: {
            useGraphBoost: boolean;
            boostFactor?: number;
            maxDistance?: number;
            seedNotes?: string[];
        }
    ): SearchResult[] {
        if (!options.useGraphBoost || results.length === 0) {
            return results;
        }

        // Convert search results to format expected by GraphOperations
        const recordsWithSimilarity = results.map(result => ({
            record: {
                id: result.file.path,
                filePath: result.file.path,
                content: result.content || '',
                metadata: {
                    ...result.metadata,
                    links: {
                        outgoing: [],
                        incoming: []
                    }
                }
            },
            similarity: result.score
        }));

        // If we have actual link data, extract it
        for (const record of recordsWithSimilarity) {
            // Extract links from metadata if available
            if (record.record.metadata && record.record.metadata.links) {
                continue; // Already has links
            }

            // Extract links from matches
            const links = {
                outgoing: [] as Array<{displayText: string; targetPath: string}>,
                incoming: [] as Array<{sourcePath: string; displayText: string}>
            };

            // Look for links in matches
            for (const match of results.find(r => r.file.path === record.record.filePath)?.matches || []) {
                if (match.type === 'link' && match.location) {
                    links.outgoing.push({
                        displayText: match.term,
                        targetPath: match.location
                    });
                }
            }

            // Find incoming links (any result that links to this file)
            for (const otherResult of results) {
                if (otherResult.file.path === record.record.filePath) continue;
                
                for (const match of otherResult.matches || []) {
                    if (match.type === 'link' && match.location === record.record.filePath) {
                        links.incoming.push({
                            sourcePath: otherResult.file.path,
                            displayText: match.term
                        });
                    }
                }
            }

            record.record.metadata.links = links;
        }

        // Apply graph boosting
        const boostedRecords = SearchOperations.graphOperations.applyGraphBoost(
            recordsWithSimilarity,
            {
                useGraphBoost: true,
                boostFactor: options.boostFactor,
                maxDistance: options.maxDistance,
                seedNotes: options.seedNotes
            }
        );

        // Convert back to SearchResult format
        return results.map(result => {
            const boostedRecord = boostedRecords.find(r => r.record.filePath === result.file.path);
            if (boostedRecord) {
                return {
                    ...result,
                    score: boostedRecord.similarity
                };
            }
            return result;
        });
    }
}