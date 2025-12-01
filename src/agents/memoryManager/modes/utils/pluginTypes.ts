import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { MemoryService } from "../../services/MemoryService";

/**
 * Custom interface for the Nexus plugin with services
 */
export interface NexusPluginWithServices extends Plugin {
  services: {
    workspaceService: WorkspaceService;
    memoryService: MemoryService;
    [key: string]: any;
  };
  getService<T>(serviceName: string): Promise<T | null>;
}
