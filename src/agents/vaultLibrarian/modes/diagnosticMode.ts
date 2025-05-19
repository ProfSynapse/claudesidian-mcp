import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { DiagnosticModeParameters, DiagnosticModeResult } from '../types';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { IVectorStore } from '../../../database/interfaces/IVectorStore';

/**
 * DiagnosticMode provides system diagnostics about the ChromaDB integration
 * and vector database state.
 */
export class DiagnosticMode extends BaseMode<DiagnosticModeParameters, DiagnosticModeResult> {
  private app: App;
  private searchService: ChromaSearchService | null;
  private vectorStore: IVectorStore | null;

  /**
   * Create a new DiagnosticMode instance
   * @param app Obsidian app
   * @param searchService ChromaSearchService instance
   * @param vectorStore Vector store instance
   */
  constructor(
    app: App,
    searchService: ChromaSearchService | null,
    vectorStore: IVectorStore | null
  ) {
    super('diagnostic', 'Get system diagnostics for ChromaDB');
    this.app = app;
    this.searchService = searchService;
    this.vectorStore = vectorStore;
  }

  /**
   * Execute the diagnostic mode
   * @param parameters Mode parameters
   * @returns Diagnostic information
   */
  async execute(parameters: DiagnosticModeParameters): Promise<DiagnosticModeResult> {
    try {
      // Get plugin instance
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');

      // If vectorStore is not directly provided, try to get it from the plugin
      let vectorStore = this.vectorStore;
      if (!vectorStore && plugin?.services?.vectorStore) {
        vectorStore = plugin.services.vectorStore;
      }

      if (!vectorStore) {
        return {
          success: false,
          error: "Vector store not available",
          sessionId: parameters.sessionId,
          context: parameters.context,
          data: {
            componentStatus: 'error',
            message: 'Vector store not initialized or available'
          }
        };
      }

      // Get diagnostics from the vector store
      let diagnostics: Record<string, any> = {};
      if ('getDiagnostics' in vectorStore) {
        diagnostics = await (vectorStore as any).getDiagnostics();
      } else {
        // Fallback to basic information if no diagnostics method available
        diagnostics = {
          status: 'limited',
          message: 'Limited diagnostics available - vectorStore does not support getDiagnostics()',
          initialized: (vectorStore as any).initialized || false,
          collections: await vectorStore.listCollections()
        };
      }

      // Get additional system information
      const systemInfo = {
        platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        obsidianVersion: this.app.appVersion || 'unknown',
        usageStats: plugin?.getUsageStats?.() || {}
      };

      return {
        success: true,
        sessionId: parameters.sessionId,
        context: parameters.context,
        data: {
          componentStatus: diagnostics.status === 'ok' ? 'operational' : 'warning',
          vectorStore: diagnostics,
          system: systemInfo
        }
      };
    } catch (error) {
      console.error('Error in diagnostic mode:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: parameters.sessionId,
        context: parameters.context,
        data: {
          componentStatus: 'error',
          message: 'Diagnostic check failed with error',
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Get the parameter schema for diagnosticMode
   * @returns JSON schema for parameters
   */
  getParameterSchema(): Record<string, any> {
    return {
      type: 'object',
      required: ['sessionId', 'context'],
      properties: {
        sessionId: {
          type: 'string',
          description: 'Unique identifier for the current session'
        },
        context: {
          type: 'string',
          description: 'Context for the diagnostic request'
        },
        detail: {
          type: 'string',
          enum: ['basic', 'detailed', 'full'],
          default: 'basic',
          description: 'Level of detail for the diagnostic information'
        }
      }
    };
  }

  /**
   * Get the result schema for diagnosticMode
   * @returns JSON schema for results
   */
  getResultSchema(): Record<string, any> {
    return {
      type: 'object',
      required: ['success', 'sessionId', 'data'],
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the diagnostic check was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if the diagnostic check failed'
        },
        sessionId: {
          type: 'string',
          description: 'Unique identifier for the current session'
        },
        context: {
          type: 'string',
          description: 'Context for the diagnostic request'
        },
        data: {
          type: 'object',
          description: 'Diagnostic information',
          properties: {
            componentStatus: {
              type: 'string',
              enum: ['operational', 'warning', 'error'],
              description: 'Overall status of the vector store component'
            },
            message: {
              type: 'string',
              description: 'Diagnostic message'
            },
            vectorStore: {
              type: 'object',
              description: 'Vector store diagnostic information'
            },
            system: {
              type: 'object',
              description: 'System diagnostic information'
            }
          }
        }
      }
    };
  }
}