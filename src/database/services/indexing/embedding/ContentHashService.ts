/**
 * ContentHashService - Handles content hashing and change detection
 * Follows Single Responsibility Principle by focusing only on content hashing operations
 * 
 * Imports:
 * - crypto: Node.js crypto module for MD5 hash generation
 * - Plugin, TFile: Obsidian API types for plugin integration and file handling
 * - ProcessedFilesStateManager: State management for file processing tracking
 * - FileUtils: Common file validation and path normalization utilities
 * - AdaptiveBulkHashService: Bulk hash comparison optimization (lazy imported)
 */

import * as crypto from 'crypto';
import { Plugin, TFile } from 'obsidian';
import { ProcessedFilesStateManager } from '../state/ProcessedFilesStateManager';
import { FileUtils } from '../../../utils/FileUtils';

export class ContentHashService {
  private plugin: Plugin;
  private stateManager: ProcessedFilesStateManager;

  constructor(plugin: Plugin, stateManager: ProcessedFilesStateManager) {
    this.plugin = plugin;
    this.stateManager = stateManager;
  }

  /**
   * Generate hash for given content
   * @param content Content to hash
   * @returns Content hash string
   */
  hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check if a file needs re-embedding by comparing content hash
   * @param filePath Path to the file
   * @param vectorStore Vector store instance
   * @returns Promise resolving to true if file needs embedding
   */
  async checkIfFileNeedsEmbedding(filePath: string, vectorStore: any): Promise<boolean> {
    try {
      // Read current file content and generate hash
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!FileUtils.isValidFile(file)) {
        return false; // Skip if file doesn't exist or is a folder
      }

      // Normalize the file path to match database format (forward slashes)
      const normalizedPath = FileUtils.normalizePath(filePath);

      // STATE-BASED TRACKING: Use existing ProcessedFilesStateManager instead of ChromaDB queries
      // Benefits: 0MB memory overhead vs 1GB+ ChromaDB collection loading
      // Architecture: Trust existing state management system we already built
      
      const content = await this.plugin.app.vault.read(file as any);
      const currentHash = this.hashContent(content);
      
      // Check our existing state manager (already implemented and working)
      if (this.stateManager.isFileProcessed(normalizedPath, currentHash)) {
        console.log(`[ContentHashService] File ${normalizedPath} found in processed state with matching hash`);
        return false; // Already processed this exact version
      }
      
      console.log(`[ContentHashService] File ${normalizedPath} not in processed state or hash changed - needs embedding`);
      return true;
    } catch (error) {
      console.error(`[ContentHashService] Error checking if file needs embedding for ${filePath}:`, error);
      return true; // If we can't determine, assume it needs embedding
    }
  }


  /**
   * Get content hash for a file
   * @param filePath Path to the file
   * @returns Promise resolving to content hash or null if file not found
   */
  async getFileContentHash(filePath: string): Promise<string | null> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!FileUtils.isValidFile(file)) {
        return null;
      }

      const content = await this.plugin.app.vault.read(file as TFile);
      return this.hashContent(content);
    } catch (error) {
      console.error(`[ContentHashService] Error getting content hash for ${filePath}:`, error);
      return null;
    }
  }


  /**
   * Mark file as successfully processed
   * @param filePath Path to the file
   * @param contentHash Content hash of the file
   * @param provider Embedding provider used
   * @param vectorStoreId Vector store ID
   */
  async markFileProcessed(filePath: string, contentHash: string, provider: string, vectorStoreId: string = 'default'): Promise<void> {
    // ContentHashService marking file processed
    this.stateManager.markFileProcessed(filePath, contentHash, provider, vectorStoreId);
    await this.stateManager.saveState();
  }

  /**
   * Mark file as failed processing
   * @param filePath Path to the file
   * @param contentHash Content hash of the file
   * @param errorMessage Error message
   */
  async markFileFailed(filePath: string, contentHash: string, errorMessage: string): Promise<void> {
    // ContentHashService marking file failed
    this.stateManager.markFileFailed(filePath, contentHash, errorMessage);
    await this.stateManager.saveState();
  }

  /**
   * Remove file from processed state
   * @param filePath Path to the file
   */
  async removeFileFromState(filePath: string): Promise<void> {
    this.stateManager.removeFile(filePath);
    await this.stateManager.saveState();
  }

  /**
   * Check multiple files need embedding using bulk comparison optimization
   * @param filePaths Array of file paths to check
   * @param vectorStore Vector store instance
   * @returns Promise resolving to array of bulk hash results
   */
  async checkBulkFilesNeedEmbedding(filePaths: string[], vectorStore: any): Promise<Array<{
    filePath: string;
    needsEmbedding: boolean;
    currentHash?: string;
    storedHash?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
  }>> {
    // Lazy import to avoid circular dependency
    const { AdaptiveBulkHashService } = await import('./AdaptiveBulkHashService');
    
    try {
      const bulkHashService = new AdaptiveBulkHashService(this.plugin, this, this.stateManager);
      return await bulkHashService.processBulkComparison(filePaths, vectorStore);
    } catch (error) {
      console.error(`[ContentHashService] Error in bulk comparison:`, error);
      
      // Fallback to individual processing
      const results = [];
      for (const filePath of filePaths) {
        try {
          const needsEmbedding = await this.checkIfFileNeedsEmbedding(filePath, vectorStore);
          results.push({
            filePath: FileUtils.normalizePath(filePath),
            needsEmbedding,
            reason: 'Individual processing (fallback from bulk error)'
          });
        } catch (individualError) {
          console.error(`[ContentHashService] Error in individual fallback for ${filePath}:`, individualError);
          results.push({
            filePath: FileUtils.normalizePath(filePath),
            needsEmbedding: true, // Assume needs embedding on error
            error: individualError instanceof Error ? individualError.message : String(individualError),
            reason: 'Error during individual processing'
          });
        }
      }
      
      return results;
    }
  }
}