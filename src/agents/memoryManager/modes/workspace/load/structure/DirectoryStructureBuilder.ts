/**
 * DirectoryStructureBuilder - Builds directory structure representations
 * Follows Single Responsibility Principle by focusing only on directory structure generation
 */

import { App } from 'obsidian';
import { DirectoryTreeBuilder } from '../../../../../../utils/directoryTreeUtils';
import { sanitizePath } from '../../../../../../utils/pathUtils';

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DirectoryNode[];
  size?: number;
  modified?: number;
  extension?: string;
}

export interface StructureOptions {
  maxDepth?: number;
  includeFiles?: boolean;
  includeFolders?: boolean;
  excludePatterns?: RegExp[];
  sortBy?: 'name' | 'modified' | 'size';
  sortOrder?: 'asc' | 'desc';
  fileLimit?: number;
}

/**
 * Service responsible for building directory structure representations
 * Follows SRP by focusing only on directory structure generation
 */
export class DirectoryStructureBuilder {
  constructor(
    private app: App,
    private directoryTreeBuilder: DirectoryTreeBuilder
  ) {}

  /**
   * Generate directory structure for workspace
   */
  async generateDirectoryStructure(
    workspace: { rootFolder: string; id: string },
    options: StructureOptions = {}
  ): Promise<string> {
    const {
      maxDepth = 3,
      includeFiles = true,
      includeFolders = true,
      excludePatterns = [],
      sortBy = 'name',
      sortOrder = 'asc',
      fileLimit = 50
    } = options;

    try {
      // Build directory tree
      const rootNode = await this.buildDirectoryTree(workspace.rootFolder, {
        maxDepth,
        includeFiles,
        includeFolders,
        excludePatterns,
        sortBy,
        sortOrder,
        fileLimit
      });

      // Convert to string representation
      return this.directoryNodeToString(rootNode, 0, maxDepth);
    } catch (error) {
      console.error('Error generating directory structure:', error);
      return `Error generating directory structure: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Build directory tree structure
   */
  private async buildDirectoryTree(
    rootPath: string,
    options: StructureOptions
  ): Promise<DirectoryNode> {
    const {
      maxDepth = 3,
      includeFiles = true,
      includeFolders = true,
      excludePatterns = [],
      sortBy = 'name',
      sortOrder = 'asc',
      fileLimit = 50
    } = options;

    const normalizedRootPath = sanitizePath(rootPath);
    const rootNode: DirectoryNode = {
      name: rootPath === '/' ? 'Root' : rootPath.split('/').pop() || rootPath,
      path: rootPath,
      type: 'folder',
      children: []
    };

    await this.buildDirectoryTreeRecursive(
      rootNode,
      normalizedRootPath,
      0,
      maxDepth,
      {
        includeFiles,
        includeFolders,
        excludePatterns,
        sortBy,
        sortOrder,
        fileLimit
      }
    );

    return rootNode;
  }

  /**
   * Recursively build directory tree
   */
  private async buildDirectoryTreeRecursive(
    parentNode: DirectoryNode,
    currentPath: string,
    currentDepth: number,
    maxDepth: number,
    options: Required<Omit<StructureOptions, 'maxDepth'>>
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const allFiles = this.app.vault.getAllLoadedFiles();
      const childItems = allFiles.filter(file => {
        const normalizedPath = sanitizePath(file.path);
        const pathParts = normalizedPath.split('/');
        const currentPathParts = currentPath.split('/');
        
        // Check if this file is a direct child of current path
        if (pathParts.length !== currentPathParts.length + 1) {
          return false;
        }

        // Check if path starts with current path
        return pathParts.slice(0, -1).join('/') === currentPath;
      });

      // Separate files and folders
      const files = childItems.filter(item => 'extension' in item);
      const folders = new Set<string>();

      // Find folders by looking at file paths
      for (const file of allFiles) {
        const normalizedPath = sanitizePath(file.path);
        const pathParts = normalizedPath.split('/');
        const currentPathParts = currentPath.split('/');

        if (pathParts.length > currentPathParts.length + 1) {
          const folderPath = pathParts.slice(0, currentPathParts.length + 1).join('/');
          if (folderPath.startsWith(currentPath)) {
            folders.add(folderPath);
          }
        }
      }

      const children: DirectoryNode[] = [];

      // Add folders
      if (options.includeFolders) {
        for (const folderPath of folders) {
          if (options.excludePatterns.some(pattern => pattern.test(folderPath))) {
            continue;
          }

          const folderName = folderPath.split('/').pop() || folderPath;
          const folderNode: DirectoryNode = {
            name: folderName,
            path: folderPath,
            type: 'folder',
            children: []
          };

          // Recursively build folder contents
          await this.buildDirectoryTreeRecursive(
            folderNode,
            folderPath,
            currentDepth + 1,
            maxDepth,
            options
          );

          children.push(folderNode);
        }
      }

      // Add files
      if (options.includeFiles) {
        let fileCount = 0;
        for (const file of files) {
          if (fileCount >= options.fileLimit) {
            break;
          }

          if (options.excludePatterns.some(pattern => pattern.test(file.path))) {
            continue;
          }

          try {
            const stat = await this.app.vault.adapter.stat(file.path);
            const fileNode: DirectoryNode = {
              name: file.name,
              path: file.path,
              type: 'file',
              size: stat?.size,
              modified: stat?.mtime,
              extension: 'extension' in file ? (file as any).extension : undefined
            };

            children.push(fileNode);
            fileCount++;
          } catch (error) {
            console.warn(`Error getting stats for ${file.path}:`, error);
            // Still include the file without stats
            children.push({
              name: file.name,
              path: file.path,
              type: 'file',
              extension: 'extension' in file ? (file as any).extension : undefined
            });
            fileCount++;
          }
        }
      }

      // Sort children
      this.sortDirectoryNodes(children, options.sortBy, options.sortOrder);

      parentNode.children = children;
    } catch (error) {
      console.error(`Error building directory tree for ${currentPath}:`, error);
    }
  }

  /**
   * Sort directory nodes
   */
  private sortDirectoryNodes(
    nodes: DirectoryNode[],
    sortBy: 'name' | 'modified' | 'size',
    sortOrder: 'asc' | 'desc'
  ): void {
    nodes.sort((a, b) => {
      // Always put folders first
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }

      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'modified':
          comparison = (a.modified || 0) - (b.modified || 0);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Convert directory node to string representation
   */
  private directoryNodeToString(
    node: DirectoryNode,
    depth: number,
    maxDepth: number
  ): string {
    const indent = '  '.repeat(depth);
    const icon = node.type === 'folder' ? '📁' : '📄';
    const sizeInfo = node.size ? ` (${this.formatFileSize(node.size)})` : '';
    const modifiedInfo = node.modified ? ` - ${new Date(node.modified).toLocaleDateString()}` : '';
    
    let result = `${indent}${icon} ${node.name}${sizeInfo}${modifiedInfo}\n`;

    if (node.children && depth < maxDepth) {
      for (const child of node.children) {
        result += this.directoryNodeToString(child, depth + 1, maxDepth);
      }
    }

    return result;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate compact directory structure
   */
  async generateCompactStructure(
    workspace: { rootFolder: string; id: string },
    options: StructureOptions = {}
  ): Promise<string> {
    const {
      maxDepth = 2,
      includeFiles = false,
      includeFolders = true,
      excludePatterns = [],
      sortBy = 'name',
      sortOrder = 'asc'
    } = options;

    try {
      const rootNode = await this.buildDirectoryTree(workspace.rootFolder, {
        maxDepth,
        includeFiles,
        includeFolders,
        excludePatterns,
        sortBy,
        sortOrder,
        fileLimit: 0
      });

      return this.directoryNodeToCompactString(rootNode, 0, maxDepth);
    } catch (error) {
      console.error('Error generating compact structure:', error);
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Convert directory node to compact string representation
   */
  private directoryNodeToCompactString(
    node: DirectoryNode,
    depth: number,
    maxDepth: number
  ): string {
    const indent = '  '.repeat(depth);
    let result = `${indent}${node.name}/\n`;

    if (node.children && depth < maxDepth) {
      const folders = node.children.filter(child => child.type === 'folder');
      const fileCount = node.children.filter(child => child.type === 'file').length;

      for (const folder of folders) {
        result += this.directoryNodeToCompactString(folder, depth + 1, maxDepth);
      }

      if (fileCount > 0) {
        result += `${indent}  [${fileCount} files]\n`;
      }
    }

    return result;
  }

  /**
   * Generate directory statistics
   */
  async generateDirectoryStats(
    workspace: { rootFolder: string; id: string }
  ): Promise<{
    totalFiles: number;
    totalFolders: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    lastModified: number;
  }> {
    const stats = {
      totalFiles: 0,
      totalFolders: 0,
      totalSize: 0,
      fileTypes: {} as Record<string, number>,
      lastModified: 0
    };

    try {
      const normalizedRootPath = sanitizePath(workspace.rootFolder);
      const allFiles = this.app.vault.getAllLoadedFiles();
      const workspaceFiles = allFiles.filter(file => {
        const normalizedPath = sanitizePath(file.path);
        return normalizedPath.startsWith(normalizedRootPath);
      });

      const folders = new Set<string>();

      for (const file of workspaceFiles) {
        if ('extension' in file) {
          stats.totalFiles++;
          const extension = (file as any).extension;
          stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;

          try {
            const stat = await this.app.vault.adapter.stat(file.path);
            if (stat) {
              stats.totalSize += stat.size || 0;
              stats.lastModified = Math.max(stats.lastModified, stat.mtime || 0);
            }
          } catch (error) {
            console.warn(`Error getting stats for ${file.path}:`, error);
          }
        }

        // Count folders
        const pathParts = sanitizePath(file.path).split('/');
        for (let i = 1; i < pathParts.length; i++) {
          const folderPath = pathParts.slice(0, i).join('/');
          if (folderPath.startsWith(normalizedRootPath)) {
            folders.add(folderPath);
          }
        }
      }

      stats.totalFolders = folders.size;
    } catch (error) {
      console.error('Error generating directory stats:', error);
    }

    return stats;
  }
}