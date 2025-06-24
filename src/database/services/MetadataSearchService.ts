/**
 * MetadataSearchService - Advanced metadata search functionality for tags and properties
 * 
 * Provides specialized tag and property search capabilities following SOLID principles
 * Applies Single Responsibility Principle for metadata-based file searches
 * Uses official Obsidian API for tag access via getAllTags()
 */

import { App, TFile, CachedMetadata, getAllTags } from 'obsidian';

/**
 * Filter criteria for property searches
 */
export interface PropertyFilter {
    key: string;
    value?: any;
    caseSensitive?: boolean;
    partialMatch?: boolean;
}

/**
 * Options for metadata search operations
 */
export interface MetadataSearchOptions {
    /** Path prefix to limit search scope */
    path?: string;
    /** Maximum number of results to return */
    limit?: number;
    /** Case-sensitive matching for values */
    caseSensitive?: boolean;
    /** Support partial value matching */
    partialMatch?: boolean;
}

/**
 * Combined search criteria for tags and properties
 */
export interface MetadataSearchCriteria {
    /** Tags to filter by */
    tags?: string[];
    /** Property filters to apply */
    properties?: PropertyFilter[];
    /** Use AND logic (true) or OR logic (false) for combining criteria */
    matchAll?: boolean;
}

/**
 * Property search result with metadata
 */
export interface PropertySearchResult {
    file: TFile;
    key: string;
    value: any;
    metadata: CachedMetadata;
}

/**
 * Service for searching files by tags and frontmatter properties
 * Provides advanced metadata-based search capabilities using official Obsidian API
 */
export class MetadataSearchService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    // ===== TAG SEARCH METHODS =====

    /**
     * Get all tags in the vault using official Obsidian API
     * @param options Search configuration options
     * @returns Promise resolving to array of unique tags
     */
    async getAllTags(options: MetadataSearchOptions = {}): Promise<string[]> {
        const { path, limit } = options;
        const files = this.getFilesToSearch(path);
        const tags = new Set<string>();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const fileTags = getAllTags(cache);
            if (fileTags) {
                fileTags.forEach(tag => {
                    // Remove # prefix for consistency
                    tags.add(tag.replace(/^#/, ''));
                });
            }

            if (limit && tags.size >= limit) break;
        }

        return Array.from(tags).sort();
    }

    /**
     * Get files that contain a specific tag
     * @param tag Tag to search for (with or without # prefix)
     * @param options Search configuration options
     * @returns Promise resolving to matching files
     */
    async getFilesWithTag(tag: string, options: MetadataSearchOptions = {}): Promise<TFile[]> {
        const { path, limit } = options;
        const normalizedTag = tag.replace(/^#/, '');
        const files = this.getFilesToSearch(path);
        const results: TFile[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const fileTags = getAllTags(cache);
            if (fileTags && fileTags.some(t => t.replace(/^#/, '') === normalizedTag)) {
                results.push(file);
                if (limit && results.length >= limit) break;
            }
        }

        return results;
    }

    /**
     * Get files that contain any of the specified tags
     * @param tags Array of tags to search for
     * @param options Search configuration options
     * @returns Promise resolving to matching files
     */
    async getFilesWithTags(tags: string[], options: MetadataSearchOptions = {}): Promise<TFile[]> {
        const { path, limit } = options;
        const normalizedTags = tags.map(tag => tag.replace(/^#/, ''));
        const files = this.getFilesToSearch(path);
        const results: TFile[] = [];
        const resultSet = new Set<string>();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const fileTags = getAllTags(cache);
            if (fileTags) {
                const normalizedFileTags = fileTags.map(t => t.replace(/^#/, ''));
                const hasAnyTag = normalizedTags.some(tag => normalizedFileTags.includes(tag));
                
                if (hasAnyTag && !resultSet.has(file.path)) {
                    results.push(file);
                    resultSet.add(file.path);
                    if (limit && results.length >= limit) break;
                }
            }
        }

        return results;
    }

    // ===== PROPERTY SEARCH METHODS =====

    /**
     * Search files by property key/value pairs
     * Enhanced version of SearchOperations.searchByProperty()
     * @param key Property key to search for
     * @param value Optional property value to match
     * @param options Search configuration options
     * @returns Promise resolving to matching files
     */
    async searchByProperty(
        key: string,
        value?: string,
        options: MetadataSearchOptions = {}
    ): Promise<TFile[]> {
        const results = await this.searchByPropertyDetailed(key, value, options);
        return results.map(result => result.file);
    }

    /**
     * Search files by property with detailed results including metadata
     * @param key Property key to search for
     * @param value Optional property value to match
     * @param options Search configuration options
     * @returns Promise resolving to detailed search results
     */
    async searchByPropertyDetailed(
        key: string,
        value?: string,
        options: MetadataSearchOptions = {}
    ): Promise<PropertySearchResult[]> {
        const { path, limit, caseSensitive = false, partialMatch = false } = options;
        
        // Get files to search with optional path filtering
        const files = this.getFilesToSearch(path);
        const results: PropertySearchResult[] = [];
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            // Check if frontmatter contains the property
            if (cache.frontmatter[key] !== undefined) {
                const propertyValue = cache.frontmatter[key];
                
                // If no value specified, just check for property existence
                if (!value) {
                    results.push({
                        file,
                        key,
                        value: propertyValue,
                        metadata: cache
                    });
                } else {
                    // Check if value matches based on options
                    if (this.matchesValue(propertyValue, value, caseSensitive, partialMatch)) {
                        results.push({
                            file,
                            key,
                            value: propertyValue,
                            metadata: cache
                        });
                    }
                }
                
                // Apply limit if specified
                if (limit && results.length >= limit) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * Search for files containing any of multiple properties
     * @param keys Array of property keys to search for
     * @param options Search configuration options
     * @returns Promise resolving to files containing any of the properties
     */
    async searchByAnyProperty(
        keys: string[],
        options: MetadataSearchOptions = {}
    ): Promise<TFile[]> {
        const { path, limit } = options;
        
        const files = this.getFilesToSearch(path);
        const results: TFile[] = [];
        const resultSet = new Set<string>(); // Avoid duplicates
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            // Check if frontmatter contains any of the specified properties
            const hasAnyProperty = keys.some(key => cache.frontmatter![key] !== undefined);
            
            if (hasAnyProperty && !resultSet.has(file.path)) {
                results.push(file);
                resultSet.add(file.path);
                
                // Apply limit if specified
                if (limit && results.length >= limit) {
                    break;
                }
            }
        }
        
        return results;
    }

    /**
     * Search for files where property value matches a pattern
     * @param key Property key to search
     * @param pattern Regular expression pattern to match against value
     * @param options Search configuration options
     * @returns Promise resolving to matching files
     */
    async searchByPropertyPattern(
        key: string,
        pattern: RegExp,
        options: MetadataSearchOptions = {}
    ): Promise<PropertySearchResult[]> {
        const { path, limit } = options;
        
        const files = this.getFilesToSearch(path);
        const results: PropertySearchResult[] = [];
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            const propertyValue = cache.frontmatter[key];
            if (propertyValue !== undefined) {
                const stringValue = String(propertyValue);
                if (pattern.test(stringValue)) {
                    results.push({
                        file,
                        key,
                        value: propertyValue,
                        metadata: cache
                    });
                    
                    // Apply limit if specified
                    if (limit && results.length >= limit) {
                        break;
                    }
                }
            }
        }
        
        return results;
    }

    /**
     * Get all unique property keys used across files
     * Enhanced version of SearchOperations property listing functionality
     * @param options Search configuration options
     * @returns Promise resolving to array of unique property keys
     */
    async getAllPropertyKeys(options: MetadataSearchOptions = {}): Promise<string[]> {
        const { path, limit } = options;
        
        const files = this.getFilesToSearch(path);
        const keys = new Set<string>();
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            // Add all frontmatter keys
            Object.keys(cache.frontmatter).forEach(key => keys.add(key));
            
            // Apply limit if specified
            if (limit && keys.size >= limit) {
                break;
            }
        }
        
        return Array.from(keys).sort();
    }

    /**
     * Get all unique values for a specific property key
     * @param key Property key to get values for
     * @param options Search configuration options
     * @returns Promise resolving to array of unique values
     */
    async getPropertyValues(
        key: string,
        options: MetadataSearchOptions = {}
    ): Promise<any[]> {
        const { path, limit } = options;
        
        const files = this.getFilesToSearch(path);
        const values = new Set<string>();
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;
            
            const propertyValue = cache.frontmatter[key];
            if (propertyValue !== undefined) {
                // Handle arrays and objects by stringifying them
                const stringValue = typeof propertyValue === 'object' 
                    ? JSON.stringify(propertyValue) 
                    : String(propertyValue);
                values.add(stringValue);
                
                // Apply limit if specified
                if (limit && values.size >= limit) {
                    break;
                }
            }
        }
        
        return Array.from(values).sort();
    }

    // ===== COMBINED SEARCH METHODS =====

    /**
     * Search files matching combined tag and property criteria
     * @param criteria Combined search criteria with tags and properties
     * @param options Search configuration options
     * @returns Promise resolving to files matching the criteria
     */
    async getFilesMatchingMetadata(
        criteria: MetadataSearchCriteria,
        options: MetadataSearchOptions = {}
    ): Promise<TFile[]> {
        const { tags = [], properties = [], matchAll = true } = criteria;
        const { path, limit } = options;

        if (tags.length === 0 && properties.length === 0) {
            return []; // No criteria specified
        }

        const files = this.getFilesToSearch(path);
        const results: TFile[] = [];
        const resultSet = new Set<string>();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            let meetsTagCriteria = tags.length === 0; // If no tags specified, consider as met
            let meetsPropertyCriteria = properties.length === 0; // If no properties specified, consider as met

            // Check tag criteria
            if (tags.length > 0) {
                const fileTags = getAllTags(cache);
                if (fileTags) {
                    const normalizedFileTags = fileTags.map(t => t.replace(/^#/, ''));
                    if (matchAll) {
                        meetsTagCriteria = tags.every(tag => 
                            normalizedFileTags.includes(tag.replace(/^#/, ''))
                        );
                    } else {
                        meetsTagCriteria = tags.some(tag => 
                            normalizedFileTags.includes(tag.replace(/^#/, ''))
                        );
                    }
                }
            }

            // Check property criteria
            if (properties.length > 0) {
                const frontmatter = cache.frontmatter;
                if (frontmatter) {
                    if (matchAll) {
                        meetsPropertyCriteria = properties.every(prop => 
                            this.matchesPropertyFilter(frontmatter, prop)
                        );
                    } else {
                        meetsPropertyCriteria = properties.some(prop => 
                            this.matchesPropertyFilter(frontmatter, prop)
                        );
                    }
                }
            }

            // Combine criteria based on matchAll setting
            const meetsCriteria = matchAll 
                ? (meetsTagCriteria && meetsPropertyCriteria)
                : (meetsTagCriteria || meetsPropertyCriteria);

            if (meetsCriteria && !resultSet.has(file.path)) {
                results.push(file);
                resultSet.add(file.path);
                if (limit && results.length >= limit) break;
            }
        }

        return results;
    }

    /**
     * Check if frontmatter matches a property filter
     * @param frontmatter The frontmatter object to check
     * @param filter The property filter to apply
     * @returns True if the frontmatter matches the filter
     */
    private matchesPropertyFilter(frontmatter: any, filter: PropertyFilter): boolean {
        const { key, value, caseSensitive = false, partialMatch = false } = filter;
        
        if (frontmatter[key] === undefined) {
            return false; // Property doesn't exist
        }

        if (value === undefined) {
            return true; // Just checking for property existence
        }

        return this.matchesValue(frontmatter[key], value, caseSensitive, partialMatch);
    }

    /**
     * Check if a property value matches the search criteria
     * @param propertyValue The actual property value
     * @param searchValue The value to search for
     * @param caseSensitive Whether to perform case-sensitive matching
     * @param partialMatch Whether to allow partial matches
     * @returns True if the value matches
     */
    private matchesValue(
        propertyValue: any,
        searchValue: string,
        caseSensitive: boolean,
        partialMatch: boolean
    ): boolean {
        const propStr = String(propertyValue);
        const searchStr = searchValue;
        
        if (caseSensitive) {
            return partialMatch 
                ? propStr.includes(searchStr)
                : propStr === searchStr;
        } else {
            return partialMatch
                ? propStr.toLowerCase().includes(searchStr.toLowerCase())
                : propStr.toLowerCase() === searchStr.toLowerCase();
        }
    }

    /**
     * Get files to search based on optional path filtering
     * @param path Optional path prefix to filter by
     * @returns Array of files to search
     */
    private getFilesToSearch(path?: string): TFile[] {
        return this.app.vault.getMarkdownFiles()
            .filter(file => !path || file.path.startsWith(path));
    }
}