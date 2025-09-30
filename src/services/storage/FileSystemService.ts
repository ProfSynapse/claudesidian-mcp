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
    this.conversationsPath = normalizePath(`${plugin.manifest.dir}/conversations`);
    this.workspacesPath = normalizePath(`${plugin.manifest.dir}/workspaces`);
  }

  /**
   * Ensure conversations/ directory exists
   */
  async ensureConversationsDirectory(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir(this.conversationsPath);
      console.log(`[FileSystemService] Created conversations directory: ${this.conversationsPath}`);
    } catch (error) {
      // Directory might already exist
      console.log(`[FileSystemService] Conversations directory exists: ${this.conversationsPath}`);
    }
  }

  /**
   * Ensure workspaces/ directory exists
   */
  async ensureWorkspacesDirectory(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir(this.workspacesPath);
      console.log(`[FileSystemService] Created workspaces directory: ${this.workspacesPath}`);
    } catch (error) {
      // Directory might already exist
      console.log(`[FileSystemService] Workspaces directory exists: ${this.workspacesPath}`);
    }
  }

  /**
   * Write individual conversation file
   */
  async writeConversation(id: string, data: IndividualConversation): Promise<void> {
    const filePath = normalizePath(`${this.conversationsPath}/${id}.json`);
    const jsonString = JSON.stringify(data, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
    console.log(`[FileSystemService] Wrote conversation: ${id} (${jsonString.length} chars)`);
  }

  /**
   * Read individual conversation file
   */
  async readConversation(id: string): Promise<IndividualConversation | null> {
    const filePath = normalizePath(`${this.conversationsPath}/${id}.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      console.log(`[FileSystemService] Read conversation: ${id}`);
      return data;
    } catch (error) {
      console.log(`[FileSystemService] Conversation not found: ${id}`);
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
      console.log(`[FileSystemService] Deleted conversation: ${id}`);
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
      console.log(`[FileSystemService] Found ${conversationIds.length} conversations`);
      return conversationIds;
    } catch (error) {
      console.log(`[FileSystemService] No conversations found`);
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
    console.log(`[FileSystemService] Wrote workspace: ${id} (${jsonString.length} chars)`);
  }

  /**
   * Read individual workspace file
   */
  async readWorkspace(id: string): Promise<IndividualWorkspace | null> {
    const filePath = normalizePath(`${this.workspacesPath}/${id}.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      console.log(`[FileSystemService] Read workspace: ${id}`);
      return data;
    } catch (error) {
      console.log(`[FileSystemService] Workspace not found: ${id}`);
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
      console.log(`[FileSystemService] Deleted workspace: ${id}`);
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
      console.log(`[FileSystemService] Found ${workspaceIds.length} workspaces`);
      return workspaceIds;
    } catch (error) {
      console.log(`[FileSystemService] No workspaces found`);
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
      console.log(`[FileSystemService] Read conversation index (${Object.keys(data.conversations || {}).length} conversations)`);
      return data;
    } catch (error) {
      console.log(`[FileSystemService] Conversation index not found`);
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
    console.log(`[FileSystemService] Wrote conversation index (${Object.keys(index.conversations).length} conversations)`);
  }

  /**
   * Read workspace index file
   */
  async readWorkspaceIndex(): Promise<WorkspaceIndex | null> {
    const filePath = normalizePath(`${this.workspacesPath}/index.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      console.log(`[FileSystemService] Read workspace index (${Object.keys(data.workspaces || {}).length} workspaces)`);
      return data;
    } catch (error) {
      console.log(`[FileSystemService] Workspace index not found`);
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
    console.log(`[FileSystemService] Wrote workspace index (${Object.keys(index.workspaces).length} workspaces)`);
  }

  /**
   * Check if conversations directory exists
   */
  async conversationsDirectoryExists(): Promise<boolean> {
    try {
      console.log(`[FileSystemService] Checking if conversations directory exists: ${this.conversationsPath}`);
      const exists = await this.plugin.app.vault.adapter.exists(this.conversationsPath);
      console.log(`[FileSystemService] Conversations directory exists: ${exists}`);
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
      console.log(`[FileSystemService] Checking if workspaces directory exists: ${this.workspacesPath}`);
      const exists = await this.plugin.app.vault.adapter.exists(this.workspacesPath);
      console.log(`[FileSystemService] Workspaces directory exists: ${exists}`);
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
    console.log(`[FileSystemService] Attempting to read ChromaDB collection from: ${chromaPath}`);
    try {
      const exists = await this.plugin.app.vault.adapter.exists(chromaPath);
      console.log(`[FileSystemService] ChromaDB collection file exists: ${exists}`);

      if (!exists) {
        console.log(`[FileSystemService] ChromaDB collection not found: ${collectionName}`);
        return [];
      }

      const content = await this.plugin.app.vault.adapter.read(chromaPath);
      console.log(`[FileSystemService] Read ${content.length} bytes from ${collectionName}`);

      const data = JSON.parse(content);
      const items = data.items || [];
      console.log(`[FileSystemService] Parsed ChromaDB collection: ${collectionName} (${items.length} items)`);
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