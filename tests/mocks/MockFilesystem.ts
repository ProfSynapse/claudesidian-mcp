/**
 * MockFilesystem - In-memory filesystem simulation for testing
 * Supports all filesystem operations needed by PersistenceManager
 * Provides comprehensive debugging and failure simulation capabilities
 */

export interface MockStats {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}

export interface MockDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Mock filesystem implementation for testing persistence services
 */
export class MockFilesystem {
  private files: Map<string, {
    content: string | Buffer;
    isDirectory: boolean;
    stats: {
      size: number;
      mtime: Date;
      ctime: Date;
    };
  }> = new Map();

  private operations: Array<{
    timestamp: number;
    operation: string;
    path: string;
    success: boolean;
    error?: string;
  }> = [];

  private failureConfig: {
    failOnRead?: boolean;
    failOnWrite?: boolean;
    failOnMkdir?: boolean;
    failOnStat?: boolean;
    simulateNoSpace?: boolean;
  } = {};

  constructor() {
    // Create root directory
    this.files.set('/', {
      content: '',
      isDirectory: true,
      stats: {
        size: 0,
        mtime: new Date(),
        ctime: new Date()
      }
    });
  }

  /**
   * Check if file/directory exists
   */
  existsSync(path: string): boolean {
    const exists = this.files.has(this.normalizePath(path));
    this.recordOperation('existsSync', path, true);
    return exists;
  }

  /**
   * Create directory recursively
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const normalizedPath = this.normalizePath(path);
    
    if (this.failureConfig.failOnMkdir) {
      this.recordOperation('mkdirSync', path, false, 'Simulated mkdir failure');
      throw new Error(`EACCES: permission denied, mkdir '${path}'`);
    }

    if (options?.recursive) {
      // Create all parent directories
      const parts = normalizedPath.split('/').filter(Boolean);
      let currentPath = '';
      
      for (const part of parts) {
        currentPath += '/' + part;
        if (!this.files.has(currentPath)) {
          this.files.set(currentPath, {
            content: '',
            isDirectory: true,
            stats: {
              size: 0,
              mtime: new Date(),
              ctime: new Date()
            }
          });
        }
      }
    } else {
      // Check if parent directory exists
      const parentPath = this.getParentPath(normalizedPath);
      if (parentPath !== normalizedPath && !this.existsSync(parentPath)) {
        this.recordOperation('mkdirSync', path, false, 'Parent directory does not exist');
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }

      this.files.set(normalizedPath, {
        content: '',
        isDirectory: true,
        stats: {
          size: 0,
          mtime: new Date(),
          ctime: new Date()
        }
      });
    }

    this.recordOperation('mkdirSync', path, true);
  }

  /**
   * Write file
   */
  writeFileSync(path: string, data: string | Buffer): void {
    const normalizedPath = this.normalizePath(path);
    
    if (this.failureConfig.failOnWrite) {
      this.recordOperation('writeFileSync', path, false, 'Simulated write failure');
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }

    if (this.failureConfig.simulateNoSpace) {
      this.recordOperation('writeFileSync', path, false, 'No space left on device');
      throw new Error(`ENOSPC: no space left on device, write '${path}'`);
    }

    // Ensure parent directory exists
    const parentPath = this.getParentPath(normalizedPath);
    if (!this.existsSync(parentPath)) {
      this.recordOperation('writeFileSync', path, false, 'Parent directory does not exist');
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    const content = typeof data === 'string' ? data : data;
    const now = new Date();
    
    this.files.set(normalizedPath, {
      content,
      isDirectory: false,
      stats: {
        size: typeof content === 'string' ? content.length : content.length,
        mtime: now,
        ctime: this.files.get(normalizedPath)?.stats.ctime || now
      }
    });

    this.recordOperation('writeFileSync', path, true);
  }

  /**
   * Read file
   */
  readFileSync(path: string, encoding?: string): string | Buffer {
    const normalizedPath = this.normalizePath(path);
    
    if (this.failureConfig.failOnRead) {
      this.recordOperation('readFileSync', path, false, 'Simulated read failure');
      throw new Error(`EACCES: permission denied, open '${path}'`);
    }

    const file = this.files.get(normalizedPath);
    if (!file) {
      this.recordOperation('readFileSync', path, false, 'File not found');
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    if (file.isDirectory) {
      this.recordOperation('readFileSync', path, false, 'Path is a directory');
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }

    this.recordOperation('readFileSync', path, true);
    
    if (encoding && typeof file.content === 'string') {
      return file.content;
    }
    
    return file.content;
  }

  /**
   * Rename/move file
   */
  renameSync(oldPath: string, newPath: string): void {
    const oldNormalizedPath = this.normalizePath(oldPath);
    const newNormalizedPath = this.normalizePath(newPath);
    
    const file = this.files.get(oldNormalizedPath);
    if (!file) {
      this.recordOperation('renameSync', `${oldPath} -> ${newPath}`, false, 'Source file not found');
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
    }

    // Ensure new parent directory exists
    const newParentPath = this.getParentPath(newNormalizedPath);
    if (!this.existsSync(newParentPath)) {
      this.recordOperation('renameSync', `${oldPath} -> ${newPath}`, false, 'Destination parent directory does not exist');
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
    }

    // Move file
    this.files.set(newNormalizedPath, {
      ...file,
      stats: {
        ...file.stats,
        mtime: new Date()
      }
    });
    this.files.delete(oldNormalizedPath);

    this.recordOperation('renameSync', `${oldPath} -> ${newPath}`, true);
  }

  /**
   * Delete file
   */
  unlinkSync(path: string): void {
    const normalizedPath = this.normalizePath(path);
    
    const file = this.files.get(normalizedPath);
    if (!file) {
      this.recordOperation('unlinkSync', path, false, 'File not found');
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }

    if (file.isDirectory) {
      this.recordOperation('unlinkSync', path, false, 'Path is a directory');
      throw new Error(`EPERM: operation not permitted, unlink '${path}'`);
    }

    this.files.delete(normalizedPath);
    this.recordOperation('unlinkSync', path, true);
  }

  /**
   * Read directory contents
   */
  readdirSync(path: string): string[] {
    const normalizedPath = this.normalizePath(path);
    
    const directory = this.files.get(normalizedPath);
    if (!directory) {
      this.recordOperation('readdirSync', path, false, 'Directory not found');
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    if (!directory.isDirectory) {
      this.recordOperation('readdirSync', path, false, 'Path is not a directory');
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    // Find all files/directories that are children of this path
    const children: string[] = [];
    const pathPrefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(pathPrefix) && filePath !== normalizedPath) {
        const relativePath = filePath.substring(pathPrefix.length);
        // Only include direct children (not nested subdirectories)
        if (!relativePath.includes('/')) {
          children.push(relativePath);
        }
      }
    }

    this.recordOperation('readdirSync', path, true);
    return children.sort();
  }

  /**
   * Get file/directory stats
   */
  statSync(path: string): MockStats {
    const normalizedPath = this.normalizePath(path);
    
    if (this.failureConfig.failOnStat) {
      this.recordOperation('statSync', path, false, 'Simulated stat failure');
      throw new Error(`EACCES: permission denied, stat '${path}'`);
    }

    const file = this.files.get(normalizedPath);
    if (!file) {
      this.recordOperation('statSync', path, false, 'File not found');
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    this.recordOperation('statSync', path, true);
    
    return {
      isDirectory: () => file.isDirectory,
      isFile: () => !file.isDirectory,
      size: file.stats.size,
      mtime: file.stats.mtime,
      ctime: file.stats.ctime
    };
  }

  /**
   * Remove directory
   */
  rmdirSync(path: string): void {
    const normalizedPath = this.normalizePath(path);
    
    const directory = this.files.get(normalizedPath);
    if (!directory) {
      this.recordOperation('rmdirSync', path, false, 'Directory not found');
      throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
    }

    if (!directory.isDirectory) {
      this.recordOperation('rmdirSync', path, false, 'Path is not a directory');
      throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
    }

    // Check if directory is empty
    const children = this.readdirSync(path);
    if (children.length > 0) {
      this.recordOperation('rmdirSync', path, false, 'Directory not empty');
      throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
    }

    this.files.delete(normalizedPath);
    this.recordOperation('rmdirSync', path, true);
  }

  // === Testing Utilities ===

  /**
   * Configure failure simulation
   */
  setFailureMode(config: typeof this.failureConfig): void {
    this.failureConfig = { ...config };
  }

  /**
   * Get all recorded operations for debugging
   */
  getOperationHistory(): typeof this.operations {
    return [...this.operations];
  }

  /**
   * Get current filesystem state
   */
  getFilesystemState(): Record<string, any> {
    const state: Record<string, any> = {};
    
    for (const [path, file] of this.files.entries()) {
      state[path] = {
        isDirectory: file.isDirectory,
        size: file.stats.size,
        content: file.isDirectory ? '<directory>' : file.content,
        mtime: file.stats.mtime,
        ctime: file.stats.ctime
      };
    }
    
    return state;
  }

  /**
   * Reset filesystem and operations
   */
  reset(): void {
    this.files.clear();
    this.operations.length = 0;
    this.failureConfig = {};
    
    // Recreate root directory
    this.files.set('/', {
      content: '',
      isDirectory: true,
      stats: {
        size: 0,
        mtime: new Date(),
        ctime: new Date()
      }
    });
  }

  /**
   * Create directory structure from object
   */
  createStructure(structure: Record<string, string | Record<string, any>>): void {
    for (const [path, content] of Object.entries(structure)) {
      if (typeof content === 'string') {
        // File
        this.mkdirSync(this.getParentPath(path), { recursive: true });
        this.writeFileSync(path, content);
      } else {
        // Directory
        this.mkdirSync(path, { recursive: true });
        if (content) {
          const nestedStructure: Record<string, any> = {};
          for (const [nestedPath, nestedContent] of Object.entries(content)) {
            nestedStructure[`${path}/${nestedPath}`] = nestedContent;
          }
          this.createStructure(nestedStructure);
        }
      }
    }
  }

  // === Private Methods ===

  private normalizePath(path: string): string {
    // Convert to absolute path and normalize
    let normalized = path.startsWith('/') ? path : `/${path}`;
    
    // Remove duplicate slashes and resolve . and ..
    const parts = normalized.split('/').filter(Boolean);
    const resolved: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }
    
    return resolved.length === 0 ? '/' : '/' + resolved.join('/');
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === '/') return '/';
    
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex <= 0 ? '/' : normalized.substring(0, lastSlashIndex);
  }

  private recordOperation(
    operation: string,
    path: string,
    success: boolean,
    error?: string
  ): void {
    this.operations.push({
      timestamp: Date.now(),
      operation,
      path,
      success,
      error
    });
  }
}