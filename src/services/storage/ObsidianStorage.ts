import { VaultManager } from '../VaultManager';
import { StorageInterface } from './StorageInterface';

/**
 * ObsidianStorage implements the StorageInterface using Obsidian's VaultManager
 * This is used in the plugin context when running inside Obsidian
 */
export class ObsidianStorage implements StorageInterface {
    constructor(private vaultManager: VaultManager) {}

    async createNote(path: string, content: string, options?: { createFolders?: boolean }): Promise<any> {
        return this.vaultManager.createNote(path, content, options);
    }

    async readNote(path: string): Promise<string> {
        return this.vaultManager.readNote(path);
    }

    async deleteNote(path: string): Promise<void> {
        return this.vaultManager.deleteNote(path);
    }

    async ensureFolder(path: string): Promise<void> {
        return this.vaultManager.ensureFolder(path);
    }

    async folderExists(path: string): Promise<boolean> {
        return this.vaultManager.folderExists(path);
    }
}
