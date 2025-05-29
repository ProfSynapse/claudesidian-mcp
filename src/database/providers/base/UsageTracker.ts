/**
 * Interface for tracking embedding usage and costs
 */
export interface IUsageTracker {
    trackUsage(tokenCount: number, model: string): Promise<void>;
    getTotalCost(): number;
    getModelUsage(): { [key: string]: number };
    getTokensThisMonth(): number;
    resetUsageStats(): Promise<void>;
}

/**
 * Usage tracking configuration
 */
export interface UsageTrackerConfig {
    costPerThousandTokens: { [model: string]: number };
    storageKey?: string;
    eventEmitter?: IEventEmitter;
}

/**
 * Simple event emitter interface
 */
export interface IEventEmitter {
    emit(event: string, data: any): void;
}

/**
 * Base implementation for tracking token usage and costs
 */
export class UsageTracker implements IUsageTracker {
    private modelUsage: { [model: string]: number } = {};
    private costPerThousandTokens: { [model: string]: number };
    private storageKey: string;
    private eventEmitter?: IEventEmitter;

    constructor(config: UsageTrackerConfig) {
        this.costPerThousandTokens = config.costPerThousandTokens;
        this.storageKey = config.storageKey || 'embedding-usage';
        this.eventEmitter = config.eventEmitter;
        
        // Load saved usage from storage
        this.loadUsageFromStorage();
    }

    /**
     * Load usage data from storage
     */
    private loadUsageFromStorage(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem(this.storageKey);
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = parsedUsage;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load usage from storage:', error);
        }
    }

    /**
     * Save usage data to storage
     */
    private async saveUsageToStorage(): Promise<void> {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.storageKey, JSON.stringify(this.modelUsage));
                
                // Dispatch storage event for other components
                this.dispatchStorageEvent();
                
                // Emit custom event if emitter is available
                if (this.eventEmitter) {
                    this.eventEmitter.emit('usage-updated', {
                        modelUsage: this.modelUsage,
                        tokensThisMonth: this.getTokensThisMonth(),
                        estimatedCost: this.getTotalCost()
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to save usage to storage:', error);
        }
    }

    /**
     * Dispatch storage event for cross-component communication
     */
    private dispatchStorageEvent(): void {
        try {
            if (typeof StorageEvent === 'function' && typeof window?.dispatchEvent === 'function') {
                window.dispatchEvent(new StorageEvent('storage', {
                    key: this.storageKey,
                    newValue: JSON.stringify(this.modelUsage),
                    storageArea: localStorage
                }));
            }
        } catch (error) {
            console.warn('Failed to dispatch storage event:', error);
        }
    }

    /**
     * Track token usage for a specific model
     */
    async trackUsage(tokenCount: number, model: string): Promise<void> {
        this.modelUsage[model] = (this.modelUsage[model] || 0) + tokenCount;
        await this.saveUsageToStorage();
        
        console.log(`Tracked ${tokenCount} tokens for model ${model}. Total: ${this.modelUsage[model]}`);
    }

    /**
     * Get total cost across all models
     */
    getTotalCost(): number {
        let totalCost = 0;
        
        for (const model in this.modelUsage) {
            const tokens = this.modelUsage[model];
            const costPerThousand = this.costPerThousandTokens[model] || 0;
            const modelCost = (tokens / 1000) * costPerThousand;
            totalCost += modelCost;
        }
        
        return totalCost;
    }

    /**
     * Get usage by model
     */
    getModelUsage(): { [key: string]: number } {
        return { ...this.modelUsage };
    }

    /**
     * Get total tokens used this month
     */
    getTokensThisMonth(): number {
        return Object.values(this.modelUsage).reduce((sum, count) => sum + count, 0);
    }

    /**
     * Reset all usage statistics
     */
    async resetUsageStats(): Promise<void> {
        this.modelUsage = {};
        await this.saveUsageToStorage();
        
        if (this.eventEmitter) {
            this.eventEmitter.emit('usage-reset', {
                modelUsage: this.modelUsage,
                tokensThisMonth: 0,
                estimatedCost: 0
            });
        }
    }

    /**
     * Get cost breakdown by model
     */
    getCostBreakdown(): { [model: string]: { tokens: number; cost: number } } {
        const breakdown: { [model: string]: { tokens: number; cost: number } } = {};
        
        for (const model in this.modelUsage) {
            const tokens = this.modelUsage[model];
            const costPerThousand = this.costPerThousandTokens[model] || 0;
            const cost = (tokens / 1000) * costPerThousand;
            
            breakdown[model] = { tokens, cost };
        }
        
        return breakdown;
    }
}