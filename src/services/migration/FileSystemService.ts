// Location: src/services/migration/FileSystemService.ts
// File system utility for managing the new .data directory and JSON operations
// Used by: DataMigrationService, ChromaDataLoader, and all new services
// Dependencies: Obsidian Plugin API for file system operations

import { normalizePath, TFile } from 'obsidian';
import { Plugin } from 'obsidian';

export class FileSystemService {
  private plugin: Plugin;
  private dataPath: string;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.dataPath = normalizePath(`${plugin.app.vault.configDir}/plugins/claudesidian-mcp/.data`);
  }

  async ensureDataDirectory(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir(this.dataPath);
      console.log(`[Claudesidian] Created data directory: ${this.dataPath}`);
    } catch (error) {
      // Directory might already exist - this is fine
      console.log(`[Claudesidian] Data directory exists: ${this.dataPath}`);
    }
  }

  async writeJSON(filename: string, data: any): Promise<void> {
    const filePath = normalizePath(`${this.dataPath}/${filename}`);
    const jsonString = JSON.stringify(data, null, 2);
    await this.plugin.app.vault.adapter.write(filePath, jsonString);
    console.log(`[Claudesidian] Wrote JSON file: ${filename} (${jsonString.length} chars)`);
  }

  async readJSON(filename: string): Promise<any> {
    const filePath = normalizePath(`${this.dataPath}/${filename}`);
    try {
      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);
      console.log(`[Claudesidian] Read JSON file: ${filename} (${content.length} chars)`);
      return data;
    } catch (error) {
      console.log(`[Claudesidian] Could not read JSON file: ${filename}`, error);
      return null;
    }
  }

  async fileExists(filename: string): Promise<boolean> {
    const filePath = normalizePath(`${this.dataPath}/${filename}`);
    try {
      await this.plugin.app.vault.adapter.stat(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async readChromaCollection(collectionName: string): Promise<any> {
    const chromaPath = normalizePath(`${this.plugin.app.vault.configDir}/plugins/claudesidian-mcp/data/chroma-db/collections/${collectionName}/items.json`);
    try {
      const content = await this.plugin.app.vault.adapter.read(chromaPath);
      const data = JSON.parse(content);
      const items = data.items || [];
      console.log(`[Claudesidian] Read ChromaDB collection: ${collectionName} (${items.length} items)`);
      return items;
    } catch (error) {
      console.warn(`[Claudesidian] Could not read ChromaDB collection: ${collectionName}`, error);
      return [];
    }
  }

  getDataPath(): string {
    return this.dataPath;
  }

  getChromaPath(): string {
    return normalizePath(`${this.plugin.app.vault.configDir}/plugins/claudesidian-mcp/data/chroma-db`);
  }
}