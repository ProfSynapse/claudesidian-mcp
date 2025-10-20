// Location: src/services/storage/FileSystemService.ts
// File system utility for managing conversations/ and workspaces/ directories
// Used by: IndexManager, ConversationService, WorkspaceService, DataMigrationService
// Dependencies: Obsidian Plugin API for file system operations

import { normalizePath, Plugin } from 'obsidian';
import { IndividualConversation, IndividualWorkspace, ConversationIndex, WorkspaceIndex } from '../../types/storage/StorageTypes';

export class FileSystemService {
  private plugin: Plugin;
  private conversationsPath: string;
  private workspacesPath: string;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    // Store in vault root for Obsidian Sync compatibility
    this.conversationsPath = normalizePath('.conversations');
    this.workspacesPath = normalizePath('.workspaces');
  }

  /**
   * Ensure conversations/ directory exists
   */
  async ensureConversationsDirectory(): Promise<void> {
    console.log('[FileSystemService] 🔵 Ensuring conversations directory:', this.conversationsPath);
    try {
      await this.plugin.app.vault.adapter.mkdir(this.conversationsPath);
      console.log('[FileSystemService] ✅ Conversations directory created');
    } catch (error) {
      console.log('[FileSystemService] ℹ️ Conversations directory already exists');
    }
  }

  /**
   * Ensure workspaces/ directory exists
   */
  async ensureWorkspacesDirectory(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir(this.workspacesPath);
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Write individual conversation file
   */
  async writeConversation(id: string, data: IndividualConversation): Promise<void> {
    await this.ensureConversationsDirectory();
    const filePath = normalizePath(`${this.conversationsPath}/${id}.json`);
    console.log('[FileSystemService] 🔵 Writing conversation to:', filePath);
    console.log('[FileSystemService] 🔵 Conversation data size:', JSON.stringify(data).length, 'bytes');
    const jsonString = JSON.stringify(data, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
    console.log('[FileSystemService] ✅ Conversation file written successfully');

    // Verify the file was written
    const exists = await this.plugin.app.vault.adapter.exists(filePath);
    console.log('[FileSystemService] 🔵 File exists after write:', exists);
  }

  /**
   * Read individual conversation file
   */
  async readConversation(id: string): Promise<IndividualConversation | null> {
    const filePath = normalizePath(`${this.conversationsPath}/${id}.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete individual conversation file
   */
  async deleteConversation(id: string): Promise<void> {
    const filePath = normalizePath(`${this.conversationsPath}/${id}.json`);
    try {
      await this.plugin.app.vault.adapter.remove(filePath);
    } catch (error) {
      console.error(`[FileSystemService] Failed to delete conversation: ${id}`, error);
      throw error;
    }
  }

  /**
   * List all conversation IDs
   */
  async listConversationIds(): Promise<string[]> {
    try {
      const files = await this.plugin.app.vault.adapter.list(this.conversationsPath);
      const conversationIds = files.files
        .filter(file => file.endsWith('.json') && !file.endsWith('index.json'))
        .map(file => {
          const filename = file.split('/').pop() || '';
          return filename.replace('.json', '');
        });
      return conversationIds;
    } catch (error) {
      return [];
    }
  }

  /**
   * Write individual workspace file
   */
  async writeWorkspace(id: string, data: IndividualWorkspace): Promise<void> {
    const filePath = normalizePath(`${this.workspacesPath}/${id}.json`);
    const jsonString = JSON.stringify(data, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
  }

  /**
   * Read individual workspace file
   */
  async readWorkspace(id: string): Promise<IndividualWorkspace | null> {
    const filePath = normalizePath(`${this.workspacesPath}/${id}.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete individual workspace file
   */
  async deleteWorkspace(id: string): Promise<void> {
    const filePath = normalizePath(`${this.workspacesPath}/${id}.json`);
    try {
      await this.plugin.app.vault.adapter.remove(filePath);
    } catch (error) {
      console.error(`[FileSystemService] Failed to delete workspace: ${id}`, error);
      throw error;
    }
  }

  /**
   * List all workspace IDs
   */
  async listWorkspaceIds(): Promise<string[]> {
    try {
      const files = await this.plugin.app.vault.adapter.list(this.workspacesPath);
      const workspaceIds = files.files
        .filter(file => file.endsWith('.json') && !file.endsWith('index.json'))
        .map(file => {
          const filename = file.split('/').pop() || '';
          return filename.replace('.json', '');
        });
      return workspaceIds;
    } catch (error) {
      return [];
    }
  }

  /**
   * Read conversation index file
   */
  async readConversationIndex(): Promise<ConversationIndex | null> {
    const filePath = normalizePath(`${this.conversationsPath}/index.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Write conversation index file
   */
  async writeConversationIndex(index: ConversationIndex): Promise<void> {
    const filePath = normalizePath(`${this.conversationsPath}/index.json`);
    const jsonString = JSON.stringify(index, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
  }

  /**
   * Read workspace index file
   */
  async readWorkspaceIndex(): Promise<WorkspaceIndex | null> {
    const filePath = normalizePath(`${this.workspacesPath}/index.json`);

    try {
      const exists = await this.plugin.app.vault.adapter.exists(filePath);

      if (!exists) {
        return null;
      }

      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);

      return data;
    } catch (error) {
      console.error('[FileSystemService] Error reading workspace index:', error);
      return null;
    }
  }

  /**
   * Write workspace index file
   */
  async writeWorkspaceIndex(index: WorkspaceIndex): Promise<void> {
    const filePath = normalizePath(`${this.workspacesPath}/index.json`);
    const jsonString = JSON.stringify(index, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
  }

  /**
   * Check if conversations directory exists
   */
  async conversationsDirectoryExists(): Promise<boolean> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(this.conversationsPath);
      return exists;
    } catch (error) {
      console.error(`[FileSystemService] Error checking conversations directory:`, error);
      return false;
    }
  }

  /**
   * Check if workspaces directory exists
   */
  async workspacesDirectoryExists(): Promise<boolean> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(this.workspacesPath);
      return exists;
    } catch (error) {
      console.error(`[FileSystemService] Error checking workspaces directory:`, error);
      return false;
    }
  }

  /**
   * Read legacy ChromaDB collection for migration
   */
  async readChromaCollection(collectionName: string): Promise<any[]> {
    const chromaPath = normalizePath(`${this.plugin.manifest.dir}/data/chroma-db/collections/${collectionName}/items.json`);
    try {
      const exists = await this.plugin.app.vault.adapter.exists(chromaPath);

      if (!exists) {
        return [];
      }

      const content = await this.plugin.app.vault.adapter.read(chromaPath);

      const data = JSON.parse(content);
      const items = data.items || [];
      return items;
    } catch (error) {
      console.error(`[FileSystemService] Error reading ChromaDB collection: ${collectionName}`, error);
      return [];
    }
  }

  /**
   * Get conversations directory path
   */
  getConversationsPath(): string {
    return this.conversationsPath;
  }

  /**
   * Get workspaces directory path
   */
  getWorkspacesPath(): string {
    return this.workspacesPath;
  }

  /**
   * Get ChromaDB path for migration detection
   */
  getChromaPath(): string {
    return normalizePath(`${this.plugin.manifest.dir}/data/chroma-db`);
  }
}