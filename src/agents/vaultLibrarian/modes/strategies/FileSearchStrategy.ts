import { Plugin, TFile } from 'obsidian';
import { prepareFuzzySearch } from 'obsidian';
import { UniversalSearchResultItem } from '../../types';

/**
 * Strategy for searching file and folder names using fuzzy matching
 */
export class FileSearchStrategy {
  constructor(private plugin: Plugin) {}

  /**
   * Search for files by name using fuzzy matching
   */
  async searchFiles(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    let filteredFiles = files;

    // Apply path filtering if specified
    if (options.paths && options.paths.length > 0) {
      filteredFiles = files.filter(file => 
        options.paths!.some(path => file.path.startsWith(path))
      );
    }

    // Prepare fuzzy search
    const fuzzySearch = prepareFuzzySearch(query);
    const results: UniversalSearchResultItem[] = [];

    for (const file of filteredFiles) {
      const fileName = file.name;
      const filePath = file.path;
      
      // Search both filename and full path
      const nameMatch = fuzzySearch(fileName);
      const pathMatch = fuzzySearch(filePath);
      
      // Use the better of the two matches
      const bestMatch = nameMatch && pathMatch ? 
        (nameMatch.score > pathMatch.score ? nameMatch : pathMatch) :
        (nameMatch || pathMatch);

      if (bestMatch) {
        results.push({
          id: file.path,
          title: this.getFileTitle(file.path),
          snippet: file.path,
          score: bestMatch.score,
          searchMethod: 'fuzzy' as const,
          metadata: {
            filePath: file.path,
            fileSize: file.stat.size,
            modified: file.stat.mtime,
            matches: bestMatch.matches
          },
          content: options.includeContent ? await this.getFileContent(file) : undefined
        });
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit || 10);
  }

  /**
   * Search for folders by name using fuzzy matching
   */
  async searchFolders(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    const allFolders = this.getAllFolderPaths();
    let filteredFolders = allFolders;

    // Apply path filtering if specified
    if (options.paths && options.paths.length > 0) {
      filteredFolders = allFolders.filter(folderPath => 
        options.paths!.some(path => folderPath.startsWith(path))
      );
    }

    // Prepare fuzzy search
    const fuzzySearch = prepareFuzzySearch(query);
    const results: UniversalSearchResultItem[] = [];

    for (const folderPath of filteredFolders) {
      const folderName = folderPath.split('/').pop() || folderPath;
      
      // Search both folder name and full path
      const nameMatch = fuzzySearch(folderName);
      const pathMatch = fuzzySearch(folderPath);
      
      // Use the better of the two matches
      const bestMatch = nameMatch && pathMatch ? 
        (nameMatch.score > pathMatch.score ? nameMatch : pathMatch) :
        (nameMatch || pathMatch);

      if (bestMatch) {
        const fileCount = this.getFileCountInFolder(folderPath);
        
        results.push({
          id: folderPath,
          title: folderName,
          snippet: `${folderPath} (${fileCount} files)`,
          score: bestMatch.score,
          searchMethod: 'fuzzy' as const,
          metadata: {
            folderPath: folderPath,
            fileCount: fileCount,
            matches: bestMatch.matches
          }
        });
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit || 10);
  }

  /**
   * Get all folder paths in the vault
   */
  private getAllFolderPaths(): string[] {
    const folders = new Set<string>();
    
    // Add root folder
    folders.add('/');
    
    // Extract folder paths from all files
    const files = this.plugin.app.vault.getAllLoadedFiles();
    for (const file of files) {
      if (file.path.includes('/')) {
        const pathParts = file.path.split('/');
        pathParts.pop(); // Remove filename
        
        // Add all parent folder paths
        let currentPath = '';
        for (const part of pathParts) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          folders.add(currentPath);
        }
      }
    }
    
    return Array.from(folders).filter(path => path !== '/');
  }

  /**
   * Get number of files in a folder
   */
  private getFileCountInFolder(folderPath: string): number {
    const files = this.plugin.app.vault.getMarkdownFiles();
    return files.filter(file => {
      const fileFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
      return fileFolderPath === folderPath || file.path.startsWith(folderPath + '/');
    }).length;
  }

  /**
   * Extract file title from path
   */
  private getFileTitle(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/\\.md$/, '');
  }

  /**
   * Get file content safely
   */
  private async getFileContent(file: TFile): Promise<string | undefined> {
    try {
      return await this.plugin.app.vault.cachedRead(file);
    } catch (error) {
      console.warn(`Failed to read file ${file.path}:`, error);
      return undefined;
    }
  }
}