/**
 * FileCollector - Collects associated files for state restoration
 * Follows Single Responsibility Principle by focusing only on file collection
 */

import { App } from 'obsidian';
import { MetadataSearchService } from '../../../../../../database/services/MetadataSearchService';
import { WorkspaceStateSnapshot } from '../../../../../../database/types/session/SessionTypes';

export interface FileCollectionResult {
  success: boolean;
  associatedNotes?: Set<string>;
  error?: string;
}

/**
 * Service responsible for collecting files associated with state restoration
 * Follows SRP by focusing only on file collection operations
 */
export class FileCollector {
  private readonly commonKeyFilePatterns = [
    /readme\.md$/i, 
    /index\.md$/i, 
    /summary\.md$/i, 
    /moc\.md$/i, 
    /map(?:\s|_|-)*of(?:\s|_|-)*contents\.md$/i
  ];

  constructor(
    private app: App,
    private metadataSearchService: MetadataSearchService
  ) {}

  /**
   * Collect all associated files for state restoration
   */
  async collectAssociatedFiles(
    state: WorkspaceStateSnapshot,
    workspace: any,
    contextDepth: 'minimal' | 'standard' | 'comprehensive' = 'standard'
  ): Promise<FileCollectionResult> {
    try {
      const associatedNotes = new Set<string>();

      // Add context files from the state
      await this.addStateContextFiles(state, associatedNotes);

      // Add key files from workspace
      await this.addWorkspaceKeyFiles(workspace, associatedNotes);

      // Add pattern-based key files for comprehensive context
      if (contextDepth === 'comprehensive') {
        await this.addPatternBasedFiles(workspace, associatedNotes);
      }

      return {
        success: true,
        associatedNotes
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to collect associated files: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Add context files from the state
   */
  private async addStateContextFiles(
    state: WorkspaceStateSnapshot,
    associatedNotes: Set<string>
  ): Promise<void> {
    const stateFiles = state.state?.contextFiles || [];
    stateFiles.forEach(file => associatedNotes.add(file));
  }

  /**
   * Add key files from workspace based on properties
   */
  private async addWorkspaceKeyFiles(
    workspace: any,
    associatedNotes: Set<string>
  ): Promise<void> {
    if (!workspace?.rootFolder) return;

    try {
      // Search for files with 'key: true' property
      const keyFiles = await this.metadataSearchService.searchByProperty('key', 'true', {
        path: workspace.rootFolder,
        limit: 10
      });
      
      for (const file of keyFiles) {
        associatedNotes.add(file.path);
      }
    } catch (error) {
      console.warn(`Failed to get key files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add files matching common key file patterns
   */
  private async addPatternBasedFiles(
    workspace: any,
    associatedNotes: Set<string>
  ): Promise<void> {
    if (!workspace?.rootFolder) return;

    try {
      const files = this.app.vault.getMarkdownFiles()
        .filter((file: { path: string }) => file.path.startsWith(workspace.rootFolder));
        
      for (const file of files) {
        for (const pattern of this.commonKeyFilePatterns) {
          if (pattern.test(file.path) && !associatedNotes.has(file.path)) {
            associatedNotes.add(file.path);
            break;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to add pattern-based files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate collected files
   */
  validateFiles(associatedNotes: Set<string>): {
    valid: string[];
    invalid: string[];
  } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const filePath of associatedNotes) {
      try {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file) {
          valid.push(filePath);
        } else {
          invalid.push(filePath);
        }
      } catch (error) {
        invalid.push(filePath);
      }
    }

    return { valid, invalid };
  }

  /**
   * Get file statistics
   */
  getFileStatistics(associatedNotes: Set<string>): {
    totalFiles: number;
    byExtension: Record<string, number>;
  } {
    const stats = {
      totalFiles: associatedNotes.size,
      byExtension: {} as Record<string, number>
    };

    for (const filePath of associatedNotes) {
      const extension = filePath.split('.').pop() || 'unknown';
      stats.byExtension[extension] = (stats.byExtension[extension] || 0) + 1;
    }

    return stats;
  }
}