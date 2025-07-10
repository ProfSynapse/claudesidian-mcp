/**
 * LLM Usage Tab Component
 * Displays LLM usage statistics and budget management for Agent Manager
 */

import { App } from 'obsidian';
import { UsageTracker, UsageData, BudgetStatus } from '../services/UsageTracker';
import { UsageChart } from './shared/UsageChart';

export interface LLMUsageTabOptions {
    containerEl: HTMLElement;
    app: App;
}

export class LLMUsageTab {
    private containerEl: HTMLElement;
    private app: App;
    private usageTracker: UsageTracker;
    private usageChart: UsageChart | null = null;
    private refreshInterval: NodeJS.Timeout | null = null;

    constructor(options: LLMUsageTabOptions) {
        this.containerEl = options.containerEl;
        this.app = options.app;
        
        // Get settings from plugin
        const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
        const settings = plugin?.settings || {};
        
        // Initialize usage tracker for LLM usage
        this.usageTracker = new UsageTracker('llm', settings);
        
        this.buildContent();
        this.startAutoRefresh();
    }

    /**
     * Build the LLM usage tab content
     */
    private async buildContent(): Promise<void> {
        this.containerEl.empty();
        
        // Create main container
        const mainContainer = this.containerEl.createDiv('llm-usage-tab llm-usage-main-container');

        // Header
        const headerEl = mainContainer.createEl('h3', { text: 'LLM Usage & Budget' });
        headerEl.style.marginBottom = '20px';

        // Description
        const descEl = mainContainer.createDiv();
        descEl.style.marginBottom = '20px';
        descEl.style.color = 'var(--text-muted)';
        descEl.style.fontSize = '0.9em';
        descEl.textContent = 'Track your LLM API costs and manage monthly budgets. Costs are calculated based on token usage from Agent Manager operations.';

        // Usage chart container
        const chartContainer = mainContainer.createDiv('llm-usage-chart');
        
        // Load and display usage data
        await this.refreshUsageData(chartContainer);
    }

    /**
     * Refresh usage data and update chart
     */
    private async refreshUsageData(chartContainer?: HTMLElement): Promise<void> {
        try {
            const container = chartContainer || this.containerEl.querySelector('.llm-usage-chart') as HTMLElement;
            if (!container) return;

            const usageData = await this.usageTracker.getUsageData();
            const budgetStatus = await this.usageTracker.getBudgetStatusAsync();

            // Create or update chart
            if (!this.usageChart) {
                this.usageChart = new UsageChart({
                    containerEl: container,
                    title: '💰 LLM Costs',
                    usageData,
                    budgetStatus,
                    onResetMonthly: () => this.handleResetMonthly(),
                    onBudgetChange: (budget: number) => this.handleBudgetChange(budget)
                });
            } else {
                this.usageChart.update(usageData, budgetStatus);
            }

        } catch (error) {
            console.error('Error refreshing LLM usage data:', error);
            this.showError(chartContainer || this.containerEl);
        }
    }

    /**
     * Handle monthly usage reset
     */
    private async handleResetMonthly(): Promise<void> {
        try {
            await this.usageTracker.resetMonthlyUsage();
            await this.refreshUsageData();
            
            // Show success message
            const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
            if (plugin?.showNotice) {
                plugin.showNotice('Monthly LLM usage reset successfully');
            }
        } catch (error) {
            console.error('Error resetting monthly LLM usage:', error);
            
            // Show error message
            const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
            if (plugin?.showNotice) {
                plugin.showNotice('Failed to reset monthly usage', 'error');
            }
        }
    }

    /**
     * Handle budget change
     */
    private handleBudgetChange(budget: number): void {
        try {
            this.usageTracker.setMonthlyBudget(budget);
            
            // Refresh to show updated budget status
            setTimeout(() => {
                this.refreshUsageData();
            }, 100);
            
            // Show success message
            const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
            if (plugin?.showNotice) {
                if (budget > 0) {
                    plugin.showNotice(`Monthly LLM budget set to $${budget.toFixed(2)}`);
                } else {
                    plugin.showNotice('Monthly LLM budget disabled');
                }
            }
        } catch (error) {
            console.error('Error setting LLM budget:', error);
            
            // Show error message
            const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
            if (plugin?.showNotice) {
                plugin.showNotice('Failed to set budget', 'error');
            }
        }
    }

    /**
     * Show error message
     */
    private showError(container: HTMLElement): void {
        container.empty();
        
        const errorEl = container.createDiv('llm-usage-error');
        
        errorEl.createEl('h4', { text: '⚠️ Error Loading Usage Data' });
        errorEl.createEl('p', { text: 'Unable to load LLM usage statistics. Please try refreshing the tab.' });
        
        const retryButton = errorEl.createEl('button', { text: 'Retry', cls: 'llm-usage-error-button' });
        
        retryButton.addEventListener('click', () => {
            this.refreshUsageData();
        });
    }

    /**
     * Start auto-refresh interval
     */
    private startAutoRefresh(): void {
        // Refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshUsageData();
        }, 30000);
    }

    /**
     * Stop auto-refresh interval
     */
    private stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Cleanup when tab is destroyed
     */
    destroy(): void {
        this.stopAutoRefresh();
        this.usageChart = null;
    }

    /**
     * Get current budget status for external use
     */
    async getBudgetStatus(): Promise<BudgetStatus> {
        return await this.usageTracker.getBudgetStatusAsync();
    }

    /**
     * Check if a cost can be afforded within budget
     */
    async canAfford(cost: number): Promise<boolean> {
        return await this.usageTracker.canAfford(cost);
    }
}