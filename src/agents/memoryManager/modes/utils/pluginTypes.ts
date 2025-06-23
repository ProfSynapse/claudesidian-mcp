import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { MemoryService } from '../../../../database/services/MemoryService';
import { FileEmbeddingAccessService } from '../../../../database/services/FileEmbeddingAccessService';
import { SemanticSearchService } from '../../../../database/services/SemanticSearchService';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { IVectorStore } from '../../../../database/interfaces/IVectorStore';

/**
 * Custom interface for the Claudesidian plugin with services
 */
export interface ClaudesidianPlugin extends Plugin {
  services: {
    workspaceService: WorkspaceService;
    memoryService: MemoryService;
    fileEmbeddingAccessService: FileEmbeddingAccessService;
    semanticSearchService: SemanticSearchService;
    embeddingService: EmbeddingService;
    vectorStore: IVectorStore;
    [key: string]: any;
  };
}