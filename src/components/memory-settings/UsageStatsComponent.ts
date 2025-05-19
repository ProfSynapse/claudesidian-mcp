import { Notice } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { ProgressBar } from '../ProgressBar';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';

/**
 * Usage Statistics Component
 * Displays and manages usage statistics for memory and embeddings
 */
export class UsageStatsComponent extends BaseSettingsTab {
    private vaultLibrarian: VaultLibrarianAgent | null;
    private embeddingManager: EmbeddingManager | null;
    
    /**
     * Create a new usage stats component
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any, 
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent
    ) {
        super(settings, settingsManager, app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
    }
    
    /**
     * Display the usage statistics
     */
    display(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Get current stats
        let usageStats: {
            tokensThisMonth: number;
            totalEmbeddings: number;
            dbSizeMB: number;
            lastIndexedDate: string;
            indexingInProgress: boolean;
            estimatedCost?: number;
            modelUsage?: {
                'text-embedding-3-small': number;
                'text-embedding-3-large': number;
            };
        } = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            modelUsage: {
                'text-embedding-3-small': 0,
                'text-embedding-3-large': 0
            }
        };
        
        try {
            // Get usage stats using our helper method
            usageStats = this.getUsageStats();
        } catch (error) {
            console.error('Error getting usage stats:', error instanceof Error ? error.message : String(error));
        }
        
        // Current month usage
        section.createEl('div', {
            text: `Tokens used this month: ${usageStats.tokensThisMonth.toLocaleString()} / ${this.settings.maxTokensPerMonth.toLocaleString()}`
        });
        
        // Token usage progress bar
        const percentUsed = Math.min(100, (usageStats.tokensThisMonth / this.settings.maxTokensPerMonth) * 100);
        const progressContainer = section.createDiv({ cls: 'memory-usage-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'memory-usage-bar' });
        progressBar.style.width = `${percentUsed}%`;
        
        // Estimated cost - use the cost from usage stats if available, otherwise calculate
        const estimatedCost = usageStats.estimatedCost || 
            ((usageStats.tokensThisMonth / 1000) * (this.settings.costPerThousandTokens?.[this.settings.embeddingModel] || 0.00013));
        
        section.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Display per-model token usage if available
        if (usageStats.modelUsage) {
            const modelUsageContainer = section.createDiv({ cls: 'memory-model-usage' });
            section.createEl('h4', { text: 'Token Usage by Model' });
            
            for (const model in usageStats.modelUsage) {
                const tokens = usageStats.modelUsage[model as 'text-embedding-3-small' | 'text-embedding-3-large'];
                if (tokens > 0) {
                    const costPerK = this.settings.costPerThousandTokens?.[model as 'text-embedding-3-small' | 'text-embedding-3-large'] || 0;
                    const modelCost = (tokens / 1000) * costPerK;
                    
                    modelUsageContainer.createEl('div', {
                        text: `${model}: ${tokens.toLocaleString()} tokens ($${modelCost.toFixed(4)})`
                    });
                }
            }
        }
        
        // Database stats
        section.createEl('div', {
            text: `Total embeddings: ${usageStats.totalEmbeddings.toLocaleString()}`
        });
        
        section.createEl('div', {
            text: `Database size: ${(usageStats.dbSizeMB).toFixed(2)} MB / ${this.settings.maxDbSize} MB`
        });
        
        if (usageStats.lastIndexedDate) {
            section.createEl('div', {
                text: `Last indexed: ${new Date(usageStats.lastIndexedDate).toLocaleString()}`
            });
        }
        
        // Create indexing progress bar container
        const indexingProgressContainer = section.createDiv({ cls: 'memory-indexing-progress' });
        
        // Initialize progress bar
        if (this.vaultLibrarian?.app) {
            new ProgressBar(indexingProgressContainer, this.vaultLibrarian.app);
        } else if (this.app) {
            // If we have direct access to the app, use that
            new ProgressBar(indexingProgressContainer, this.app);
        }
        
        // Action buttons
        const actionsContainer = section.createDiv({ cls: 'memory-actions' });
        
        // Update Token Usage button
        const updateButton = actionsContainer.createEl('button', {
            text: 'Update Usage Counter',
            cls: 'mod-cta'
        });
        updateButton.addEventListener('click', async () => {
            const currentCount = usageStats.tokensThisMonth;
            const newCount = prompt('Enter new token count:', currentCount.toString());
            
            if (newCount !== null) {
                const numValue = Number(newCount);
                if (!isNaN(numValue) && numValue >= 0) {
                    await this.updateUsageStats(numValue);
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                } else {
                    new Notice('Please enter a valid number for token count');
                }
            }
        });
        
        // Reset Token Usage button
        const resetButton = actionsContainer.createEl('button', {
            text: 'Reset Usage Counter',
            cls: 'mod-warning'
        });
        resetButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset the usage counter?')) {
                await this.resetUsageStats();
                if (this.onSettingsChanged) {
                    this.onSettingsChanged();
                }
            }
        });
        
        // Get current operation ID (no longer supported)
        let currentOperationId: string | null = this.getCurrentIndexingOperationId();
        
        const hasIncompleteOperation = currentOperationId !== null && !usageStats.indexingInProgress;
        
        const reindexButton = actionsContainer.createEl('button', {
            text: usageStats.indexingInProgress ? 'Indexing in progress...' : 
                  hasIncompleteOperation ? 'Resume Indexing' : 'Reindex All Content',
            cls: 'mod-cta'
        });
        reindexButton.disabled = usageStats.indexingInProgress;
        
        // Create cancel button if indexing is in progress
        let cancelButton: HTMLElement | null = null;
        if (usageStats.indexingInProgress) {
            cancelButton = actionsContainer.createEl('button', {
                text: 'Cancel Indexing',
                cls: 'mod-warning'
            });
            
            cancelButton.addEventListener('click', async () => {
                const message = 'Are you sure you want to cancel the indexing operation? You can resume it later.';
                
                if (confirm(message)) {
                    await this.cancelIndexing();
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                }
            });
        }
        
        reindexButton.addEventListener('click', async () => {
            // Check if we can reindex (not already in progress)
            if (usageStats.indexingInProgress) {
                return;
            }
            
            // Handle incomplete operation
            if (hasIncompleteOperation) {
                if (confirm('Resume your previous indexing operation?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        // Resuming indexing is not supported anymore
                        new Notice('Resuming indexing operations is no longer supported');
                    } catch (error) {
                        console.error('Error resuming indexing:', error);
                    } finally {
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    }
                }
            } else {
                // Start a new indexing operation
                if (confirm('This will reindex all your vault content. It may take a while and use API tokens. Continue?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        // Reindexing functionality has been moved to the plugin's vector store implementation
                        new Notice('Please use the ChromaDB interface to reindex content');
                    } catch (error) {
                        console.error('Error reindexing:', error);
                    } finally {
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    }
                }
            }
        });
    }

    /**
     * Helper method to get usage stats
     */
    private getUsageStats(): {
        tokensThisMonth: number;
        totalEmbeddings: number;
        dbSizeMB: number;
        lastIndexedDate: string;
        indexingInProgress: boolean;
        estimatedCost?: number;
        modelUsage?: {
            'text-embedding-3-small': number;
            'text-embedding-3-large': number;
        };
    } {
        const defaultStats = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            modelUsage: {
                'text-embedding-3-small': 0,
                'text-embedding-3-large': 0
            }
        };
        
        try {
            // Try to get from the embedding provider if available
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider) {
                    defaultStats.estimatedCost = (provider as any).getTotalCost?.() || defaultStats.estimatedCost;
                    defaultStats.modelUsage = (provider as any).getModelUsage?.() || defaultStats.modelUsage;
                }
            }
            
            return defaultStats;
        } catch (error) {
            console.error('Error getting usage stats:', error);
            return defaultStats;
        }
    }
    
    /**
     * Helper method to update usage stats
     */
    private async updateUsageStats(tokenCount: number): Promise<void> {
        try {
            // Try to update through the embedding provider
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider && typeof (provider as any).updateUsageStats === 'function') {
                    await (provider as any).updateUsageStats(tokenCount);
                }
            }
        } catch (error) {
            console.error('Error updating usage stats:', error);
        }
    }
    
    /**
     * Helper method to reset usage stats
     */
    private async resetUsageStats(): Promise<void> {
        try {
            // Try to reset through the embedding provider
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider && typeof (provider as any).resetUsageStats === 'function') {
                    await (provider as any).resetUsageStats();
                }
            }
        } catch (error) {
            console.error('Error resetting usage stats:', error);
        }
    }
    
    /**
     * Get current indexing operation ID
     */
    private getCurrentIndexingOperationId(): string | null {
        return null; // No longer supported
    }
    
    /**
     * Cancel indexing operation
     */
    private async cancelIndexing(): Promise<void> {
        try {
            // No longer supported directly
            new Notice('Canceling indexing operation is no longer supported');
        } catch (error) {
            console.error('Error canceling indexing:', error);
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}