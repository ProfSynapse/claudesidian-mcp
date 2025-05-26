import { App } from 'obsidian';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { ContentOperations } from './ContentOperations';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Shared utility for updating embeddings after content modifications
 * Provides both chunk-level diff-based updates and full file reindexing fallbacks
 */
export class EmbeddingUpdateHelper {
  private app: App;
  private embeddingService: EmbeddingService | null;
  private searchService: ChromaSearchService | null;

  constructor(
    app: App,
    embeddingService?: EmbeddingService | null,
    searchService?: ChromaSearchService | null
  ) {
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
  }

  /**
   * Update embeddings for a file using the most efficient method available
   * @param filePath Path to the file
   * @param workspaceContext Workspace context
   * @param sessionId Session ID for activity recording
   * @param oldContent Optional old content for diff-based updates
   * @param operationType Type of operation for logging
   */
  async updateFileEmbeddings(
    filePath: string,
    workspaceContext?: any,
    sessionId?: string,
    oldContent?: string,
    operationType: string = 'content-modification'
  ): Promise<void> {
    try {
      // Skip if no ChromaDB services available
      if (!this.searchService && !this.embeddingService) {
        console.log(`[EmbeddingUpdateHelper] No embedding services available for ${filePath}`);
        return;
      }

      // Parse workspace context for workspace ID
      const parsedContext = parseWorkspaceContext(workspaceContext);
      const workspaceId = parsedContext?.workspaceId;

      // Get the updated file content
      const updatedContent = await ContentOperations.readContent(this.app, filePath);

      // Use diff-based updates if we have the old content and embedding service
      if (this.embeddingService && oldContent && oldContent !== updatedContent) {
        console.log(`[EmbeddingUpdateHelper] Using chunk-level update for ${operationType} in file: ${filePath}`);
        
        try {
          const updatedIds = await this.embeddingService.updateChangedChunks(
            filePath,
            oldContent,
            updatedContent,
            workspaceId
          );
          
          console.log(`[EmbeddingUpdateHelper] Updated ${updatedIds.length} chunks in file: ${filePath}`);
          
          // Record successful update
          await this.recordMemoryTrace(
            filePath,
            workspaceContext,
            sessionId,
            operationType,
            { chunksUpdated: updatedIds.length, method: 'chunk-level' }
          );
          
          return;
        } catch (error) {
          console.warn(`[EmbeddingUpdateHelper] Chunk-level update failed for ${filePath}, falling back to full reindex:`, error);
          // Fall through to full reindexing
        }
      } else if (!oldContent && this.embeddingService) {
        console.log(`[EmbeddingUpdateHelper] No old content available for ${filePath}, using full reindex`);
      }

      // Fallback to full file reindexing
      if (this.searchService) {
        console.log(`[EmbeddingUpdateHelper] Using full file reindexing for ${operationType} in file: ${filePath}`);
        
        await this.searchService.indexFile(
          filePath,
          workspaceId,
          { 
            force: true, // Force reindexing since content changed
            sessionId: sessionId
          }
        );
        
        // Record successful update
        await this.recordMemoryTrace(
          filePath,
          workspaceContext,
          sessionId,
          operationType,
          { method: 'full-reindex' }
        );
      }
      // Last resort: EmbeddingService direct call
      else if (this.embeddingService) {
        console.log(`[EmbeddingUpdateHelper] Using EmbeddingService fallback for ${operationType} in file: ${filePath}`);
        
        // Generate embedding for updated file content
        const embedding = await this.embeddingService.getEmbedding(updatedContent);

        if (embedding) {
          console.log(`[EmbeddingUpdateHelper] Generated embedding for ${operationType} in file: ${filePath}`);
          
          // Record successful update
          await this.recordMemoryTrace(
            filePath,
            workspaceContext,
            sessionId,
            operationType,
            { method: 'direct-embedding' }
          );
        }
      }

    } catch (error) {
      console.error(`[EmbeddingUpdateHelper] Error updating embeddings for ${filePath}:`, getErrorMessage(error));
      // Don't throw error - embedding update is a secondary operation
      // and should not prevent the primary operation from succeeding
    }
  }

  /**
   * Record memory trace for file modification to track activity
   * @param filePath Path to the file
   * @param workspaceContext Workspace context
   * @param sessionId Session ID
   * @param operationType Type of operation
   * @param metadata Additional metadata
   */
  private async recordMemoryTrace(
    filePath: string,
    workspaceContext?: any,
    sessionId?: string,
    operationType: string = 'content-modification',
    metadata: any = {}
  ): Promise<void> {
    try {
      const parsedContext = parseWorkspaceContext(workspaceContext);
      const workspaceId = parsedContext?.workspaceId;

      if (!workspaceId || !sessionId) {
        return;
      }

      // Get the memoryService from the plugin
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      const memoryService = plugin?.services?.memoryService;

      if (memoryService) {
        // Store a memory trace with the file path in relatedFiles
        await memoryService.storeMemoryTrace({
          workspaceId,
          workspacePath: parsedContext?.workspacePath || [workspaceId],
          contextLevel: 'workspace',
          activityType: 'research',
          content: `${operationType} operation in file: ${filePath}`,
          metadata: {
            tool: `contentManager.${operationType}`,
            params: { filePath },
            result: { success: true },
            relatedFiles: [filePath],  // Critical for tracking recent files
            embeddingUpdate: metadata
          },
          sessionId: sessionId,
          timestamp: Date.now(),
          importance: 0.6,
          tags: ['file-modification', operationType]
        });

        // Optionally record in workspace activity history if available
        const workspaceService = plugin?.services?.workspaceService;
        if (workspaceService) {
          await workspaceService.recordActivity(workspaceId, {
            action: 'edit',
            timestamp: Date.now(),
            hierarchyPath: [filePath]
          });
        }
      }
    } catch (error) {
      console.warn(`[EmbeddingUpdateHelper] Error recording memory trace for ${operationType} operation:`, getErrorMessage(error));
      // Don't throw - this is supplementary tracking
    }
  }
}