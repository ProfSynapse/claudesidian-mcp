/**
 * ContentHashService - Handles content hashing and change detection
 * Follows Single Responsibility Principle by focusing only on content hashing operations
 */

import * as crypto from 'crypto';
import { Plugin, TFile } from 'obsidian';

export class ContentHashService {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
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
      if (!file || 'children' in file) {
        console.log(`[ContentHashService] ${filePath} - file not found or is folder`);
        return false; // Skip if file doesn't exist or is a folder
      }

      const content = await this.plugin.app.vault.read(file as any);
      const currentHash = this.hashContent(content);

      // First check if the collection exists and has items
      const collectionExists = await vectorStore.hasCollection('file_embeddings');
      if (!collectionExists) {
        console.log(`[ContentHashService] ${filePath} - file_embeddings collection does not exist`);
        return true;
      }

      const collectionCount = await vectorStore.count('file_embeddings');

      // Normalize the file path to match database format (forward slashes)
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Query for existing embeddings for this file
      const queryResult = await vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: normalizedPath } },
        nResults: 1, // Just need one to check metadata
        include: ['metadatas']
      });

      // Log result only if useful for debugging
      if (queryResult.ids?.[0]?.length === 0 && collectionCount > 0) {
        console.log(`[ContentHashService] ${filePath} - query found no embeddings despite collection having ${collectionCount} items`);
      }

      // Debug: Let's see what file paths are actually in the database
      if (queryResult.ids?.[0]?.length === 0) {
        // Query a few random items to see what file paths look like
        const sampleQuery = await vectorStore.query('file_embeddings', {
          nResults: 5,
          include: ['metadatas']
        });
        
        const samplePaths = sampleQuery.metadatas?.[0]?.map((m: any) => m.filePath || 'no-filePath').slice(0, 5) || [];
        console.log(`[ContentHashService] ${filePath} - sample stored file paths: ${samplePaths.join(', ')}`);
        console.log(`[ContentHashService] ${filePath} - looking for exact match: "${normalizedPath}" (normalized from "${filePath}")`);
      }

      // If no existing embeddings found, file needs embedding
      if (!queryResult.ids || queryResult.ids.length === 0 || queryResult.ids[0].length === 0) {
        console.log(`[ContentHashService] ${filePath} - no existing embeddings found, needs embedding`);
        return true;
      }

      // Check if we have metadata with content hash
      const metadata = queryResult.metadatas?.[0]?.[0];
      if (!metadata || !metadata.contentHash) {
        console.log(`[ContentHashService] ${filePath} - no content hash in metadata, needs embedding`);
        return true;
      }

      // Compare hashes
      const storedHash = metadata.contentHash;
      const hashMatches = currentHash === storedHash;
      
      console.log(`[ContentHashService] ${filePath} - hash comparison: current=${currentHash.substring(0, 8)}..., stored=${storedHash.substring(0, 8)}..., matches=${hashMatches}`);
      
      return !hashMatches; // Return true if hashes don't match (needs re-embedding)
    } catch (error) {
      console.error(`[ContentHashService] Error checking if file needs embedding for ${filePath}:`, error);
      return true; // If we can't determine, assume it needs embedding
    }
  }

  /**
   * Add content hash to legacy embedding that doesn't have one
   * @param filePath Path to the file
   * @param contentHash Content hash to add
   * @param vectorStore Vector store instance
   * @returns Promise resolving to true if hash was added successfully
   */
  async addContentHashToLegacyEmbedding(filePath: string, contentHash: string, vectorStore: any): Promise<boolean> {
    try {
      // Normalize the file path to match database format
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      // Query for existing embeddings for this file
      const queryResult = await vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: normalizedPath } },
        nResults: 1000, // Get all chunks for this file
        include: ['metadatas']
      });
      
      if (!queryResult.ids || queryResult.ids.length === 0 || queryResult.ids[0].length === 0) {
        console.log(`[ContentHashService] No embeddings found to update for ${filePath}`);
        return false;
      }
      
      // Update all chunks for this file to include the content hash
      const chunkIds = queryResult.ids[0];
      const existingMetadatas = queryResult.metadatas?.[0] || [];
      
      // Create updated metadata array
      const updatedMetadatas = existingMetadatas.map((metadata: any) => ({
        ...metadata,
        contentHash: contentHash
      }));
      
      // Update the embeddings with the new metadata
      await vectorStore.updateItems('file_embeddings', {
        ids: chunkIds,
        metadatas: updatedMetadatas
      });
      
      console.log(`[ContentHashService] Added content hash to ${chunkIds.length} existing chunks for ${filePath}`);
      return true;
    } catch (error) {
      console.error(`[ContentHashService] Error adding content hash to legacy embedding for ${filePath}:`, error);
      return false;
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
      if (!file || 'children' in file) {
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
   * Compare content hashes
   * @param hash1 First hash
   * @param hash2 Second hash
   * @returns True if hashes match
   */
  compareHashes(hash1: string, hash2: string): boolean {
    return hash1 === hash2;
  }

  /**
   * Validate hash format
   * @param hash Hash to validate
   * @returns True if hash appears to be valid MD5
   */
  validateHash(hash: string): boolean {
    return typeof hash === 'string' && hash.length === 32 && /^[a-f0-9]+$/i.test(hash);
  }
}