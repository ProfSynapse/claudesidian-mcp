// Import Obsidian components that we need
import { Notice } from 'obsidian';
import { UsageStatsService, UsageStats, ModelCostMap, USAGE_EVENTS } from '../../database/services/UsageStatsService';

/**
 * Component for displaying token usage statistics
 * Focused solely on token usage and cost aspects
 */
export class TokenUsageComponent {
    private containerEl: HTMLElement;
    private usageStatsService: UsageStatsService;
    private settings: any;
    private displayedStats: UsageStats | null = null;
    
    /**
     * Create a new token usage component
     * @param containerEl Container element
     * @param usageStatsService Usage stats service
     * @param settings Settings
     */
    constructor(containerEl: HTMLElement, usageStatsService: UsageStatsService, settings: any) {
        this.containerEl = containerEl;
        this.usageStatsService = usageStatsService;
        this.settings = settings;
        
        // Create a debounced refresh function for event handling
        const debouncedEventRefresh = this.debounce(() => {
            this.refresh();
        }, 300); // 300ms debounce
        
        // Set up event listeners with debouncing to prevent loops
        this.usageStatsService.on(USAGE_EVENTS.STATS_UPDATED, () => {
            debouncedEventRefresh();
        });
        
        this.usageStatsService.on(USAGE_EVENTS.STATS_REFRESHED, (stats) => {
            this.displayedStats = stats;
            // Use direct display method instead of refresh to avoid loops
            this.display();
        });
        
        this.usageStatsService.on(USAGE_EVENTS.STATS_RESET, () => {
            debouncedEventRefresh();
        });
        
        // Listen for localStorage changes directly (with debouncing)
        const debouncedRefresh = this.debounce(() => {
            this.refresh();
        }, 300); // 300ms debounce
        
        window.addEventListener('storage', (event) => {
            if (event.key === 'claudesidian-tokens-used' || 
                event.key === 'claudesidian-token-usage' || 
                event.key === 'claudesidian-tokens-all-time') {
                // console.log(`Token usage localStorage change detected (${event.key}), triggering debounced refresh`);
                debouncedRefresh();
            }
        });
    }
    
    // Flag to track if refresh is in progress
    private isRefreshing = false;
    
    /**
     * Refresh the display
     */
    async refresh(): Promise<void> {
        // Prevent concurrent refreshes
        if (this.isRefreshing) {
            return;
        }
        
        try {
            this.isRefreshing = true;
            
            // Always get fresh stats - this ensures we have the latest data
            // Use skipEvents parameter to avoid triggering more events
            this.displayedStats = await this.usageStatsService.getUsageStats(true);
            
            
            // Clear and redraw
            this.display();
        } catch (error) {
            console.error('Error refreshing TokenUsageComponent:', error);
        } finally {
            this.isRefreshing = false;
        }
    }
    
    /**
     * Simple debounce function to prevent too many calls in quick succession
     * @param func Function to debounce
     * @param wait Wait time in ms
     */
    private debounce(func: () => void, wait: number): () => void {
        let timeout: NodeJS.Timeout | null = null;
        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                timeout = null;
                func();
            }, wait);
        };
    }
    
    /**
     * Display token usage statistics
     */
    async display(): Promise<void> {
        // Clear the container first
        this.containerEl.empty();
        
        // Create section header
        this.containerEl.createEl('h4', { text: 'Token Usage' });
        
        // If we don't have stats yet, fetch them
        if (!this.displayedStats) {
            this.displayedStats = await this.usageStatsService.getUsageStats();
        }
        
        const stats = this.displayedStats;
        
        // Current month usage
        this.containerEl.createEl('div', {
            text: `Tokens used this month: ${stats.tokensThisMonth.toLocaleString()} / ${this.settings.maxTokensPerMonth.toLocaleString()}`
        });
        
        // Token usage progress bar
        const percentUsed = Math.min(100, (stats.tokensThisMonth / this.settings.maxTokensPerMonth) * 100);
        const progressContainer = this.containerEl.createDiv({ cls: 'memory-usage-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'memory-usage-bar token-usage-progress-bar' });
        progressBar.style.width = `${percentUsed}%`;
        
        // Estimated cost - use the cost from usage stats if available, otherwise calculate
        // Default to text-embedding-3-small cost (0.00002) if not defined
        const costPerThousandTokens = this.settings.costPerThousandTokens || {
            'text-embedding-3-small': 0.00002,
            'text-embedding-3-large': 0.00013
        };
        
        const estimatedCost = stats.estimatedCost || 
            ((stats.tokensThisMonth / 1000) * 
             (costPerThousandTokens[this.settings.embeddingModel] || 0.00002));
        
        this.containerEl.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Display all-time token usage
        const allTimeTokens = stats.tokensAllTime || stats.tokensThisMonth;
        const allTimeCost = stats.estimatedCostAllTime || estimatedCost;
        
        // Add a divider
        this.containerEl.createEl('hr');
        
        // Display the all-time stats
        this.containerEl.createEl('div', {
            text: `All-time tokens used: ${allTimeTokens.toLocaleString()}`
        });
        
        this.containerEl.createEl('div', {
            text: `All-time estimated cost: $${allTimeCost.toFixed(4)}`
        });
        
        // Add reset button
        const actionsContainer = this.containerEl.createDiv({ cls: 'memory-actions' });
        const resetButton = actionsContainer.createEl('button', {
            text: 'Reset Usage Counter',
            cls: 'mod-warning'
        });
        
        resetButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset the usage counter?')) {
                await this.usageStatsService.resetUsageStats();
                // Refresh is handled by event listener
            }
        });
    }
}