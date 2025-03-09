import { Vault, TFile, App } from 'obsidian';
import { VaultManager } from '../services/VaultManager';
import { IVaultManager } from '../tools/interfaces/ToolInterfaces';

export interface AccessMetadata {
    lastViewedAt: string;
    accessCount: number;
}

export async function trackNoteAccess(vault: Vault | VaultManager | IVaultManager, path: string, app?: App): Promise<void> {
    try {
        const now = new Date().toISOString();

        if (vault instanceof Vault) {
            // For Obsidian Vault, use native methods
            const file = vault.getAbstractFileByPath(path) as TFile;
            if (!file) return;
            
            const content = await vault.read(file);
            const cache = app?.metadataCache.getFileCache(file);
            const currentMetadata = cache?.frontmatter || {};

            // Extract existing content without frontmatter
            const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

            // Create new frontmatter
            const newFrontmatter = {
                ...currentMetadata,
                lastViewedAt: now,
                accessCount: (currentMetadata.accessCount || 0) + 1
            };

            // Construct new content with updated frontmatter
            const newContent = `---\n${JSON.stringify(newFrontmatter, null, 2)}\n---\n${contentWithoutFrontmatter}`;
            await vault.modify(file, newContent);
        } else {
            // For VaultManager or IVaultManager, use its methods
            const metadata = await vault.getNoteMetadata(path);
            await vault.updateNoteMetadata(path, {
                ...(metadata || {}),
                lastViewedAt: now,
                accessCount: ((metadata?.accessCount as number) || 0) + 1
            });
        }
    } catch (error) {
        console.error(`Failed to update access tracking for ${path}:`, error);
    }
}
