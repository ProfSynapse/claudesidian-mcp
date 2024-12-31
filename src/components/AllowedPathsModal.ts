import { App, Modal, TFolder, TFile, setIcon } from 'obsidian';
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

        // Add modal-specific styles
        contentEl.createEl('style', {
            text: `
                .claudesidian-mcp-folder-container {
                    max-height: 400px;
                    overflow-y: auto;
                    margin: 1em 0;
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                }
                .claudesidian-mcp-folder-item, .claudesidian-mcp-file-item {
                    display: flex;
                    align-items: center;
                    padding: 6px 8px;
                    cursor: pointer;
                    transition: background-color 0.1s ease;
                }
                .claudesidian-mcp-folder-item:hover, .claudesidian-mcp-file-item:hover {
                    background-color: var(--background-modifier-hover);
                }
                .claudesidian-mcp-checkbox {
                    margin-right: 8px;
                }
                .claudesidian-mcp-folder-name, .claudesidian-mcp-file-name {
                    flex: 1;
                }
                .claudesidian-mcp-toggle {
                    margin-right: 4px;
                    width: 16px;
                    height: 16px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.15s ease;
                }
                .claudesidian-mcp-toggle.collapsed {
                    transform: rotate(-90deg);
                }
                .claudesidian-mcp-children {
                    display: none;
                }
                .claudesidian-mcp-children.expanded {
                    display: block;
                }
                .claudesidian-mcp-file-item {
                    padding-left: 44px;
                }
                .claudesidian-mcp-icon {
                    margin-right: 4px;
                    color: var(--text-muted);
                }
            `
        });

        contentEl.createEl('h2', { text: 'Select Allowed Paths' });
        contentEl.createEl('p', { 
            text: 'Choose which folders MCP tools can access. Subfolders are automatically included.'
        });

        const folderContainer = contentEl.createDiv({ 
            cls: 'claudesidian-mcp-folder-container'
        });
        
        const rootFolder = this.app.vault.getRoot();
        console.log('[AllowedPathsModal] Root folder:', rootFolder);

        if (rootFolder) {
            // Render root folder first
            this.renderFolder(rootFolder, folderContainer, 0);
            
            const allFolders = this.getAllFolders(rootFolder);
            console.log('[AllowedPathsModal] Found folders:', allFolders.length);
            
            if (allFolders.length === 0) {
                folderContainer.createEl('p', { 
                    text: 'No subfolders found in vault.',
                    cls: 'claudesidian-mcp-no-folders'
                });
            }
        } else {
            console.error('[AllowedPathsModal] Failed to access vault root folder');
            contentEl.createEl('p', { 
                text: 'Error: Could not access vault folders.',
                cls: 'claudesidian-mcp-error'
            });
        }

        // Add button container at the bottom
        const buttonContainer = contentEl.createDiv({
            cls: 'claudesidian-mcp-button-container'
        });
        
        const saveButton = buttonContainer.createEl('button', {
            text: 'Save',
            cls: ['mod-cta']
        });
        
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });

        saveButton.addEventListener('click', async () => {
            console.log('[AllowedPathsModal] Saving paths:', Array.from(this.selectedPaths));
            this.plugin.settings.allowedPaths = Array.from(this.selectedPaths);
            await this.plugin.saveSettings();
            this.close();
        });

        cancelButton.addEventListener('click', () => {
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
            cls: ['folder-item', 'claudesidian-mcp-folder-item'] // Added specific class
        });
        
        // Ensure minimum left padding
        folderDiv.style.paddingLeft = `${Math.max(8, depth * 20)}px`;

        // Replace arrow with folder icon
        const toggleIcon = folderDiv.createSpan({
            cls: 'claudesidian-mcp-toggle'
        });
        setIcon(toggleIcon, 'folder');

        const checkbox = folderDiv.createEl('input', {
            type: 'checkbox',
            cls: ['folder-checkbox', 'claudesidian-mcp-checkbox']
        });
        
        checkbox.checked = this.selectedPaths.has(folder.path);

        const nameSpan = folderDiv.createSpan({
            text: folder.path === '/' ? '/' : folder.name,
            cls: ['folder-name', 'claudesidian-mcp-folder-name']
        });

        // Create container for children
        const childrenContainer = container.createDiv({
            cls: ['claudesidian-mcp-children', 'expanded']
        });

        // Toggle handler
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = childrenContainer.classList.toggle('expanded');
            setIcon(toggleIcon, isExpanded ? 'folder' : 'folder-closed');
        });

        // Update folder click handler to properly handle all children
        const updateChildren = (checked: boolean) => {
            const updateChildCheckbox = (element: HTMLElement) => {
                const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
                if (checkbox) {
                    checkbox.checked = checked;
                    const path = checkbox.getAttribute('data-path');
                    if (path) {
                        this.handleCheckboxChange(checked, path);
                    }
                }
            };

            // Update all child folders and files
            childrenContainer.querySelectorAll('.claudesidian-mcp-folder-item, .claudesidian-mcp-file-item')
                .forEach(child => updateChildCheckbox(child as HTMLElement));
        };

        folderDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target !== toggleIcon) {
                checkbox.checked = !checkbox.checked;
                this.handleCheckboxChange(checkbox.checked, folder.path);
                updateChildren(checkbox.checked);
            }
        });

        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.handleCheckboxChange(target.checked, folder.path);
            updateChildren(target.checked);
        });

        // Sort and render children
        const children = folder.children.sort((a, b) => {
            // Folders first, then files
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return a.name.localeCompare(b.name);
        });

        children.forEach(child => {
            if (child instanceof TFolder) {
                this.renderFolder(child, childrenContainer, depth + 1);
            } else if (child instanceof TFile) {
                this.renderFile(child, childrenContainer, depth + 1);
            }
        });
    }

    private renderFile(file: TFile, container: HTMLElement, depth: number) {
        const fileDiv = container.createDiv({
            cls: ['file-item', 'claudesidian-mcp-file-item']
        });

        fileDiv.style.paddingLeft = `${Math.max(8, depth * 20)}px`;

        const fileIcon = fileDiv.createSpan({
            cls: 'claudesidian-mcp-icon'
        });
        setIcon(fileIcon, 'document');

        const checkbox = fileDiv.createEl('input', {
            type: 'checkbox',
            cls: ['file-checkbox', 'claudesidian-mcp-checkbox']
        });
        
        checkbox.checked = this.selectedPaths.has(file.path);
        checkbox.setAttribute('data-path', file.path);

        const nameSpan = fileDiv.createSpan({
            text: file.name,
            cls: ['file-name', 'claudesidian-mcp-file-name']
        });

        fileDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                this.handleCheckboxChange(checkbox.checked, file.path);
            }
        });

        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.handleCheckboxChange(target.checked, file.path);
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
