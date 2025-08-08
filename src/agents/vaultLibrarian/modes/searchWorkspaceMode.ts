import { Plugin, TFile, prepareFuzzySearch } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { CommonParameters } from '../../../types/mcp/AgentTypes';
import { EmbeddingService } from "../../database/services/core/EmbeddingService";
import { WorkspaceService } from "../memoryManager/services/WorkspaceService";

/**
 * Workspace search scope configuration
 */
export interface WorkspaceSearchScope {
  includeRootFolder?: boolean;      // Default: true
  includeRelatedFolders?: boolean;  // Default: true
  includeAssociatedNotes?: boolean; // Default: true
  restrictToWorkspace?: boolean;    // Default: false
}

/**
 * Workspace search parameters interface
 */
export interface SearchWorkspaceParams extends CommonParameters {
  // REQUIRED PARAMETERS
  query: string;
  workspaceId: string;  // Defaults to global workspace if not provided

  // OPTIONAL PARAMETERS
  queryType?: 'exact' | 'conceptual' | 'exploratory' | 'mixed';
  searchScope?: WorkspaceSearchScope;
  limit?: number;
  includeContent?: boolean;
}

interface SearchModeCapabilities {
  semanticSearch: boolean;
  workspaceFiltering: boolean;
  memorySearch: boolean;
  hybridSearch: boolean;
}

/**
 * Workspace search result item
 */
export interface WorkspaceSearchItem {
  name: string;
  path: string;
  score: number;
  searchMethod: 'semantic' | 'keyword' | 'fuzzy' | 'hybrid';
  workspaceRelation: 'root' | 'related' | 'associated' | 'external';
  content?: string;
  snippet?: string;
  metadata?: Record<string, any>;
}

/**
 * Workspace search result interface
 */
export interface SearchWorkspaceResult {
  success: boolean;
  query: string;
  workspaceId: string;
  workspaceName?: string;
  results: WorkspaceSearchItem[];
  totalResults: number;
  searchCapabilities: SearchModeCapabilities;
  executionTime?: number;
  error?: string;
}

/**
 * Workspace context for search operations
 */
interface WorkspaceContext {
  id: string;
  name: string;
  rootFolder: string;
  relatedFolders: string[];
  associatedNotes: string[];
}

/**
 * Enhanced Workspace Search Mode
 * Provides workspace-aware content search with HybridSearchService integration,
 * workspace filtering, and context-aware result ranking
 */
export class SearchWorkspaceMode extends BaseMode<SearchWorkspaceParams, SearchWorkspaceResult> {
  private plugin: Plugin;
  private embeddingService?: EmbeddingService;
  private workspaceService?: WorkspaceService;
  private hybridSearchService?: any; // HybridSearchService

  constructor(
    plugin: Plugin,
    embeddingService?: EmbeddingService,
    workspaceService?: WorkspaceService,
    hybridSearchService?: any
  ) {
    super(
      'searchWorkspaceMode',
      'Search Workspace',
      'WORKSPACE-FOCUSED search with required workspaceId parameter. Search within workspace context including associated notes and related folders. Uses semantic, hybrid, and fuzzy search methods. Requires: query (search terms) and workspaceId (workspace context - defaults to "global-workspace-default").',
      '2.0.0'
    );

    this.plugin = plugin;
    this.embeddingService = embeddingService;
    this.workspaceService = workspaceService;
    this.hybridSearchService = hybridSearchService;
  }

  async execute(params: SearchWorkspaceParams): Promise<SearchWorkspaceResult> {
    const startTime = Date.now();
    
    try {
      // Simple parameter validation
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          query: params.query || '',
          workspaceId: params.workspaceId || 'global-workspace-default',
          results: [],
          totalResults: 0,
          searchCapabilities: this.getCapabilities(),
          executionTime: Date.now() - startTime,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      // Apply default workspace if not provided
      const workspaceId = params.workspaceId || 'global-workspace-default';

      // Get workspace context and files
      const workspaceContext = await this.getWorkspaceContext(workspaceId);
      const workspaceFiles = await this.getWorkspaceFiles(workspaceId, params.searchScope);

      let results: WorkspaceSearchItem[] = [];
      const capabilities = this.getCapabilities();

      // Route to best available search method
      if (capabilities.hybridSearch && workspaceFiles.length > 0) {
        results = await this.executeHybridSearch(params, workspaceFiles, workspaceContext);
      } else if (capabilities.semanticSearch && workspaceFiles.length > 0) {
        results = await this.executeSemanticSearch(params, workspaceFiles, workspaceContext);
      } else {
        results = await this.executeBasicSearch(params, workspaceFiles, workspaceContext);
      }

      // Apply workspace-specific ranking
      results = this.applyWorkspaceRanking(results, workspaceContext);

      // Apply limit
      const limitedResults = results.slice(0, params.limit || 10);

      return {
        success: true,
        query: params.query,
        workspaceId: params.workspaceId,
        workspaceName: workspaceContext?.name,
        results: limitedResults,
        totalResults: results.length,
        searchCapabilities: capabilities,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        query: params.query || '',
        workspaceId: params.workspaceId || 'global-workspace-default',
        results: [],
        totalResults: 0,
        searchCapabilities: this.getCapabilities(),
        executionTime: Date.now() - startTime,
        error: `Workspace search failed: ${getErrorMessage(error)}`
      };
    }
  }

  private async getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext | undefined> {
    if (!this.workspaceService || workspaceId === 'global-workspace-default') {
      return undefined;
    }

    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      return workspace ? {
        id: workspace.id,
        name: workspace.name,
        rootFolder: workspace.rootFolder,
        relatedFolders: workspace.relatedFolders || [],
        associatedNotes: workspace.associatedNotes || []
      } : undefined;
    } catch (error) {
      console.warn(`Could not load workspace context for ${workspaceId}:`, error);
      return undefined;
    }
  }

  private async getWorkspaceFiles(
    workspaceId: string,
    searchScope?: WorkspaceSearchScope
  ): Promise<TFile[]> {
    const scope = {
      includeRootFolder: true,
      includeRelatedFolders: true,
      includeAssociatedNotes: true,
      restrictToWorkspace: false,
      ...searchScope
    };

    if (workspaceId === 'global-workspace-default' && !scope.restrictToWorkspace) {
      // Global workspace includes all vault files
      return this.plugin.app.vault.getMarkdownFiles();
    }

    if (!this.workspaceService) {
      // Fallback to all files if no workspace service
      return this.plugin.app.vault.getMarkdownFiles();
    }

    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      if (!workspace) {
        return this.plugin.app.vault.getMarkdownFiles();
      }

      const files: TFile[] = [];

      // Include root folder files
      if (scope.includeRootFolder && workspace.rootFolder) {
        files.push(...this.getFilesInFolder(workspace.rootFolder));
      }

      // Include related folder files
      if (scope.includeRelatedFolders && workspace.relatedFolders) {
        for (const folder of workspace.relatedFolders) {
          files.push(...this.getFilesInFolder(folder));
        }
      }

      // Include associated notes
      if (scope.includeAssociatedNotes && workspace.associatedNotes) {
        for (const notePath of workspace.associatedNotes) {
          const file = this.plugin.app.vault.getAbstractFileByPath(notePath);
          if (file instanceof TFile) {
            files.push(file);
          }
        }
      }

      // Remove duplicates
      const uniqueFiles = Array.from(new Map(files.map(f => [f.path, f])).values());
      
      return scope.restrictToWorkspace ? uniqueFiles : 
             [...uniqueFiles, ...this.plugin.app.vault.getMarkdownFiles()];

    } catch (error) {
      console.warn(`Could not load workspace files for ${workspaceId}:`, error);
      return this.plugin.app.vault.getMarkdownFiles();
    }
  }

  private getFilesInFolder(folderPath: string): TFile[] {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !('children' in folder)) {
      return [];
    }

    const files: TFile[] = [];
    
    const collectFiles = (currentFolder: any) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFile && child.extension === 'md') {
          files.push(child);
        } else if ('children' in child) {
          collectFiles(child);
        }
      }
    };

    collectFiles(folder);
    return files;
  }

  private async executeHybridSearch(
    params: SearchWorkspaceParams,
    workspaceFiles: TFile[],
    workspaceContext?: WorkspaceContext
  ): Promise<WorkspaceSearchItem[]> {
    if (!this.hybridSearchService) {
      return this.executeBasicSearch(params, workspaceFiles, workspaceContext);
    }

    try {
      const hybridResult = await this.hybridSearchService.search(params.query, {
        queryType: params.queryType || 'mixed',
        limit: params.limit || 10,
        includeContent: params.includeContent ?? true,
        filteredFiles: workspaceFiles,
        threshold: 0.1 // Low threshold for workspace-scoped search
      });

      if (!hybridResult.success) {
        throw new Error(hybridResult.error || 'Hybrid search failed');
      }

      return hybridResult.results.map((result: any) => ({
        name: result.name,
        path: result.path,
        score: result.score,
        searchMethod: this.determineSearchMethod(result),
        workspaceRelation: this.determineWorkspaceRelation(result.path, workspaceContext),
        content: result.content,
        snippet: result.snippet,
        metadata: result.metadata
      }));

    } catch (error) {
      console.warn('Hybrid search failed, falling back to basic search:', error);
      return this.executeBasicSearch(params, workspaceFiles, workspaceContext);
    }
  }

  private async executeSemanticSearch(
    params: SearchWorkspaceParams,
    workspaceFiles: TFile[],
    workspaceContext?: WorkspaceContext
  ): Promise<WorkspaceSearchItem[]> {
    if (!this.embeddingService) {
      return this.executeBasicSearch(params, workspaceFiles, workspaceContext);
    }

    try {
      // This would integrate with the embedding service for semantic search
      // For now, fallback to basic search
      console.warn('Semantic search not fully implemented, using basic search');
      return this.executeBasicSearch(params, workspaceFiles, workspaceContext);
    } catch (error) {
      console.warn('Semantic search failed, falling back to basic search:', error);
      return this.executeBasicSearch(params, workspaceFiles, workspaceContext);
    }
  }

  private async executeBasicSearch(
    params: SearchWorkspaceParams,
    workspaceFiles: TFile[],
    workspaceContext?: WorkspaceContext
  ): Promise<WorkspaceSearchItem[]> {
    const fuzzySearch = prepareFuzzySearch(params.query);
    const results: WorkspaceSearchItem[] = [];

    for (const file of workspaceFiles) {
      // Search in file name
      const nameMatch = fuzzySearch(file.basename);
      if (nameMatch) {
        let content = '';
        let snippet = '';
        
        if (params.includeContent !== false) {
          try {
            content = await this.plugin.app.vault.read(file);
            snippet = this.generateSnippet(content, params.query);
            
            // Boost score if content contains query
            if (content.toLowerCase().includes(params.query.toLowerCase())) {
              nameMatch.score *= 1.3;
            }
          } catch (error) {
            console.warn(`Could not read content for ${file.path}:`, error);
          }
        }

        results.push({
          name: file.basename,
          path: file.path,
          score: nameMatch.score,
          searchMethod: 'fuzzy',
          workspaceRelation: this.determineWorkspaceRelation(file.path, workspaceContext),
          content: params.includeContent !== false ? content : undefined,
          snippet,
          metadata: { 
            size: file.stat.size,
            modified: file.stat.mtime,
            created: file.stat.ctime
          }
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private determineSearchMethod(result: any): 'semantic' | 'keyword' | 'fuzzy' | 'hybrid' {
    // Determine based on result metadata or properties
    if (result.searchMethod) return result.searchMethod;
    if (result.distance !== undefined) return 'semantic';
    if (result.score && result.score > 0.8) return 'keyword';
    return 'hybrid';
  }

  private determineWorkspaceRelation(
    filePath: string,
    workspaceContext?: WorkspaceContext
  ): 'root' | 'related' | 'associated' | 'external' {
    if (!workspaceContext) return 'external';

    // Check if file is in workspace root folder
    if (workspaceContext.rootFolder && 
        (filePath.startsWith(workspaceContext.rootFolder + '/') || filePath === workspaceContext.rootFolder)) {
      return 'root';
    }

    // Check if file is in related folders
    for (const relatedFolder of workspaceContext.relatedFolders) {
      if (filePath.startsWith(relatedFolder + '/') || filePath === relatedFolder) {
        return 'related';
      }
    }

    // Check if file is an associated note
    if (workspaceContext.associatedNotes.includes(filePath)) {
      return 'associated';
    }

    return 'external';
  }

  private applyWorkspaceRanking(
    results: WorkspaceSearchItem[],
    workspaceContext?: WorkspaceContext
  ): WorkspaceSearchItem[] {
    if (!workspaceContext) return results;

    return results.map(result => {
      let boost = 1.0;

      // Apply workspace relation boosts
      switch (result.workspaceRelation) {
        case 'root':
          boost = 1.4;  // 40% boost for root folder files
          break;
        case 'related':
          boost = 1.2;  // 20% boost for related folder files
          break;
        case 'associated':
          boost = 1.1;  // 10% boost for associated notes
          break;
        case 'external':
          boost = 0.8;  // 20% penalty for external files
          break;
      }

      // Apply search method boosts
      switch (result.searchMethod) {
        case 'semantic':
          boost *= 1.2;  // Boost semantic matches
          break;
        case 'hybrid':
          boost *= 1.1;  // Slight boost for hybrid matches
          break;
        case 'keyword':
          boost *= 1.05; // Small boost for keyword matches
          break;
        case 'fuzzy':
          boost *= 0.9;  // Slight penalty for fuzzy-only matches
          break;
      }

      return {
        ...result,
        score: result.score * boost
      };
    }).sort((a, b) => b.score - a.score);
  }

  private generateSnippet(content: string, query: string, maxLength: number = 150): string {
    if (!content) return '';
    
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const index = contentLower.indexOf(queryLower);
    if (index === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);
    
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  private getCapabilities(): SearchModeCapabilities {
    return {
      semanticSearch: !!this.embeddingService,
      workspaceFiltering: !!this.workspaceService,
      memorySearch: false,
      hybridSearch: !!this.hybridSearchService
    };
  }

  getParameterSchema() {
    const modeSchema = {
      type: 'object',
      title: 'Workspace Search Parameters',
      description: 'WORKSPACE-FOCUSED search with workspace context. Search within workspace boundaries including associated notes and related folders.',
      properties: {
        query: {
          type: 'string',
          description: 'REQUIRED: Search query to find in workspace content',
          minLength: 1,
          examples: ['project planning', 'machine learning', 'typescript', 'meeting notes']
        },
        workspaceId: {
          type: 'string',
          description: 'REQUIRED: Workspace ID to search within. IMPORTANT: If not provided or empty, defaults to "global-workspace-default" which searches the entire vault but may have limited/no memory content. Specify a proper workspace ID to search within workspace-specific context and memory.',
          examples: ['project-alpha', 'research-workspace', 'global-workspace-default'],
          default: 'global-workspace-default'
        },
        queryType: {
          type: 'string',
          enum: ['exact', 'conceptual', 'exploratory', 'mixed'],
          description: 'Search strategy: "exact" for specific terms, "conceptual" for topics, "exploratory" for questions, "mixed" for balanced search',
          default: 'mixed'
        },
        searchScope: {
          type: 'object',
          properties: {
            includeRootFolder: {
              type: 'boolean',
              default: true,
              description: 'Include files in workspace root folder'
            },
            includeRelatedFolders: {
              type: 'boolean',
              default: true,
              description: 'Include files in related folders'
            },
            includeAssociatedNotes: {
              type: 'boolean',
              default: true,
              description: 'Include files outside workspace but associated'
            },
            restrictToWorkspace: {
              type: 'boolean',
              default: false,
              description: 'Only search workspace files (excludes vault-wide files)'
            }
          },
          description: 'Define what to include in workspace search'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10,
          minimum: 1,
          maximum: 100
        },
        includeContent: {
          type: 'boolean',
          description: 'Include full content vs snippets in results',
          default: true
        }
      },
      required: ['query', 'workspaceId']
    };
    
    return this.getMergedSchema(modeSchema);
  }

  getResultSchema() {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        query: { type: 'string' },
        workspaceId: { type: 'string' },
        workspaceName: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              score: { type: 'number' },
              searchMethod: {
                type: 'string',
                enum: ['semantic', 'keyword', 'fuzzy', 'hybrid']
              },
              workspaceRelation: {
                type: 'string', 
                enum: ['root', 'related', 'associated', 'external']
              },
              content: { type: 'string' },
              snippet: { type: 'string' },
              metadata: { type: 'object' }
            }
          }
        },
        totalResults: { type: 'number' },
        searchCapabilities: {
          type: 'object',
          properties: {
            semanticSearch: { type: 'boolean' },
            workspaceFiltering: { type: 'boolean' },
            memorySearch: { type: 'boolean' },
            hybridSearch: { type: 'boolean' }
          }
        },
        executionTime: { type: 'number' },
        error: { type: 'string' }
      },
      required: ['success', 'query', 'workspaceId', 'results', 'totalResults', 'searchCapabilities']
    };
  }
}