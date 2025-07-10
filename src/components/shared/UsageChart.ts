/**
 * Shared Usage Chart Component
 * Displays provider-based cost breakdown with Obsidian-style design
 */

import { ProviderUsage, BudgetStatus, UsageData } from '../../services/UsageTracker';

export interface UsageChartOptions {
    containerEl: HTMLElement;
    title: string;
    usageData: UsageData;
    budgetStatus?: BudgetStatus;
    onResetMonthly?: () => void;
    onBudgetChange?: (budget: number) => void;
}

export class UsageChart {
    private containerEl: HTMLElement;
    private options: UsageChartOptions;

    constructor(options: UsageChartOptions) {
        this.containerEl = options.containerEl;
        this.options = options;
        this.render();
    }

    /**
     * Update the chart with new data
     */
    update(usageData: UsageData, budgetStatus?: BudgetStatus): void {
        this.options.usageData = usageData;
        this.options.budgetStatus = budgetStatus;
        this.render();
    }

    /**
     * Render the usage chart
     */
    private render(): void {
        this.containerEl.empty();
        
        // Create main container
        const chartContainer = this.containerEl.createDiv('usage-chart-container');
        
        // Title
        const titleEl = chartContainer.createEl('h4', { text: this.options.title, cls: 'usage-chart-title' });

        // Budget section (if provided)
        if (this.options.budgetStatus) {
            this.renderBudgetSection(chartContainer);
        }

        // Monthly costs section
        this.renderCostsSection(chartContainer, 'This Month', this.options.usageData.monthly, this.options.usageData.monthlyTotal);
        
        // All-time costs section
        this.renderCostsSection(chartContainer, 'All Time', this.options.usageData.allTime, this.options.usageData.allTimeTotal);

        // Action buttons
        this.renderActionButtons(chartContainer);
    }

    /**
     * Render budget status section
     */
    private renderBudgetSection(container: HTMLElement): void {
        if (!this.options.budgetStatus) return;

        const budgetSection = container.createDiv('usage-budget-section');

        // Budget header
        const budgetHeader = budgetSection.createEl('h5', { text: 'Monthly Budget', cls: 'usage-budget-header' });

        // Budget info
        const budgetInfo = budgetSection.createDiv();
        
        if (this.options.budgetStatus.monthlyBudget > 0) {
            // Progress bar
            const progressContainer = budgetInfo.createDiv('usage-progress-container');
            
            const progressBar = progressContainer.createDiv('usage-progress-bar');
            
            const progressFill = progressBar.createDiv('usage-progress-fill');
            const percentage = Math.min(100, this.options.budgetStatus.percentageUsed);
            progressFill.style.width = `${percentage}%`;
            
            // Add appropriate status class
            if (percentage >= 100) {
                progressFill.addClass('error');
            } else if (percentage >= 80) {
                progressFill.addClass('warning');
            } else {
                progressFill.addClass('success');
            }

            // Budget text
            const budgetText = budgetInfo.createDiv('usage-budget-text');
            
            const currentSpending = this.formatCurrency(this.options.budgetStatus.currentSpending);
            const totalBudget = this.formatCurrency(this.options.budgetStatus.monthlyBudget);
            const percentText = `${this.options.budgetStatus.percentageUsed}%`;
            
            budgetText.textContent = `${currentSpending} of ${totalBudget} used (${percentText})`;
            
            // Budget exceeded warning
            if (this.options.budgetStatus.budgetExceeded) {
                const warningEl = budgetInfo.createDiv('usage-budget-warning');
                warningEl.textContent = '⚠️ Budget exceeded - API calls will be blocked';
            }
        } else {
            budgetInfo.textContent = 'No budget set';
            budgetInfo.addClass('usage-budget-text');
        }

        // Budget setting input
        if (this.options.onBudgetChange) {
            const budgetInput = budgetSection.createEl('input', { cls: 'usage-budget-input' });
            budgetInput.type = 'number';
            budgetInput.step = '0.01';
            budgetInput.min = '0';
            budgetInput.placeholder = 'Set monthly budget ($)';
            budgetInput.value = this.options.budgetStatus.monthlyBudget > 0 ? 
                              this.options.budgetStatus.monthlyBudget.toString() : '';

            budgetInput.addEventListener('change', () => {
                const budget = parseFloat(budgetInput.value) || 0;
                this.options.onBudgetChange!(budget);
            });
        }
    }

    /**
     * Render costs section (monthly or all-time)
     */
    private renderCostsSection(container: HTMLElement, title: string, usage: ProviderUsage, total: number): void {
        const section = container.createDiv('usage-costs-section');

        // Section title
        const sectionTitle = section.createEl('h5', { text: title, cls: 'usage-section-title' });

        // Total cost
        const totalEl = section.createDiv('usage-total-cost');
        totalEl.textContent = `Total: ${this.formatCurrency(total)}`;

        // Provider breakdown with stacked progress bar
        const providers = Object.entries(usage);
        if (providers.length > 0) {
            // Create stacked progress bar
            this.renderStackedProgressBar(section, providers, total);
            
            // Create provider list below the progress bar
            const providerList = section.createDiv('usage-provider-list');
            
            providers
                .sort(([, a], [, b]) => b - a) // Sort by cost descending
                .forEach(([provider, cost]) => {
                    this.renderProviderListItem(providerList, provider, cost, total);
                });
        } else {
            // Show empty progress bar even when no usage
            const progressContainer = section.createDiv('usage-stacked-progress-container');
            
            const noDataEl = section.createDiv('usage-no-data');
            noDataEl.textContent = 'No usage yet';
        }
    }

    /**
     * Render stacked progress bar showing all providers
     */
    private renderStackedProgressBar(container: HTMLElement, providers: [string, number][], totalCost: number): void {
        const progressContainer = container.createDiv('usage-stacked-progress-container');
        
        // Sort providers by cost descending for consistent stacking
        const sortedProviders = providers.sort(([, a], [, b]) => b - a);
        
        sortedProviders.forEach(([provider, cost]) => {
            const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
            
            if (percentage > 0) {
                const segment = progressContainer.createDiv('usage-progress-segment');
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = this.getProviderColor(provider);
                
                // Add tooltip on hover
                segment.title = `${this.formatProviderName(provider)}: ${this.formatCurrency(cost)} (${percentage.toFixed(1)}%)`;
            }
        });
    }

    /**
     * Render provider list item with color indicator
     */
    private renderProviderListItem(container: HTMLElement, provider: string, cost: number, totalCost: number): void {
        const providerEl = container.createDiv('usage-provider-item');
        
        // Left side: color indicator + name
        const leftEl = providerEl.createDiv('usage-provider-left');
        
        // Color indicator
        const colorDot = leftEl.createDiv('usage-provider-color-dot');
        colorDot.style.backgroundColor = this.getProviderColor(provider);
        
        // Provider name
        const nameEl = leftEl.createSpan({ cls: 'usage-provider-name' });
        nameEl.textContent = this.formatProviderName(provider);
        
        // Right side: cost and percentage
        const rightEl = providerEl.createDiv('usage-provider-right');
        
        const costEl = rightEl.createSpan({ cls: 'usage-provider-cost' });
        costEl.textContent = this.formatCurrency(cost);
        
        const percentageEl = rightEl.createSpan({ cls: 'usage-provider-percentage' });
        const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        percentageEl.textContent = `(${percentage.toFixed(1)}%)`;
    }

    /**
     * Get color for provider
     */
    private getProviderColor(provider: string): string {
        const colors: { [key: string]: string } = {
            'openai': '#10a37f',        // OpenAI green
            'anthropic': '#d4715a',     // Anthropic orange/brown
            'google': '#4285f4',        // Google blue
            'groq': '#f55036',          // Groq red/orange
            'ollama': '#8b5cf6',        // Purple for local
            'perplexity': '#20a4f7',    // Perplexity blue
            'xai': '#000000',           // xAI black
            'embeddings': '#059669',    // Emerald green for embeddings
            'mistral': '#ff6b35',       // Mistral orange
            'cohere': '#39b5f1',        // Cohere blue
            'openrouter': '#6366f1'     // Indigo for OpenRouter
        };
        
        return colors[provider.toLowerCase()] || '#6b7280'; // Default gray
    }

    /**
     * Render action buttons
     */
    private renderActionButtons(container: HTMLElement): void {
        if (!this.options.onResetMonthly) return;

        const actionsSection = container.createDiv('usage-actions');

        const resetButton = actionsSection.createEl('button', { text: 'Reset Monthly Usage', cls: 'usage-reset-button' });

        resetButton.addEventListener('click', () => {
            this.options.onResetMonthly!();
        });

        // Hover effects are now handled by CSS
    }

    /**
     * Format currency value with better precision for small amounts
     */
    private formatCurrency(amount: number): string {
        if (amount === 0) return '$0.00';
        
        // For amounts >= 1 cent, use standard 2 decimal places
        if (amount >= 0.01) return `$${amount.toFixed(2)}`;
        
        // For smaller amounts, always show significant digits
        if (amount >= 0.000001) {
            // Find the number of decimal places needed to show at least 3 significant digits
            const str = amount.toFixed(8); // Start with 8 decimal places
            const match = str.match(/^\d*\.(\d*?[1-9]\d*?[1-9]\d*?)/); // Find first 3 significant digits
            if (match) {
                const decimalPlaces = match[1].length;
                return `$${amount.toFixed(Math.max(3, decimalPlaces))}`;
            }
            return `$${amount.toFixed(6)}`;
        }
        
        // For extremely small amounts, use scientific notation
        return `$${amount.toExponential(2)}`;
    }

    /**
     * Format provider name for display
     */
    private formatProviderName(provider: string): string {
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
}