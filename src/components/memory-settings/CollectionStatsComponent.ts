import { Notice } from 'obsidian';
import { UsageStatsService, UsageStats, CollectionStat, USAGE_EVENTS } from '../../database/services/UsageStatsService';

/**
 * Component for displaying collection statistics
 * Focused solely on database collections and size
 */
export class CollectionStatsComponent {
    private containerEl: HTMLElement;
    private usageStatsService: UsageStatsService;
    private settings: any;
    private displayedStats: UsageStats | null = null;
    
    /**
     * Create a new collection stats component
     * @param containerEl Container element
     * @param usageStatsService Usage stats service
     * @param settings Settings
     */
    constructor(containerEl: HTMLElement, usageStatsService: UsageStatsService, settings: any) {
        this.containerEl = containerEl;
        this.usageStatsService = usageStatsService;
        this.settings = settings;
        
        // Set up event listeners for updates
        this.usageStatsService.on(USAGE_EVENTS.STATS_UPDATED, () => this.refresh());
        this.usageStatsService.on(USAGE_EVENTS.STATS_REFRESHED, (stats) => {
            this.displayedStats = stats;
            this.refresh();
        });
        // Listen for collection purge events which require a complete UI refresh
        this.usageStatsService.on(USAGE_EVENTS.COLLECTIONS_PURGED, () => {
            console.log('Collections purged event received, forcing complete UI refresh');
            // Force a complete reloading of stats
            this.displayedStats = null;
            this.refresh();
        });
    }
    
    /**
     * Refresh the display
     */
    async refresh(): Promise<void> {
        // Get current stats if not already provided
        if (!this.displayedStats) {
            this.displayedStats = await this.usageStatsService.getUsageStats();
        }
        
        // Clear and redraw
        this.display();
    }
    
    /**
     * Display collection statistics
     */
    async display(): Promise<void> {
        // Clear the container first
        this.containerEl.empty();
        
        // Create section header
        this.containerEl.createEl('h4', { text: 'Collection Statistics' });
        
        // If we don't have stats yet, fetch them
        if (!this.displayedStats) {
            this.displayedStats = await this.usageStatsService.getUsageStats();
        }
        
        const stats = this.displayedStats;
        
        // Database size
        this.containerEl.createEl('div', {
            text: `Database size: ${(stats.dbSizeMB).toFixed(2)} MB / ${this.settings.maxDbSize} MB`
        });
        
        if (stats.lastIndexedDate) {
            this.containerEl.createEl('div', {
                text: `Last indexed: ${new Date(stats.lastIndexedDate).toLocaleString()}`
            });
        }
        
        // Collection stats section
        const collectionSection = this.containerEl.createDiv({ cls: 'memory-collections-section' });
        collectionSection.createEl('h4', { text: 'Embeddings by Collection' });
        
        if (stats.collectionStats && stats.collectionStats.length > 0) {
            // Create collection stats container
            const collectionStatsContainer = collectionSection.createDiv({ cls: 'collection-stats-container' });
            
            // Total embeddings display
            collectionStatsContainer.createDiv({ 
                cls: 'collection-stats-total',
                text: `Total embeddings: ${stats.totalEmbeddings.toLocaleString()}`
            });
            
            // Create stacked bar for visualization
            const barContainer = collectionStatsContainer.createDiv({ cls: 'collection-bar-container' });
            
            // Create segments for each collection
            stats.collectionStats.forEach((collection: CollectionStat) => {
                const percentage = (collection.count / stats.totalEmbeddings) * 100;
                const segment = barContainer.createDiv({ cls: 'collection-bar-segment' });
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = collection.color;
                
                // Add tooltip
                segment.createDiv({
                    cls: 'collection-tooltip',
                    text: `${collection.name}: ${collection.count.toLocaleString()} embeddings (${percentage.toFixed(1)}%)`
                });
            });
            
            // Collection legend with counts - more compact display
            const legendContainer = collectionStatsContainer.createDiv({ cls: 'collection-legend-compact' });
            const legendHeader = legendContainer.createDiv({ cls: 'legend-header' });
            legendHeader.createEl('span', { text: 'Collection breakdown:' });
            
            // Create a flex container for the color indicators and names
            const legendItemsContainer = legendContainer.createDiv({ cls: 'legend-items-container' });
            stats.collectionStats.forEach((collection: CollectionStat) => {
                const legendItem = legendItemsContainer.createDiv({ cls: 'legend-item-compact' });
                const colorBox = legendItem.createDiv({ cls: 'legend-color' });
                colorBox.style.backgroundColor = collection.color;
                const percentage = (collection.count / stats.totalEmbeddings) * 100;
                legendItem.createEl('span', { 
                    text: `${collection.name} (${percentage.toFixed(1)}%)` 
                });
            });
        } else {
            // Display message when no collections or vector store isn't initialized
            const noCollectionsMessage = collectionSection.createDiv({ cls: 'memory-no-collections' });
            noCollectionsMessage.createEl('p', { 
                text: 'No collections found. This might be because:',
                cls: 'memory-notice'
            });
            
            const reasonsList = noCollectionsMessage.createEl('ul');
            reasonsList.createEl('li', { text: 'The vector store is not yet initialized' });
            reasonsList.createEl('li', { text: 'No files have been embedded yet' });
            reasonsList.createEl('li', { text: 'There might be an issue connecting to the embedding database' });
            
            // Add a button to check the vector store status
            const checkButton = noCollectionsMessage.createEl('button', {
                text: 'Refresh Collection Data',
                cls: 'mod-cta'
            });
            
            checkButton.addEventListener('click', async () => {
                try {
                    // Try to force refresh the stats
                    await this.usageStatsService.refreshStats();
                } catch (error) {
                    console.error('Error refreshing collection data:', error);
                    new Notice(`Error refreshing data: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        }
    }
}