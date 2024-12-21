import { App, Modal, TFolder } from 'obsidian';
import BridgeMCPPlugin from '../main';

export class AllowedPathsModal extends Modal {
    private selectedPaths: Set<string>;

    constructor(
        app: App, 
        private plugin: BridgeMCPPlugin
    ) {
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

        // Create folder tree
        const folderContainer = contentEl.createDiv('folder-container');
        this.renderVaultFolders(folderContainer);

        // Buttons
        const buttonContainer = contentEl.createDiv('modal-button-container');
        
        buttonContainer.createEl('button', {
            text: 'Save',
            cls: 'mod-cta'
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

        // Add some basic styling
        contentEl.createEl('style', {
            text: `
                .folder-container {
                    max-height: 400px;
                    overflow-y: auto;
                    margin: 1em 0;
                }
                .folder-item {
                    display: flex;
                    align-items: center;
                    padding: 4px 0;
                }
                .folder-checkbox {
                    margin-right: 8px;
                }
                .modal-button-container {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 1em;
                }
            `
        });
    }

    private renderVaultFolders(container: HTMLElement) {
        const renderFolder = (folder: TFolder, depth = 0) => {
            const folderDiv = container.createDiv('folder-item');
            folderDiv.style.paddingLeft = `${depth * 20}px`;

            const checkbox = folderDiv.createEl('input', {
                type: 'checkbox',
                cls: 'folder-checkbox'
            });
            
            checkbox.checked = this.selectedPaths.has(folder.path);
            
            folderDiv.createSpan({
                text: folder.path === '/' ? '/' : folder.name,
                cls: 'folder-name'
            });

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    this.selectedPaths.add(folder.path);
                } else {
                    this.selectedPaths.delete(folder.path);
                }
            });

            // Render subfolders
            folder.children
                .filter((child): child is TFolder => child instanceof TFolder)
                .forEach(subfolder => renderFolder(subfolder, depth + 1));
        };

        // Start with root folder
        renderFolder(this.app.vault.getRoot());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
