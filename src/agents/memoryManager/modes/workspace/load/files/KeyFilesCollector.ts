/**
 * KeyFilesCollector - Identifies and collects key files for workspace
 * Follows Single Responsibility Principle by focusing only on key file identification
 */

import { App } from 'obsidian';
import { MetadataSearchService } from '../../../../../../database/services/MetadataSearchService';
import { CacheManager } from '../../../../../../database/services/CacheManager';
import { sanitizePath } from '../../../../../../utils/pathUtils';

export interface KeyFile {
  path: string;
  name: string;
  type: 'property' | 'pattern' | 'cache' | 'manual';
  priority: number;
  reason: string;
}

/**
 * Service responsible for identifying key files within a workspace
 * Follows SRP by focusing only on key file identification and collection
 */
export class KeyFilesCollector {
  private readonly commonKeyFilePatterns = [
    { pattern: /readme\.md$/i, priority: 10, reason: 'README file' },
    { pattern: /index\.md$/i, priority: 9, reason: 'Index file' },
    { pattern: /summary\.md$/i, priority: 8, reason: 'Summary file' },
    { pattern: /moc\.md$/i, priority: 7, reason: 'Map of Contents' },
    { pattern: /map(?:\s|_|-)*of(?:\s|_|-)*contents\.md$/i, priority: 7, reason: 'Map of Contents' },
    { pattern: /overview\.md$/i, priority: 6, reason: 'Overview file' },
    { pattern: /introduction\.md$/i, priority: 6, reason: 'Introduction file' },
    { pattern: /getting(?:\s|_|-)*started\.md$/i, priority: 5, reason: 'Getting Started guide' },
    { pattern: /changelog\.md$/i, priority: 4, reason: 'Changelog file' },
    { pattern: /todo\.md$/i, priority: 3, reason: 'TODO file' }
  ];

  constructor(
    private app: App,
    private metadataSearchService: MetadataSearchService,
    private cacheManager?: CacheManager
  ) {}

  /**
   * Get key files for the workspace
   */
  async getKeyFiles(workspace: { rootFolder: string; id: string }): Promise<string[]> {
    const keyFiles = await this.getKeyFilesDetailed(workspace);
    return keyFiles.map(file => file.path);
  }

  /**
   * Get detailed key file information
   */
  async getKeyFilesDetailed(workspace: { rootFolder: string; id: string }): Promise<KeyFile[]> {
    const keyFiles: KeyFile[] = [];
    
    // 1. Try to use cached file index if available
    const cachedKeyFiles = await this.getKeyFilesFromCache(workspace);
    keyFiles.push(...cachedKeyFiles);

    // 2. Search for files with the "key: true" property
    const propertyKeyFiles = await this.getKeyFilesByProperty(workspace);
    keyFiles.push(...propertyKeyFiles);

    // 3. Find files matching common key file patterns
    const patternKeyFiles = await this.getKeyFilesByPattern(workspace);
    keyFiles.push(...patternKeyFiles);

    // 4. Deduplicate and sort by priority
    const uniqueKeyFiles = this.deduplicateAndSort(keyFiles);

    return uniqueKeyFiles;
  }

  /**
   * Get key files from cache if available
   */
  private async getKeyFilesFromCache(workspace: { rootFolder: string; id: string }): Promise<KeyFile[]> {
    if (!this.cacheManager) {
      return [];
    }

    try {
      const keyFiles = this.cacheManager.getKeyFiles();
      const workspaceKeyFiles = keyFiles.filter((f: any) => 
        f.path.startsWith(workspace.rootFolder)
      );

      return workspaceKeyFiles.map((f: any) => ({
        path: f.path,
        name: f.name || f.path.split('/').pop() || f.path,
        type: 'cache' as const,
        priority: f.priority || 5,
        reason: f.reason || 'Cached key file'
      }));
    } catch (error) {
      console.warn('Error getting key files from cache:', error);
      return [];
    }
  }

  /**
   * Get key files by searching for "key: true" property
   */
  private async getKeyFilesByProperty(workspace: { rootFolder: string; id: string }): Promise<KeyFile[]> {
    try {
      const propertyFiles = await this.metadataSearchService.searchByProperty('key', 'true', {
        path: workspace.rootFolder,
        limit: 20
      });

      return propertyFiles.map(file => ({
        path: file.path,
        name: file.name || file.path.split('/').pop() || file.path,
        type: 'property' as const,
        priority: 10, // High priority for explicitly marked files
        reason: 'Marked as key file in frontmatter'
      }));
    } catch (error) {
      console.warn('Error searching for key files by property:', error);
      return [];
    }
  }

  /**
   * Get key files by matching common patterns
   */
  private async getKeyFilesByPattern(workspace: { rootFolder: string; id: string }): Promise<KeyFile[]> {
    const keyFiles: KeyFile[] = [];
    const normalizedWorkspaceRoot = sanitizePath(workspace.rootFolder);

    try {
      // Get all files in the workspace
      const allFiles = this.app.vault.getAllLoadedFiles();
      const workspaceFiles = allFiles.filter(file => {
        const normalizedPath = sanitizePath(file.path);
        return normalizedPath.startsWith(normalizedWorkspaceRoot) && 'extension' in file;
      });

      // Check each file against patterns
      for (const file of workspaceFiles) {
        const fileName = file.name.toLowerCase();
        const filePath = file.path.toLowerCase();

        for (const { pattern, priority, reason } of this.commonKeyFilePatterns) {
          if (pattern.test(fileName) || pattern.test(filePath)) {
            keyFiles.push({
              path: file.path,
              name: file.name,
              type: 'pattern',
              priority,
              reason
            });
            break; // Only match first pattern to avoid duplicates
          }
        }
      }
    } catch (error) {
      console.error('Error finding key files by pattern:', error);
    }

    return keyFiles;
  }

  /**
   * Deduplicate and sort key files by priority
   */
  private deduplicateAndSort(keyFiles: KeyFile[]): KeyFile[] {
    const fileMap = new Map<string, KeyFile>();

    // Keep highest priority version of each file
    for (const file of keyFiles) {
      const existing = fileMap.get(file.path);
      if (!existing || file.priority > existing.priority) {
        fileMap.set(file.path, file);
      }
    }

    // Sort by priority (highest first), then by name
    return Array.from(fileMap.values())
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Get key files by analyzing file content and structure
   */
  async getKeyFilesByContent(workspace: { rootFolder: string; id: string }): Promise<KeyFile[]> {
    const keyFiles: KeyFile[] = [];
    const normalizedWorkspaceRoot = sanitizePath(workspace.rootFolder);

    try {
      // Get all markdown files in the workspace
      const allFiles = this.app.vault.getAllLoadedFiles();
      const markdownFiles = allFiles.filter(file => {
        const normalizedPath = sanitizePath(file.path);
        return normalizedPath.startsWith(normalizedWorkspaceRoot) && 
               'extension' in file && 
               (file as any).extension === 'md';
      });

      // Analyze each file
      for (const file of markdownFiles) {
        try {
          const content = await this.app.vault.adapter.read(file.path);
          const analysis = this.analyzeFileContent(content, file.name);
          
          if (analysis.isKeyFile) {
            keyFiles.push({
              path: file.path,
              name: file.name,
              type: 'manual',
              priority: analysis.priority,
              reason: analysis.reason
            });
          }
        } catch (error) {
          console.warn(`Error analyzing content of ${file.path}:`, error);
        }
      }
    } catch (error) {
      console.error('Error analyzing files by content:', error);
    }

    return keyFiles;
  }

  /**
   * Analyze file content to determine if it's a key file
   */
  private analyzeFileContent(content: string, fileName: string): {
    isKeyFile: boolean;
    priority: number;
    reason: string;
  } {
    const lines = content.split('\n');
    const firstFewLines = lines.slice(0, 10).join('\n').toLowerCase();
    
    // Check for key file indicators
    const indicators = [
      { pattern: /^#\s*(table\s+of\s+contents|toc)/i, priority: 8, reason: 'Contains table of contents' },
      { pattern: /^#\s*(overview|summary|introduction)/i, priority: 7, reason: 'Overview/summary document' },
      { pattern: /\[\[.*\]\].*\[\[.*\]\]/g, priority: 6, reason: 'High link density (hub document)' },
      { pattern: /^-\s+\[\[/gm, priority: 6, reason: 'List of links (index document)' },
      { pattern: /^#\s*(getting\s+started|quickstart)/i, priority: 5, reason: 'Getting started guide' },
      { pattern: /^#\s*(readme|read\s+me)/i, priority: 9, reason: 'README document' }
    ];

    for (const indicator of indicators) {
      if (indicator.pattern.test(firstFewLines) || indicator.pattern.test(content)) {
        return {
          isKeyFile: true,
          priority: indicator.priority,
          reason: indicator.reason
        };
      }
    }

    // Check link density
    const linkMatches = content.match(/\[\[.*?\]\]/g) || [];
    const linkDensity = linkMatches.length / Math.max(lines.length, 1);
    
    if (linkDensity > 0.1) { // More than 10% of lines contain links
      return {
        isKeyFile: true,
        priority: 6,
        reason: `High link density (${linkMatches.length} links)`
      };
    }

    return {
      isKeyFile: false,
      priority: 0,
      reason: ''
    };
  }

  /**
   * Get key files with content preview
   */
  async getKeyFilesWithPreview(
    workspace: { rootFolder: string; id: string },
    previewLength: number = 200
  ): Promise<Array<KeyFile & { preview?: string }>> {
    const keyFiles = await this.getKeyFilesDetailed(workspace);
    
    const filesWithPreview = await Promise.all(
      keyFiles.map(async (file) => {
        try {
          if (file.path.endsWith('.md')) {
            const content = await this.app.vault.adapter.read(file.path);
            const preview = content.substring(0, previewLength);
            
            return {
              ...file,
              preview: preview + (content.length > previewLength ? '...' : '')
            };
          }
          
          return file;
        } catch (error) {
          console.warn(`Error getting preview for ${file.path}:`, error);
          return file;
        }
      })
    );

    return filesWithPreview;
  }

  /**
   * Validate that key files exist and are accessible
   */
  async validateKeyFiles(keyFiles: string[]): Promise<{
    valid: string[];
    invalid: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    const valid: string[] = [];
    const invalid: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const filePath of keyFiles) {
      try {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file) {
          valid.push(filePath);
        } else {
          invalid.push(filePath);
          errors.push({ path: filePath, error: 'File not found' });
        }
      } catch (error) {
        invalid.push(filePath);
        errors.push({ 
          path: filePath, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return { valid, invalid, errors };
  }
}