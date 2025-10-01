import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { MemoryService } from "../../services/MemoryService";

/**
 * Custom interface for the Claudesidian plugin with services
 */
export interface ClaudesidianPlugin extends Plugin {
  services: {
    workspaceService: WorkspaceService;
    memoryService: MemoryService;
    [key: string]: any;
  };
  getService<T>(serviceName: string): Promise<T | null>;
}