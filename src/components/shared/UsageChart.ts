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
        const titleEl = chartContainer.createEl('h4', { text: this.options.title });
        titleEl.style.marginBottom = '16px';
        titleEl.style.color = 'var(--text-normal)';

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
        budgetSection.style.marginBottom = '20px';
        budgetSection.style.padding = '12px';
        budgetSection.style.border = '1px solid var(--background-modifier-border)';
        budgetSection.style.borderRadius = '6px';
        budgetSection.style.backgroundColor = 'var(--background-secondary)';

        // Budget header
        const budgetHeader = budgetSection.createEl('h5', { text: 'Monthly Budget' });
        budgetHeader.style.margin = '0 0 8px 0';
        budgetHeader.style.color = 'var(--text-normal)';

        // Budget info
        const budgetInfo = budgetSection.createDiv();
        
        if (this.options.budgetStatus.monthlyBudget > 0) {
            // Progress bar
            const progressContainer = budgetInfo.createDiv();
            progressContainer.style.marginBottom = '8px';
            
            const progressBar = progressContainer.createDiv();
            progressBar.style.width = '100%';
            progressBar.style.height = '8px';
            progressBar.style.backgroundColor = 'var(--background-modifier-border)';
            progressBar.style.borderRadius = '4px';
            progressBar.style.overflow = 'hidden';
            
            const progressFill = progressBar.createDiv();
            const percentage = Math.min(100, this.options.budgetStatus.percentageUsed);
            progressFill.style.width = `${percentage}%`;
            progressFill.style.height = '100%';
            progressFill.style.backgroundColor = percentage >= 100 ? 'var(--text-error)' : 
                                               percentage >= 80 ? 'var(--text-warning)' : 
                                               'var(--text-success)';
            progressFill.style.transition = 'width 0.3s ease';

            // Budget text
            const budgetText = budgetInfo.createDiv();
            budgetText.style.fontSize = '0.9em';
            budgetText.style.color = 'var(--text-muted)';
            
            const currentSpending = this.formatCurrency(this.options.budgetStatus.currentSpending);
            const totalBudget = this.formatCurrency(this.options.budgetStatus.monthlyBudget);
            const percentText = `${this.options.budgetStatus.percentageUsed}%`;
            
            budgetText.textContent = `${currentSpending} of ${totalBudget} used (${percentText})`;
            
            // Budget exceeded warning
            if (this.options.budgetStatus.budgetExceeded) {
                const warningEl = budgetInfo.createDiv();
                warningEl.style.color = 'var(--text-error)';
                warningEl.style.fontSize = '0.9em';
                warningEl.style.fontWeight = 'bold';
                warningEl.style.marginTop = '4px';
                warningEl.textContent = '⚠️ Budget exceeded - API calls will be blocked';
            }
        } else {
            budgetInfo.textContent = 'No budget set';
            budgetInfo.style.color = 'var(--text-muted)';
            budgetInfo.style.fontSize = '0.9em';
        }

        // Budget setting input
        if (this.options.onBudgetChange) {
            const budgetInput = budgetSection.createEl('input');
            budgetInput.type = 'number';
            budgetInput.step = '0.01';
            budgetInput.min = '0';
            budgetInput.placeholder = 'Set monthly budget ($)';
            budgetInput.value = this.options.budgetStatus.monthlyBudget > 0 ? 
                              this.options.budgetStatus.monthlyBudget.toString() : '';
            budgetInput.style.width = '100%';
            budgetInput.style.marginTop = '8px';
            budgetInput.style.padding = '4px 8px';
            budgetInput.style.border = '1px solid var(--background-modifier-border)';
            budgetInput.style.borderRadius = '4px';
            budgetInput.style.backgroundColor = 'var(--background-primary)';
            budgetInput.style.color = 'var(--text-normal)';

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
        section.style.marginBottom = '16px';

        // Section title
        const sectionTitle = section.createEl('h5', { text: title });
        sectionTitle.style.margin = '0 0 8px 0';
        sectionTitle.style.color = 'var(--text-normal)';

        // Total cost
        const totalEl = section.createDiv();
        totalEl.style.fontSize = '1.1em';
        totalEl.style.fontWeight = 'bold';
        totalEl.style.color = 'var(--text-normal)';
        totalEl.style.marginBottom = '12px';
        totalEl.textContent = `Total: ${this.formatCurrency(total)}`;

        // Provider breakdown with stacked progress bar
        const providers = Object.entries(usage);
        if (providers.length > 0) {
            // Create stacked progress bar
            this.renderStackedProgressBar(section, providers, total);
            
            // Create provider list below the progress bar
            const providerList = section.createDiv();
            providerList.style.fontSize = '0.9em';
            providerList.style.marginTop = '8px';
            
            providers
                .sort(([, a], [, b]) => b - a) // Sort by cost descending
                .forEach(([provider, cost]) => {
                    this.renderProviderListItem(providerList, provider, cost, total);
                });
        } else {
            // Show empty progress bar even when no usage
            const progressContainer = section.createDiv();
            progressContainer.style.width = '100%';
            progressContainer.style.height = '8px';
            progressContainer.style.backgroundColor = 'var(--background-modifier-border)';
            progressContainer.style.borderRadius = '4px';
            progressContainer.style.marginBottom = '8px';
            
            const noDataEl = section.createDiv();
            noDataEl.textContent = 'No usage yet';
            noDataEl.style.color = 'var(--text-muted)';
            noDataEl.style.fontSize = '0.9em';
            noDataEl.style.fontStyle = 'italic';
        }
    }

    /**
     * Render stacked progress bar showing all providers
     */
    private renderStackedProgressBar(container: HTMLElement, providers: [string, number][], totalCost: number): void {
        const progressContainer = container.createDiv();
        progressContainer.style.width = '100%';
        progressContainer.style.height = '8px';
        progressContainer.style.backgroundColor = 'var(--background-modifier-border)';
        progressContainer.style.borderRadius = '4px';
        progressContainer.style.overflow = 'hidden';
        progressContainer.style.display = 'flex';
        progressContainer.style.marginBottom = '8px';
        
        // Sort providers by cost descending for consistent stacking
        const sortedProviders = providers.sort(([, a], [, b]) => b - a);
        
        sortedProviders.forEach(([provider, cost]) => {
            const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
            
            if (percentage > 0) {
                const segment = progressContainer.createDiv();
                segment.style.width = `${percentage}%`;
                segment.style.height = '100%';
                segment.style.backgroundColor = this.getProviderColor(provider);
                segment.style.transition = 'width 0.3s ease';
                
                // Add tooltip on hover
                segment.title = `${this.formatProviderName(provider)}: ${this.formatCurrency(cost)} (${percentage.toFixed(1)}%)`;
            }
        });
    }

    /**
     * Render provider list item with color indicator
     */
    private renderProviderListItem(container: HTMLElement, provider: string, cost: number, totalCost: number): void {
        const providerEl = container.createDiv();
        providerEl.style.display = 'flex';
        providerEl.style.justifyContent = 'space-between';
        providerEl.style.alignItems = 'center';
        providerEl.style.padding = '2px 0';
        providerEl.style.color = 'var(--text-muted)';
        
        // Left side: color indicator + name
        const leftEl = providerEl.createDiv();
        leftEl.style.display = 'flex';
        leftEl.style.alignItems = 'center';
        leftEl.style.gap = '8px';
        
        // Color indicator
        const colorDot = leftEl.createDiv();
        colorDot.style.width = '8px';
        colorDot.style.height = '8px';
        colorDot.style.backgroundColor = this.getProviderColor(provider);
        colorDot.style.borderRadius = '50%';
        colorDot.style.flexShrink = '0';
        
        // Provider name
        const nameEl = leftEl.createSpan();
        nameEl.textContent = this.formatProviderName(provider);
        nameEl.style.color = 'var(--text-normal)';
        
        // Right side: cost and percentage
        const rightEl = providerEl.createDiv();
        rightEl.style.display = 'flex';
        rightEl.style.alignItems = 'center';
        rightEl.style.gap = '8px';
        
        const costEl = rightEl.createSpan();
        costEl.textContent = this.formatCurrency(cost);
        costEl.style.fontFamily = 'var(--font-monospace)';
        
        const percentageEl = rightEl.createSpan();
        const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        percentageEl.textContent = `(${percentage.toFixed(1)}%)`;
        percentageEl.style.fontSize = '0.8em';
        percentageEl.style.color = 'var(--text-faint)';
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
        actionsSection.style.marginTop = '16px';

        const resetButton = actionsSection.createEl('button', { text: 'Reset Monthly Usage' });
        resetButton.style.padding = '6px 12px';
        resetButton.style.backgroundColor = 'var(--interactive-accent)';
        resetButton.style.color = 'var(--text-on-accent)';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontSize = '0.9em';

        resetButton.addEventListener('click', () => {
            this.options.onResetMonthly!();
        });

        resetButton.addEventListener('mouseenter', () => {
            resetButton.style.backgroundColor = 'var(--interactive-accent-hover)';
        });

        resetButton.addEventListener('mouseleave', () => {
            resetButton.style.backgroundColor = 'var(--interactive-accent)';
        });
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