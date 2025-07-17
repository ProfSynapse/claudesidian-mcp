/**
 * LoadWorkspaceMode - Refactored following SOLID principles
 * Orchestrates specialized services for workspace loading
 */

import { BaseMode } from '../../../../baseMode';
import { LoadWorkspaceParameters, LoadWorkspaceResult } from '../../../../../database/types/workspace/ParameterTypes';
import { WorkspaceService } from '../../../../../database/services/WorkspaceService';
import { MemoryService } from '../../../../../database/services/MemoryService';
import { WorkspaceRetriever } from './workspace/WorkspaceRetriever';
import { SummaryGenerator } from './workspace/SummaryGenerator';
import { RecentFilesCollector } from './files/RecentFilesCollector';
import { KeyFilesCollector } from './files/KeyFilesCollector';
import { DirectoryStructureBuilder } from './structure/DirectoryStructureBuilder';
import { SessionCollector } from './context/SessionCollector';
import { StateCollector } from './state/StateCollector';
import { MetadataSearchService } from '../../../../../database/services/MetadataSearchService';
import { CacheManager } from '../../../../../database/services/CacheManager';
import { DirectoryTreeBuilder } from '../../../../../utils/directoryTreeUtils';
import { App, Plugin } from 'obsidian';

// Define a custom interface for the Claudesidian plugin
interface ClaudesidianPlugin extends Plugin {
  services?: {
    workspaceService?: WorkspaceService;
    memoryService?: MemoryService;
    cacheManager?: CacheManager;
  };
}

// Custom error class for workspace loading
class WorkspaceLoadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'WorkspaceLoadError';
  }
}

/**
 * Refactored LoadWorkspaceMode following SOLID principles
 * Orchestrates specialized services for workspace loading
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private workspaceRetriever!: WorkspaceRetriever;
  private summaryGenerator!: SummaryGenerator;
  private recentFilesCollector!: RecentFilesCollector;
  private keyFilesCollector!: KeyFilesCollector;
  private directoryStructureBuilder!: DirectoryStructureBuilder;
  private sessionCollector!: SessionCollector;
  private stateCollector!: StateCollector;
  
  private app: App;
  private plugin: any;
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;
  private metadataSearchService!: MetadataSearchService;
  private cacheManager: CacheManager | null = null;
  private directoryTreeBuilder!: DirectoryTreeBuilder;

  constructor(app: App) {
    super(
      'loadWorkspace',
      'Load Workspace',
      'Load a workspace as the active context',
      '1.0.0'
    );
    
    this.app = app;
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    this.metadataSearchService = new MetadataSearchService(app);
    this.directoryTreeBuilder = new DirectoryTreeBuilder(app);
    
    // Access services through plugin
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services) {
        this.workspaceService = pluginWithServices.services.workspaceService || null;
        this.memoryService = pluginWithServices.services.memoryService || null;
        this.cacheManager = pluginWithServices.services.cacheManager || null;
      }
    }
    
    // Services will be initialized when mode is executed
  }

  /**
   * Initialize all specialized services
   */
  private initializeServices(): void {
    // Try to get services again if they weren't available during construction
    if (!this.workspaceService || !this.memoryService) {
      if (this.plugin) {
        const pluginWithServices = this.plugin as ClaudesidianPlugin;
        if (pluginWithServices.services) {
          this.workspaceService = this.workspaceService || pluginWithServices.services.workspaceService || null;
          this.memoryService = this.memoryService || pluginWithServices.services.memoryService || null;
          this.cacheManager = this.cacheManager || pluginWithServices.services.cacheManager || null;
        }
      }
    }
    
    if (!this.workspaceService) {
      throw new Error('WorkspaceService not available - required for workspace loading');
    }
    if (!this.memoryService) {
      throw new Error('MemoryService not available - required for workspace loading');
    }
    
    this.workspaceRetriever = new WorkspaceRetriever(this.workspaceService);
    this.summaryGenerator = new SummaryGenerator();
    this.recentFilesCollector = new RecentFilesCollector(this.app, this.cacheManager || undefined);
    this.keyFilesCollector = new KeyFilesCollector(
      this.app,
      this.metadataSearchService,
      this.cacheManager || undefined
    );
    this.directoryStructureBuilder = new DirectoryStructureBuilder(
      this.app,
      this.directoryTreeBuilder
    );
    this.sessionCollector = new SessionCollector(this.memoryService);
    this.stateCollector = new StateCollector(this.memoryService);
  }

  /**
   * Execute workspace loading using orchestrated services
   */
  async execute(params: LoadWorkspaceParameters): Promise<LoadWorkspaceResult> {
    try {
      // Initialize services if not already done
      if (!this.workspaceRetriever) {
        this.initializeServices();
      }
      
      // Phase 1: Retrieve and validate workspace
      const workspaceData = await this.executeWorkspaceRetrieval(params);
      
      // Phase 2: Generate workspace summary
      const summary = await this.executeWorkspaceSummary(workspaceData);
      
      // Phase 3: Collect file information
      const fileInfo = await this.executeFileCollection(workspaceData);
      
      // Phase 4: Generate directory structure
      const directoryStructure = await this.executeDirectoryStructure(workspaceData);
      
      // Phase 5: Collect session and state context
      const contextInfo = await this.executeContextCollection(workspaceData);
      
      // Phase 6: Assemble final result
      return this.assembleResult(
        workspaceData,
        summary,
        fileInfo,
        directoryStructure,
        contextInfo
      );
    } catch (error) {
      if (error instanceof WorkspaceLoadError) {
        throw error;
      }
      throw new Error(`Failed to load workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Phase 1: Retrieve and validate workspace
   */
  private async executeWorkspaceRetrieval(params: LoadWorkspaceParameters): Promise<any> {
    const result = await this.workspaceRetriever.retrieveWorkspace(params);
    
    if (!result.success) {
      throw new WorkspaceLoadError(
        'WORKSPACE_NOT_FOUND',
        result.error || 'Workspace not found'
      );
    }

    return result.workspace;
  }

  /**
   * Phase 2: Generate workspace summary
   */
  private async executeWorkspaceSummary(workspace: any): Promise<string> {
    try {
      // Get workspace children if they exist
      const children = workspace.children || [];
      const summary = this.summaryGenerator.generateWorkspaceSummary(workspace, children);
      
      return summary.description;
    } catch (error) {
      console.warn('Error generating workspace summary:', error);
      return `# ${workspace.name}\n\nError generating summary: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Phase 3: Collect file information
   */
  private async executeFileCollection(workspace: any): Promise<{
    recentFiles: string[];
    keyFiles: string[];
  }> {
    try {
      const [recentFiles, keyFiles] = await Promise.all([
        this.recentFilesCollector.getRecentFiles(workspace, { limit: 10 }),
        this.keyFilesCollector.getKeyFiles(workspace)
      ]);

      return {
        recentFiles: recentFiles.slice(0, 10),
        keyFiles: keyFiles.slice(0, 20)
      };
    } catch (error) {
      console.warn('Error collecting file information:', error);
      return {
        recentFiles: [],
        keyFiles: []
      };
    }
  }

  /**
   * Phase 4: Generate directory structure
   */
  private async executeDirectoryStructure(workspace: any): Promise<string> {
    try {
      return await this.directoryStructureBuilder.generateDirectoryStructure(workspace, {
        maxDepth: 3,
        includeFiles: true,
        includeFolders: true,
        fileLimit: 50
      });
    } catch (error) {
      console.warn('Error generating directory structure:', error);
      return `Error generating directory structure: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Phase 5: Collect session and state context
   */
  private async executeContextCollection(workspace: any): Promise<{
    sessionSummary: string;
    stateSummary: string;
  }> {
    try {
      const [sessionSummary, stateSummary] = await Promise.all([
        this.sessionCollector.getSessionSummary(workspace.id),
        this.stateCollector.getStateSummary(workspace.id)
      ]);

      return {
        sessionSummary,
        stateSummary
      };
    } catch (error) {
      console.warn('Error collecting context information:', error);
      return {
        sessionSummary: 'Error collecting session data',
        stateSummary: 'Error collecting state data'
      };
    }
  }

  /**
   * Phase 6: Assemble final result
   */
  private assembleResult(
    workspace: any,
    summary: string,
    fileInfo: { recentFiles: string[]; keyFiles: string[] },
    directoryStructure: string,
    contextInfo: { sessionSummary: string; stateSummary: string }
  ): LoadWorkspaceResult {
    return {
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          rootFolder: workspace.rootFolder,
          summary: summary,
          hierarchyType: workspace.hierarchyType,
          path: workspace.path || [],
          keyFileInstructions: directoryStructure,
          children: workspace.children || []
        },
        context: {
          recentFiles: fileInfo.recentFiles,
          keyFiles: fileInfo.keyFiles,
          relatedConcepts: [], // Could be populated from analysis
          associatedNotes: [], // Could be populated from analysis
          sessions: [], // Could be populated from session data
          states: [], // Could be populated from state data
          directoryStructure: {
            textView: directoryStructure + '\n\n' + contextInfo.sessionSummary + '\n\n' + contextInfo.stateSummary
          }
        }
      }
    };
  }

  /**
   * Get parameter schema for MCP
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workspace ID to load'
        },
        includeChildren: {
          type: 'boolean',
          description: 'Include child workspaces in the result',
          default: false
        },
        includeFileDetails: {
          type: 'boolean',
          description: 'Include detailed file information',
          default: true
        },
        includeDirectoryStructure: {
          type: 'boolean',
          description: 'Include directory structure',
          default: true
        },
        includeSessionContext: {
          type: 'boolean',
          description: 'Include session and state context',
          default: true
        }
      },
      required: ['id']
    };
  }

  /**
   * Get result schema for MCP
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        workspace: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            rootFolder: { type: 'string' },
            created: { type: 'number' },
            lastAccessed: { type: 'number' },
            hierarchyType: { type: 'string' },
            parentId: { type: 'string' },
            path: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
            completionStatus: { type: 'object' },
            relevanceSettings: { type: 'object' }
          },
          required: ['id', 'name', 'rootFolder', 'created', 'lastAccessed']
        },
        summary: { type: 'string' },
        recentFiles: { type: 'array', items: { type: 'string' } },
        keyFiles: { type: 'array', items: { type: 'string' } },
        directoryStructure: { type: 'string' },
        sessionSummary: { type: 'string' },
        stateSummary: { type: 'string' }
      },
      required: ['workspace', 'summary']
    };
  }
}