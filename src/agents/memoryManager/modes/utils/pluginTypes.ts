import { Plugin } from 'obsidian';
import { WorkspaceService } from "../../services/WorkspaceService";
import { MemoryService } from "../../services/MemoryService";

/**
 * Custom interface for the Claudesidian plugin with services
 * Embedding services removed for simplified JSON-based architecture
 */
export interface ClaudesidianPlugin extends Plugin {
  services: {
    workspaceService: WorkspaceService;
    memoryService: MemoryService;
    [key: string]: any;
  };
  getService<T>(serviceName: string): Promise<T | null>;
}