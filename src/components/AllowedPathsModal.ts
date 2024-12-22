import { App, Modal, TFolder } from 'obsidian';
import BridgeMCPPlugin from '../main';

export class AllowedPathsModal extends Modal {
    private selectedPaths: Set<string>;

    constructor(app: App, private plugin: BridgeMCPPlugin) {
        super(app);
        this.selectedPaths = new Set(this.plugin.settings.allowedPaths || []);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Select Allowed Paths' });
        contentEl.createEl('p', { 
            text: 'Choose which folders MCP tools can access. Subfolders are automatically included.'
        });

        const folderContainer = contentEl.createDiv({ cls: 'folder-container' });
        
        const rootFolder = this.app.vault.getRoot();
        console.log('Root folder:', rootFolder); // Debug log

        if (rootFolder) {
            // Start with root folder
            this.renderFolder(rootFolder, folderContainer, 0);
            
            // Get all subfolders
            const allFolders = this.getAllFolders(rootFolder);
            console.log('All folders:', allFolders); // Debug log
            
            if (allFolders.length === 0) {
                contentEl.createEl('p', { text: 'No subfolders found in vault.' });
            }
        } else {
            contentEl.createEl('p', { text: 'Could not access vault root folder.' });
        }

        const buttonContainer = contentEl.createDiv('modal-button-container');
        
        buttonContainer.createEl('button', {
            text: 'Save',
            cls: ['mod-cta']
        }).addEventListener('click', async () => {
            this.plugin.settings.allowedPaths = Array.from(this.selectedPaths);
            await this.plugin.saveSettings();
            this.close();
        });

        buttonContainer.createEl('button', {
            text: 'Cancel'
        }).addEventListener('click', () => {
            this.close();
        });
    }

    private getAllFolders(folder: TFolder): TFolder[] {
        let folders: TFolder[] = [folder];
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                folders = folders.concat(this.getAllFolders(child));
            }
        }
        return folders;
    }

    private renderFolder(folder: TFolder, container: HTMLElement, depth: number) {
        console.log('Rendering folder:', folder.path, folder.name); // Debug log
        
        const folderDiv = container.createDiv({ 
            cls: ['folder-item', 'bridge-mcp-folder-item'] // Added specific class
        });
        
        // Ensure minimum left padding
        folderDiv.style.paddingLeft = `${Math.max(8, depth * 20)}px`;

        const checkbox = folderDiv.createEl('input', {
            type: 'checkbox',
            cls: ['folder-checkbox', 'bridge-mcp-checkbox']
        });
        
        checkbox.checked = this.selectedPaths.has(folder.path);

        const nameSpan = folderDiv.createSpan({
            text: folder.path === '/' ? '/' : folder.name,
            cls: ['folder-name', 'bridge-mcp-folder-name']
        });

        // Make the entire div clickable
        folderDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                this.handleCheckboxChange(checkbox.checked, folder.path);
            }
        });

        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.handleCheckboxChange(target.checked, folder.path);
        });

        // Sort and render subfolders
        const subfolders = folder.children
            .filter((child): child is TFolder => child instanceof TFolder)
            .sort((a, b) => a.name.localeCompare(b.name));

        subfolders.forEach(subfolder => {
            this.renderFolder(subfolder, container, depth + 1);
        });
    }

    private handleCheckboxChange(checked: boolean, path: string) {
        if (checked) {
            this.selectedPaths.add(path);
        } else {
            this.selectedPaths.delete(path);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
