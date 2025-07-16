/**
 * StatusSectionRenderer - Handles status section UI rendering
 * Follows Single Responsibility Principle by focusing only on status display
 */

import { Notice, Setting } from 'obsidian';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { EmbeddingChecker } from '../services/EmbeddingChecker';

export interface StatusSectionContext {
    embeddingsExist: boolean;
    onSaveSettings: () => Promise<void>;
}

/**
 * Service responsible for rendering embedding status section
 * Follows SRP by focusing only on status display operations
 */
export class StatusSectionRenderer {
    constructor(
        private app: any,
        private embeddingService: EmbeddingService | null,
        private embeddingChecker: EmbeddingChecker
    ) {}

    /**
     * Render status section
     */
    async render(containerEl: HTMLElement, context: StatusSectionContext): Promise<void> {
        // Only show status section if embeddings exist
        if (!context.embeddingsExist) {
            return;
        }

        // Create status section header
        const statusSection = containerEl.createEl('div', { cls: 'embedding-status-section' });
        statusSection.createEl('h3', { text: 'Current Status' });

        // Render embedding statistics
        await this.renderEmbeddingStats(statusSection);

        // Render delete embeddings button
        await this.renderDeleteButton(statusSection, context);
    }

    /**
     * Render embedding statistics
     */
    private async renderEmbeddingStats(containerEl: HTMLElement): Promise<void> {
        try {
            const stats = await this.embeddingChecker.getEmbeddingStats();
            
            const statsContainer = containerEl.createEl('div', { cls: 'embedding-stats' });
            
            if (stats.totalItems > 0) {
                statsContainer.createEl('p', { 
                    text: `Total embeddings: ${stats.totalItems}`,
                    cls: 'embedding-stat-item'
                });
                
                // Show collection breakdown
                const collectionsInfo = statsContainer.createEl('div', { cls: 'collections-info' });
                collectionsInfo.createEl('p', { text: 'Collections:' });
                
                const collectionsList = collectionsInfo.createEl('ul', { cls: 'collections-list' });
                
                for (const collection of stats.collectionsFound) {
                    const count = stats.collectionCounts[collection] || 0;
                    collectionsList.createEl('li', { 
                        text: `${collection}: ${count} items`,
                        cls: 'collection-item'
                    });
                }
            } else {
                statsContainer.createEl('p', { 
                    text: 'No embeddings found',
                    cls: 'no-embeddings'
                });
            }
        } catch (error) {
            console.error('Error rendering embedding stats:', error);
            
            containerEl.createEl('p', { 
                text: 'Error loading embedding statistics',
                cls: 'error-message'
            });
        }
    }

    /**
     * Render delete embeddings button
     */
    private async renderDeleteButton(containerEl: HTMLElement, context: StatusSectionContext): Promise<void> {
        new Setting(containerEl)
            .setName('Delete All Embeddings')
            .setDesc('This will permanently delete all embeddings. You will need to rebuild them to use semantic search.')
            .addButton(button => button
                .setButtonText('Delete All Embeddings')
                .setCta()
                .onClick(async () => {
                    await this.handleDeleteEmbeddings(button.buttonEl, context);
                })
            );
    }

    /**
     * Handle delete embeddings action
     */
    private async handleDeleteEmbeddings(button: HTMLButtonElement, context: StatusSectionContext): Promise<void> {
        const confirmed = await this.confirmDeleteAction();
        
        if (!confirmed) {
            return;
        }

        const originalText = button.textContent;
        
        try {
            button.textContent = 'Deleting...';
            button.disabled = true;
            
            await this.embeddingChecker.deleteAllEmbeddings();
            
            new Notice('All embeddings deleted successfully', 3000);
            
            // Update settings and refresh display
            await context.onSaveSettings();
            
        } catch (error) {
            console.error('Error deleting embeddings:', error);
            new Notice(`Error deleting embeddings: ${(error as Error).message}`, 5000);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    /**
     * Confirm delete action with user
     */
    private async confirmDeleteAction(): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-container">
                    <div class="modal-bg"></div>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Confirm Delete</h3>
                        </div>
                        <div class="modal-body">
                            <p>Are you sure you want to delete all embeddings?</p>
                            <p><strong>This action cannot be undone.</strong></p>
                            <p>You will need to rebuild embeddings to use semantic search features.</p>
                        </div>
                        <div class="modal-footer">
                            <button class="mod-cta" id="confirm-delete">Delete All</button>
                            <button id="cancel-delete">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const confirmButton = modal.querySelector('#confirm-delete') as HTMLButtonElement;
            const cancelButton = modal.querySelector('#cancel-delete') as HTMLButtonElement;
            
            const cleanup = () => {
                document.body.removeChild(modal);
            };
            
            confirmButton.onclick = () => {
                cleanup();
                resolve(true);
            };
            
            cancelButton.onclick = () => {
                cleanup();
                resolve(false);
            };
            
            // Close on background click
            const modalBg = modal.querySelector('.modal-bg') as HTMLElement;
            modalBg.onclick = () => {
                cleanup();
                resolve(false);
            };
            
            // Close on escape key
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            
            document.addEventListener('keydown', handleEscape);
        });
    }

    /**
     * Get current status information
     */
    async getStatusInfo(): Promise<{
        embeddingsExist: boolean;
        totalItems: number;
        collections: string[];
        errorMessage?: string;
    }> {
        try {
            const stats = await this.embeddingChecker.getEmbeddingStats();
            
            return {
                embeddingsExist: stats.totalItems > 0,
                totalItems: stats.totalItems,
                collections: stats.collectionsFound
            };
        } catch (error) {
            return {
                embeddingsExist: false,
                totalItems: 0,
                collections: [],
                errorMessage: (error as Error).message
            };
        }
    }
}