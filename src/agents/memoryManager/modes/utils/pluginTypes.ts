import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { MemoryService } from '../../../../database/services/MemoryService';
import { FileEmbeddingAccessService } from '../../../../database/services/FileEmbeddingAccessService';
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
    embeddingService: EmbeddingService;
    vectorStore: IVectorStore;
    [key: string]: any;
  };
  getService<T>(serviceName: string): Promise<T | null>;
}