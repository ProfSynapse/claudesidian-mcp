import { Vault, TFile, App } from 'obsidian';
import { VaultManager } from '../services/VaultManager';
import * as yaml from 'yaml';

export interface AccessMetadata {
    lastViewedAt: string;
    accessCount: number;
}

export async function trackNoteAccess(vault: Vault | VaultManager, path: string, app?: App): Promise<void> {
    try {
        const now = new Date().toISOString();

        if (vault instanceof Vault) {
            // For Obsidian Vault, use native methods
            const file = vault.getAbstractFileByPath(path) as TFile;
            if (!file) return;
            
            const content = await vault.read(file);
            const cache = app?.metadataCache.getFileCache(file);
            const currentMetadata = cache?.frontmatter || {};

            // Extract existing content and frontmatter
            const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
            const existingContent = match ? match[2] : content;
            const existingFrontmatter = match ? yaml.parse(match[1]) || {} : {};

            // Merge new access data with existing frontmatter
            const newFrontmatter = {
                ...existingFrontmatter,
                ...currentMetadata,
                lastViewedAt: now,
                accessCount: ((existingFrontmatter.accessCount || 0) + 1)
            };

            // Only include frontmatter if there's something to include
            const newContent = Object.keys(newFrontmatter).length > 0
                ? `---\n${yaml.stringify(newFrontmatter)}---\n${existingContent}`
                : existingContent;

            await vault.modify(file, newContent);
        } else {
            // For VaultManager, use its methods
            const metadata = await vault.getNoteMetadata(path) || {};
            
            // Only update the access tracking fields
            await vault.updateNoteMetadata(path, {
                ...metadata,
                lastViewedAt: now,
                accessCount: (metadata.accessCount || 0) + 1
            });
        }
    } catch (error) {
        console.error(`Failed to update access tracking for ${path}:`, error);
    }
}
