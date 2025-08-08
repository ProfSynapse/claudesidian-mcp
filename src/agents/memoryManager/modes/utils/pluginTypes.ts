import { Plugin } from 'obsidian';
import { WorkspaceService } from "../services/WorkspaceService";
import { MemoryService } from "../services/MemoryService";
import { FileEmbeddingAccessService } from '../../../../database/services/FileEmbeddingAccessService';
import { EmbeddingService } from "../../database/services/core/EmbeddingService";
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