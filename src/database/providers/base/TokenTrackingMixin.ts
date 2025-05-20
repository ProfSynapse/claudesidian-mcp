/**
 * TokenTrackingMixin - Provides token tracking functionality for embedding providers
 * This is designed to be mixed into embedding provider classes to provide
 * consistent token usage tracking across different provider implementations.
 */
export class TokenTrackingMixin {
    protected modelUsage: {[key: string]: number} = {
        'text-embedding-3-small': 0,
        'text-embedding-3-large': 0
    };
    
    protected costPerThousandTokens: {[key: string]: number} = {
        // $0.02 per million = $0.00002 per thousand for text-embedding-3-small
        'text-embedding-3-small': 0.00002,
        // $0.13 per million = $0.00013 per thousand for text-embedding-3-large
        'text-embedding-3-large': 0.00013
    };
    
    /**
     * Initialize token tracking from localStorage if available
     */
    initializeTokenTracking(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    // Validate that it's an object with model keys
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = {
                            'text-embedding-3-small': parsedUsage['text-embedding-3-small'] || 0,
                            'text-embedding-3-large': parsedUsage['text-embedding-3-large'] || 0
                        };
                        console.log('Loaded token usage from localStorage:', this.modelUsage);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load token usage from localStorage:', error);
            // Continue with default model usage
        }
    }
    
    /**
     * Update token usage stats
     * @param tokenCount Number of tokens to add
     * @param model Model name to update (defaults to text-embedding-3-small)
     */
    async updateUsageStats(tokenCount: number, model: string = 'text-embedding-3-small'): Promise<void> {
        // Add to the specified model's usage count
        const currentUsage = this.modelUsage[model] || 0;
        this.modelUsage[model] = currentUsage + tokenCount;
        
        console.log(`Updated token usage for ${model}: ${currentUsage} + ${tokenCount} = ${this.modelUsage[model]}`);
        
        // Save to localStorage for persistence
        this.saveToLocalStorage();
        
        // Emit events
        this.emitTokenUsageEvents();
    }
    
    /**
     * Save current token usage to localStorage
     */
    protected saveToLocalStorage(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                console.log('Saved updated token usage to localStorage:', this.modelUsage);
                
                // Dispatch a storage event to notify other components
                try {
                    if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: 'claudesidian-tokens-used',
                            newValue: JSON.stringify(this.modelUsage),
                            storageArea: localStorage
                        }));
                        console.log('Dispatched storage event for token usage update');
                    }
                } catch (dispatchError) {
                    console.warn('Failed to dispatch storage event:', dispatchError);
                }
            }
        } catch (error) {
            console.warn('Failed to save token usage to localStorage:', error);
        }
    }
    
    /**
     * Emit token usage events using the plugin's event manager if available
     */
    protected emitTokenUsageEvents(): void {
        try {
            const app = (window as any).app;
            const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
            
            if (plugin?.eventManager?.emit) {
                plugin.eventManager.emit('token-usage-updated', {
                    modelUsage: this.modelUsage,
                    tokensThisMonth: this.getTokensThisMonth(),
                    estimatedCost: this.getTotalCost()
                });
                console.log('Emitted token-usage-updated event');
            }
        } catch (emitError) {
            console.warn('Failed to emit token usage event:', emitError);
        }
    }
    
    /**
     * Get total tokens used this month across all models
     */
    getTokensThisMonth(): number {
        let total = 0;
        for (const model in this.modelUsage) {
            total += this.modelUsage[model];
        }
        return total;
    }
    
    /**
     * Get model-specific usage stats
     */
    getModelUsage(): {[key: string]: number} {
        return { ...this.modelUsage };
    }
    
    /**
     * Get the total estimated cost based on token usage
     */
    getTotalCost(): number {
        let totalCost = 0;
        
        // Iterate through each model in the usage stats
        for (const model in this.modelUsage) {
            // Get the token count for this model
            const tokens = this.modelUsage[model];
            
            // Ensure the model has a cost defined
            const costPerThousand = this.costPerThousandTokens[model] || 0;
            
            // Calculate the cost for this model and add to the total
            // (tokens / 1000) * cost per thousand tokens
            const modelCost = (tokens / 1000) * costPerThousand;
            totalCost += modelCost;
        }
        
        return totalCost;
    }
    
    /**
     * Reset usage stats to zero
     */
    async resetUsageStats(): Promise<void> {
        // Reset all model usage to zero
        for (const model in this.modelUsage) {
            this.modelUsage[model] = 0;
        }
        
        // Save to localStorage
        this.saveToLocalStorage();
        
        // Emit reset event
        try {
            const app = (window as any).app;
            const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
            
            if (plugin?.eventManager?.emit) {
                plugin.eventManager.emit('token-usage-reset', {
                    modelUsage: this.modelUsage,
                    tokensThisMonth: 0,
                    estimatedCost: 0
                });
                console.log('Emitted token-usage-reset event');
            }
        } catch (emitError) {
            console.warn('Failed to emit token usage reset event:', emitError);
        }
    }
    
    /**
     * Estimate tokens for text using the 4 chars ≈ 1 token approximation
     */
    estimateTokenCount(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }
}