/**
 * RateLimitRenderer - Handles rate limit configuration UI rendering
 * Follows Single Responsibility Principle by focusing only on rate limit config
 */

import { Notice, Setting } from 'obsidian';

export interface RateLimitContext {
    onSaveSettings: () => Promise<void>;
}

/**
 * Service responsible for rendering rate limit configuration UI
 * Follows SRP by focusing only on rate limit operations
 */
export class RateLimitRenderer {
    constructor(private settings: any) {}

    /**
     * Render rate limit configuration section
     */
    async render(containerEl: HTMLElement, context: RateLimitContext): Promise<void> {
        // Create rate limit section header
        containerEl.createEl('h3', { text: 'Rate Limiting' });

        // Render rate limit input
        await this.renderRateLimitInput(containerEl, context);

        // Render rate limit info
        await this.renderRateLimitInfo(containerEl);

        // Render rate limit recommendations
        await this.renderRateLimitRecommendations(containerEl);
    }

    /**
     * Render rate limit input
     */
    private async renderRateLimitInput(containerEl: HTMLElement, context: RateLimitContext): Promise<void> {
        new Setting(containerEl)
            .setName('API Rate Limit (per minute)')
            .setDesc('Maximum number of API calls per minute to prevent rate limiting')
            .addText(text => {
                text.setPlaceholder('60');
                text.setValue(this.settings.apiRateLimitPerMinute?.toString() || '60');
                text.onChange(async (value) => {
                    await this.handleRateLimitChange(value, context);
                });
                
                // Add input validation
                text.inputEl.type = 'number';
                text.inputEl.min = '1';
                text.inputEl.max = '1000';
            });
    }

    /**
     * Handle rate limit change
     */
    private async handleRateLimitChange(value: string, context: RateLimitContext): Promise<void> {
        const numValue = parseInt(value);
        
        // Validate input
        if (isNaN(numValue) || numValue < 1 || numValue > 1000) {
            new Notice('Rate limit must be between 1 and 1000', 3000);
            return;
        }

        // Update settings
        this.settings.apiRateLimitPerMinute = numValue;
        await context.onSaveSettings();

        // Show feedback
        new Notice(`Rate limit set to ${numValue} requests per minute`, 3000);
    }

    /**
     * Render rate limit information
     */
    private async renderRateLimitInfo(containerEl: HTMLElement): Promise<void> {
        const infoContainer = containerEl.createEl('div', { cls: 'rate-limit-info' });
        
        infoContainer.createEl('h4', { text: 'Rate Limit Information' });
        
        const infoList = infoContainer.createEl('ul', { cls: 'rate-limit-info-list' });
        
        // Current setting
        const currentLimit = this.settings.apiRateLimitPerMinute || 60;
        infoList.createEl('li').innerHTML = `<strong>Current Setting:</strong> ${currentLimit} requests/minute`;
        
        // Calculated intervals
        const intervalSeconds = Math.ceil(60 / currentLimit);
        infoList.createEl('li').innerHTML = `<strong>Request Interval:</strong> ~${intervalSeconds} seconds between requests`;
        
        // Daily estimate
        const dailyEstimate = currentLimit * 60 * 24;
        infoList.createEl('li').innerHTML = `<strong>Daily Capacity:</strong> ~${dailyEstimate.toLocaleString()} requests`;
        
        // Monthly estimate
        const monthlyEstimate = dailyEstimate * 30;
        infoList.createEl('li').innerHTML = `<strong>Monthly Capacity:</strong> ~${monthlyEstimate.toLocaleString()} requests`;
    }

    /**
     * Render rate limit recommendations
     */
    private async renderRateLimitRecommendations(containerEl: HTMLElement): Promise<void> {
        const recommendationsContainer = containerEl.createEl('div', { cls: 'rate-limit-recommendations' });
        
        recommendationsContainer.createEl('h4', { text: 'Recommended Settings' });
        
        const recommendations = [
            {
                provider: 'OpenAI',
                free: 60,
                paid: 300,
                description: 'Standard tier: 60/min, Plus tier: 300/min'
            },
            {
                provider: 'Anthropic',
                free: 60,
                paid: 240,
                description: 'Free tier: 60/min, Pro tier: 240/min'
            },
            {
                provider: 'Ollama',
                free: 600,
                paid: 600,
                description: 'Local hosting: 600/min (hardware dependent)'
            },
            {
                provider: 'Cohere',
                free: 100,
                paid: 500,
                description: 'Free tier: 100/min, Production tier: 500/min'
            }
        ];

        const table = recommendationsContainer.createEl('table', { cls: 'rate-limit-table' });
        
        // Table header
        const header = table.createEl('thead').createEl('tr');
        header.createEl('th', { text: 'Provider' });
        header.createEl('th', { text: 'Free Tier' });
        header.createEl('th', { text: 'Paid Tier' });
        header.createEl('th', { text: 'Description' });
        
        // Table body
        const tbody = table.createEl('tbody');
        
        recommendations.forEach(rec => {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: rec.provider });
            row.createEl('td', { text: `${rec.free}/min` });
            row.createEl('td', { text: `${rec.paid}/min` });
            row.createEl('td', { text: rec.description });
        });

        // Add quick-set buttons
        const quickSetContainer = recommendationsContainer.createEl('div', { cls: 'quick-set-buttons' });
        quickSetContainer.createEl('p', { text: 'Quick Settings:' });
        
        const buttonContainer = quickSetContainer.createEl('div', { cls: 'button-group' });
        
        const quickSettings = [
            { label: 'Conservative (30/min)', value: 30 },
            { label: 'Standard (60/min)', value: 60 },
            { label: 'High (120/min)', value: 120 },
            { label: 'Maximum (300/min)', value: 300 }
        ];

        quickSettings.forEach(setting => {
            const button = buttonContainer.createEl('button', { 
                text: setting.label,
                cls: 'quick-set-button'
            });
            
            button.onclick = () => {
                this.settings.apiRateLimitPerMinute = setting.value;
                new Notice(`Rate limit set to ${setting.value} requests/minute`, 3000);
                
                // Update the input field
                const inputEl = containerEl.querySelector('input[type="number"]') as HTMLInputElement;
                if (inputEl) {
                    inputEl.value = setting.value.toString();
                }
            };
        });
    }

    /**
     * Get rate limit status
     */
    getRateLimitStatus(): {
        currentLimit: number;
        intervalSeconds: number;
        dailyCapacity: number;
        monthlyCapacity: number;
        isValid: boolean;
        recommendation?: string;
    } {
        const currentLimit = this.settings.apiRateLimitPerMinute || 60;
        const intervalSeconds = Math.ceil(60 / currentLimit);
        const dailyCapacity = currentLimit * 60 * 24;
        const monthlyCapacity = dailyCapacity * 30;
        
        let recommendation: string | undefined;
        
        if (currentLimit < 30) {
            recommendation = 'Consider increasing for better performance';
        } else if (currentLimit > 300) {
            recommendation = 'Very high rate - ensure your API plan supports this';
        }
        
        return {
            currentLimit,
            intervalSeconds,
            dailyCapacity,
            monthlyCapacity,
            isValid: currentLimit >= 1 && currentLimit <= 1000,
            recommendation
        };
    }

    /**
     * Validate rate limit setting
     */
    validateRateLimit(): {
        isValid: boolean;
        error?: string;
        warning?: string;
    } {
        const currentLimit = this.settings.apiRateLimitPerMinute;
        
        if (typeof currentLimit !== 'number') {
            return {
                isValid: false,
                error: 'Rate limit must be a number'
            };
        }
        
        if (currentLimit < 1) {
            return {
                isValid: false,
                error: 'Rate limit must be at least 1 request per minute'
            };
        }
        
        if (currentLimit > 1000) {
            return {
                isValid: false,
                error: 'Rate limit cannot exceed 1000 requests per minute'
            };
        }
        
        let warning: string | undefined;
        
        if (currentLimit > 500) {
            warning = 'High rate limit - ensure your API plan supports this';
        } else if (currentLimit < 10) {
            warning = 'Low rate limit may result in slow embedding generation';
        }
        
        return {
            isValid: true,
            warning
        };
    }
}