/**
 * PropertySearchService - Advanced frontmatter property search functionality
 * 
 * Provides specialized property search capabilities following SOLID principles
 * Applies Single Responsibility Principle for property-based file searches
 */

import { App, TFile, CachedMetadata } from 'obsidian';

/**
 * Options for property search operations
 */
export interface PropertySearchOptions {
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
 * Property search result with metadata
 */
export interface PropertySearchResult {
    file: TFile;
    key: string;
    value: any;
    metadata: CachedMetadata;
}

/**
 * Service for searching files by frontmatter properties
 * Provides advanced property-based search capabilities extracted from SearchOperations
 */
export class PropertySearchService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

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
        options: PropertySearchOptions = {}
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
        options: PropertySearchOptions = {}
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
        options: PropertySearchOptions = {}
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
        options: PropertySearchOptions = {}
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
    async getAllPropertyKeys(options: PropertySearchOptions = {}): Promise<string[]> {
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
        options: PropertySearchOptions = {}
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