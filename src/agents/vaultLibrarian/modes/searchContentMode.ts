import { Plugin, TFile, prepareFuzzySearch } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { BRAND_NAME } from '../../../constants/branding';
import { isGlobPattern, globToRegex } from '../../../utils/pathUtils';

export interface ContentSearchParams {
  query: string;
  limit?: number;
  includeContent?: boolean;
  snippetLength?: number;
  paths?: string[];
  context: {
    sessionId: string;
    workspaceId?: string;
    sessionDescription: string;
    sessionMemory: string;
    toolContext: string;
    primaryGoal: string;
    subgoal: string;
  };
  sessionId?: string;
}

export interface ContentSearchResult {
  success: boolean;
  query: string;
  results: Array<{
    filePath: string;
    title: string;
    content: string;
    score: number;
    searchMethod: 'fuzzy' | 'keyword' | 'combined';
    frontmatter?: Record<string, any>;
    metadata?: {
      fileExtension: string;
      parentFolder: string;
      modifiedTime: number;
    };
  }>;
  totalResults: number;
  executionTime: number;
  error?: string;
}

/**
 * Content search mode using native Obsidian fuzzy search and keyword search APIs
 * Combines fuzzy matching for file names with keyword search in content
 */
export class SearchContentMode extends BaseMode<ContentSearchParams, ContentSearchResult> {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    super(
      'searchContent',
      'Content Search',
      'Search vault files using native Obsidian fuzzy search for file names combined with keyword search in content. Results include file frontmatter (tags, properties, metadata) and are ranked by relevance.',
      '1.0.0'
    );
    this.plugin = plugin;
  }

  async execute(params: ContentSearchParams): Promise<ContentSearchResult> {
    const startTime = performance.now();

    try {
      if (!params.query || params.query.trim().length === 0) {
        return this.prepareResult(false, undefined, 'Query parameter is required and cannot be empty');
      }

      const searchParams = {
        query: params.query.trim(),
        limit: params.limit || 10,
        includeContent: params.includeContent !== false,
        snippetLength: params.snippetLength || 200,
        paths: params.paths || [],
        context: params.context
      };

      console.log(`[${BRAND_NAME}] Starting content search:`, { query: searchParams.query, limit: searchParams.limit });

      // Get all markdown files
      let allFiles = this.plugin.app.vault.getMarkdownFiles();

      // Filter by paths if specified
      if (searchParams.paths.length > 0) {
        const globPatterns = searchParams.paths
          .filter(p => isGlobPattern(p))
          .map(p => globToRegex(p));
        
        const literalPaths = searchParams.paths
          .filter(p => !isGlobPattern(p));

        allFiles = allFiles.filter(file => {
          const matchesLiteral = literalPaths.some(path => file.path.startsWith(path));
          const matchesGlob = globPatterns.some(regex => regex.test(file.path));
          return matchesLiteral || matchesGlob;
        });
      }

      // Perform combined fuzzy + keyword search
      const searchResults = await this.performCombinedSearch(
        searchParams.query,
        allFiles,
        searchParams.limit,
        searchParams.includeContent,
        searchParams.snippetLength
      );

      const executionTime = performance.now() - startTime;

      console.log(`[${BRAND_NAME}] Content search completed:`, {
        resultsCount: searchResults.length,
        executionTime: Math.round(executionTime)
      });

      return this.prepareResult(true, {
        results: searchResults,
        total: searchResults.length,
        hasMore: searchResults.length >= searchParams.limit
      });

    } catch (error) {
      console.error(`[${BRAND_NAME}] Content search failed:`, error);
      return this.prepareResult(false, undefined, `Search failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Perform combined fuzzy and keyword search with result ranking
   */
  private async performCombinedSearch(
    query: string,
    files: TFile[],
    limit: number,
    includeContent: boolean,
    snippetLength: number
  ): Promise<ContentSearchResult['results']> {
    const normalizedQuery = query.toLowerCase();
    const fuzzySearch = prepareFuzzySearch(normalizedQuery);
    const allResults: ContentSearchResult['results'] = [];

    for (const file of files) {
      const results = await this.searchInFile(
        file,
        query,
        normalizedQuery,
        fuzzySearch,
        includeContent,
        snippetLength
      );
      allResults.push(...results);
    }

    // Sort by score (higher is better) and take top results
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, limit);
  }

  /**
   * Search within a single file using multiple methods
   */
  private async searchInFile(
    file: TFile,
    originalQuery: string,
    normalizedQuery: string,
    fuzzySearch: (text: string) => { score: number } | null,
    includeContent: boolean,
    snippetLength: number
  ): Promise<ContentSearchResult['results']> {
    const results: ContentSearchResult['results'] = [];
    let maxScore = 0;
    let bestMethod: 'fuzzy' | 'keyword' | 'combined' = 'fuzzy';
    let contentSnippet = '';

    // 1. Fuzzy search on filename
    const filename = file.basename;
    const fuzzyResult = fuzzySearch(filename);
    let fuzzyScore = 0;

    if (fuzzyResult) {
      // Normalize fuzzy score (fuzzy scores are negative, closer to 0 is better)
      fuzzyScore = Math.max(0, Math.min(1, 1 + (fuzzyResult.score / 100)));
      maxScore = Math.max(maxScore, fuzzyScore);
      bestMethod = 'fuzzy';
    }

    // 2. Keyword search in file content and extract frontmatter
    let keywordScore = 0;
    let frontmatter: Record<string, any> | undefined = undefined;

    if (includeContent) {
      try {
        const fileContent = await this.plugin.app.vault.read(file);

        // Extract frontmatter using Obsidian's metadata cache
        const fileCache = this.plugin.app.metadataCache.getFileCache(file);
        if (fileCache?.frontmatter) {
          frontmatter = { ...fileCache.frontmatter };
          // Remove the position property as it's internal metadata
          delete frontmatter.position;
        }

        const keywordResult = this.performKeywordSearch(originalQuery, normalizedQuery, fileContent, snippetLength);

        if (keywordResult.found) {
          keywordScore = keywordResult.score;
          contentSnippet = keywordResult.snippet;

          if (keywordScore > maxScore) {
            maxScore = keywordScore;
            bestMethod = 'keyword';
          }
        }
      } catch (error) {
        console.warn(`[${BRAND_NAME}] Failed to read file content:`, file.path, error);
      }
    } else {
      // Even if not including content, still extract frontmatter
      try {
        const fileCache = this.plugin.app.metadataCache.getFileCache(file);
        if (fileCache?.frontmatter) {
          frontmatter = { ...fileCache.frontmatter };
          delete frontmatter.position;
        }
      } catch (error) {
        console.warn(`[${BRAND_NAME}] Failed to extract frontmatter:`, file.path, error);
      }
    }

    // 3. Combined scoring for files that match both fuzzy and keyword
    if (fuzzyScore > 0 && keywordScore > 0) {
      // Weighted combination: 60% keyword + 40% fuzzy
      maxScore = (keywordScore * 0.6) + (fuzzyScore * 0.4);
      bestMethod = 'combined';
    }

    // Only include files with matches
    if (maxScore > 0) {
      // If no content snippet from keyword search, use file path
      if (!contentSnippet && includeContent) {
        contentSnippet = `File: ${file.path}`;
      }

      results.push({
        filePath: file.path,
        title: filename,
        content: contentSnippet,
        score: maxScore,
        searchMethod: bestMethod,
        frontmatter,
        metadata: {
          fileExtension: file.extension,
          parentFolder: file.parent?.path || '',
          modifiedTime: file.stat.mtime
        }
      });
    }

    return results;
  }

  /**
   * Perform keyword search in file content
   */
  private performKeywordSearch(
    originalQuery: string,
    normalizedQuery: string,
    content: string,
    snippetLength: number
  ): { found: boolean; score: number; snippet: string } {
    const normalizedContent = content.toLowerCase();

    // Look for exact phrase match first (highest score)
    const exactIndex = normalizedContent.indexOf(normalizedQuery);
    if (exactIndex !== -1) {
      return {
        found: true,
        score: 0.9,
        snippet: this.extractSnippet(content, exactIndex, originalQuery.length, snippetLength)
      };
    }

    // Look for individual word matches
    const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
    const wordMatches = queryWords.filter(word => normalizedContent.includes(word));

    if (wordMatches.length === 0) {
      return { found: false, score: 0, snippet: '' };
    }

    // Score based on word match ratio
    const matchRatio = wordMatches.length / queryWords.length;
    const score = Math.max(0.3, matchRatio * 0.8);

    // Find snippet around first word match
    const firstMatch = wordMatches[0];
    const firstMatchIndex = normalizedContent.indexOf(firstMatch);

    return {
      found: true,
      score,
      snippet: this.extractSnippet(content, firstMatchIndex, firstMatch.length, snippetLength)
    };
  }

  /**
   * Extract content snippet around a match
   */
  private extractSnippet(content: string, matchIndex: number, matchLength: number, snippetLength: number): string {
    const halfSnippet = Math.floor(snippetLength / 2);
    const start = Math.max(0, matchIndex - halfSnippet);
    const end = Math.min(content.length, matchIndex + matchLength + halfSnippet);

    let snippet = content.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet.trim();
  }

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema() {
    const schema = {
      type: 'object',
      title: 'Content Search Params',
      description: 'Search vault files using native Obsidian fuzzy search for file names combined with keyword search in content. Results are ranked by relevance.',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find files and content. Uses fuzzy matching for file names and keyword search in content.',
          examples: ['project planning', 'typescript', 'notes', 'README']
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
          minimum: 1,
          maximum: 50,
          default: 10
        },
        includeContent: {
          type: 'boolean',
          description: 'Whether to search within file content and include snippets (default: true)',
          default: true
        },
        snippetLength: {
          type: 'number',
          description: 'Length of content snippets around matches (default: 200)',
          minimum: 50,
          maximum: 1000,
          default: 200
        },
        paths: {
          type: 'array',
          description: 'Restrict search to specific folder paths. Supports glob patterns (e.g., "folder/*.md", "**/*.ts").',
          items: { type: 'string' }
        }
      },
      required: ['query'],
      additionalProperties: false
    };

    return this.getMergedSchema(schema);
  }

  /**
   * Get result schema for MCP tool definition
   */
  getResultSchema() {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the search was successful'
        },
        query: {
          type: 'string',
          description: 'Original search query'
        },
        results: {
          type: 'array',
          description: 'Search results ranked by relevance',
          items: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file'
              },
              title: {
                type: 'string',
                description: 'File name without extension'
              },
              content: {
                type: 'string',
                description: 'Content snippet around the match'
              },
              score: {
                type: 'number',
                description: 'Relevance score (0-1, higher is better)'
              },
              searchMethod: {
                type: 'string',
                enum: ['fuzzy', 'keyword', 'combined'],
                description: 'Search method that found this result'
              },
              frontmatter: {
                type: 'object',
                description: 'File frontmatter including tags, properties, and other YAML metadata',
                additionalProperties: true
              },
              metadata: {
                type: 'object',
                properties: {
                  fileExtension: { type: 'string' },
                  parentFolder: { type: 'string' },
                  modifiedTime: { type: 'number' }
                }
              }
            },
            required: ['filePath', 'title', 'content', 'score', 'searchMethod']
          }
        },
        totalResults: {
          type: 'number',
          description: 'Total number of results found'
        },
        executionTime: {
          type: 'number',
          description: 'Search execution time in milliseconds'
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success', 'query', 'results', 'totalResults', 'executionTime'],
      additionalProperties: false
    };
  }
}
