/**
 * TokenTrackingMixin - Provides token tracking functionality for embedding providers
 * This is designed to be mixed into embedding provider classes to provide
 * consistent token usage tracking across different provider implementations.
 */
export class TokenTrackingMixin {
    protected modelUsage: {[key: string]: number} = {};
    protected currentProvider: string | null = null;
    
    protected costPerThousandTokens: {[key: string]: number} = {
        // OpenAI models (2025 pricing)
        'text-embedding-3-small': 0.00002,      // $0.02/million tokens
        'text-embedding-3-large': 0.00013,      // $0.13/million tokens  
        'text-embedding-ada-002': 0.0001,       // $0.10/million tokens
        
        // Mistral models (2025 pricing)
        'mistral-embed': 0.00001,               // $0.01/million tokens
        'codestral-embed-2505': 0.00015,        // $0.15/million tokens
        
        // Cohere models (2025 pricing) 
        'embed-english-v3.0': 0.0001,           // $0.10/million tokens
        'embed-multilingual-v3.0': 0.0001,      // $0.10/million tokens
        'embed-english-light-v3.0': 0.0001,     // $0.10/million tokens
        'embed-multilingual-light-v3.0': 0.0001, // $0.10/million tokens
        'embed-english-v2.0': 0.0001,           // $0.10/million tokens
        'embed-multilingual-v2.0': 0.0001,      // $0.10/million tokens
        
        // VoyageAI models (2025 pricing)
        'voyage-3-large': 0.00006,              // $0.06/million tokens
        'voyage-3.5': 0.00006,                  // $0.06/million tokens
        'voyage-3': 0.00006,                    // $0.06/million tokens
        'voyage-3.5-lite': 0.00002,             // $0.02/million tokens
        'voyage-3-lite': 0.00002,               // $0.02/million tokens
        'voyage-large-2-instruct': 0.00006,     // $0.06/million tokens (estimated)
        'voyage-code-2': 0.00006,               // $0.06/million tokens (estimated)
        'voyage-multilingual-2': 0.00006,       // $0.06/million tokens (estimated)
        
        // Google Gemini models (2025 pricing)
        'models/text-embedding-004': 0,         // Free
        'models/embedding-001': 0,              // Free
        'models/gemini-embedding-001': 0,       // Free
        'models/gemini-embedding-exp-03-07': 0, // Free
        
        // Jina AI models (2025 pricing - estimated based on competitive pricing)
        'jina-embeddings-v3': 0.0001,           // $0.10/million tokens (estimated)
        'jina-embeddings-v2-base-en': 0.00005,  // $0.05/million tokens (estimated)
        'jina-embeddings-v2-base-zh': 0.00005,  // $0.05/million tokens (estimated)
        'jina-embeddings-v2-base-de': 0.00005,  // $0.05/million tokens (estimated)
        'jina-embeddings-v2-base-es': 0.00005,  // $0.05/million tokens (estimated)
        'jina-embeddings-v2-base-code': 0.00005, // $0.05/million tokens (estimated)
        'jina-embeddings-v2-small-en': 0.00002, // $0.02/million tokens (estimated)
        
        // Ollama models (local - free)
        'nomic-embed-text': 0,                  // Free (local)
        'nomic-embed-text:latest': 0,           // Free (local)
        'mxbai-embed-large': 0,                 // Free (local)
        'all-minilm': 0,                        // Free (local)
        'snowflake-arctic-embed': 0,            // Free (local)
        
        // Default fallback cost
        'default': 0.0001
    };
    
    /**
     * Initialize token tracking from localStorage if available
     * @param provider The current embedding provider name
     */
    initializeTokenTracking(provider?: string): void {
        this.currentProvider = provider || null;
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    // Validate that it's an object with model keys
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = { ...parsedUsage };
                        // console.log('Loaded token usage from localStorage:', this.modelUsage);
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
     * @param provider Optional provider override
     */
    async updateUsageStats(tokenCount: number, model = 'text-embedding-3-small', provider?: string): Promise<void> {
        const actualProvider = provider || this.currentProvider;
        // Add to the specified model's usage count
        const currentUsage = this.modelUsage[model] || 0;
        this.modelUsage[model] = currentUsage + tokenCount;
        
        // Save to localStorage for persistence
        this.saveToLocalStorage();
        
        // Update all-time stats in real-time
        this.updateAllTimeStats(tokenCount, model, actualProvider || undefined);
        
        // Emit events
        this.emitTokenUsageEvents();
    }
    
    /**
     * Update all-time stats in real-time
     * @param tokenCount Number of tokens to add
     * @param model Model name used
     * @param provider Provider name used
     */
    protected updateAllTimeStats(tokenCount: number, model: string, provider?: string): void {
        try {
            if (typeof localStorage !== 'undefined') {
                // Get current all-time stats
                const allTimeKey = 'claudesidian-tokens-all-time';
                const savedStats = localStorage.getItem(allTimeKey);
                let allTimeStats = {
                    tokensAllTime: 0,
                    estimatedCostAllTime: 0,
                    lastUpdated: new Date().toISOString()
                };
                
                if (savedStats) {
                    try {
                        const parsed = JSON.parse(savedStats);
                        if (typeof parsed === 'object' && parsed !== null) {
                            allTimeStats = parsed;
                        }
                    } catch (error) {
                        console.warn('Failed to parse all-time stats:', error);
                    }
                }
                
                // Calculate cost for this update - with provider-based logic
                let costPerThousand = this.getProviderCostPerThousand(model, provider);
                const cost = (tokenCount / 1000) * costPerThousand;
                
                // Update all-time stats
                allTimeStats.tokensAllTime += tokenCount;
                allTimeStats.estimatedCostAllTime += cost;
                allTimeStats.lastUpdated = new Date().toISOString();
                
                // Save updated stats
                localStorage.setItem(allTimeKey, JSON.stringify(allTimeStats));
                // Only log when using paid models to reduce noise from free services
                if (costPerThousand > 0) {
                    console.log(`Updated stats: +${tokenCount} tokens, +$${cost.toFixed(6)}. Total: ${allTimeStats.tokensAllTime} tokens, $${allTimeStats.estimatedCostAllTime.toFixed(6)}`);
                }
            }
        } catch (error) {
            console.warn('Failed to update all-time stats:', error);
        }
    }

    /**
     * Save current token usage to localStorage
     */
    protected saveToLocalStorage(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                
                // Dispatch a storage event to notify other components
                try {
                    if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: 'claudesidian-tokens-used',
                            newValue: JSON.stringify(this.modelUsage),
                            storageArea: localStorage
                        }));
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
     * NOTE: Disabled to prevent event loops. Token updates are now manual.
     */
    protected emitTokenUsageEvents(): void {
        // We've completely disabled automatic token usage event emission
        // to prevent recursion issues. Token usage is now updated
        // manually via refresh buttons in the UI.
        
        // DISABLED code below to prevent event loops:
        /*
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
        */
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
            
            // Ensure the model has a cost defined, use default if not found
            const costPerThousand = this.costPerThousandTokens[model] || this.costPerThousandTokens['default'] || 0;
            
            // Calculate the cost for this model and add to the total
            // (tokens / 1000) * cost per thousand tokens
            const modelCost = (tokens / 1000) * costPerThousand;
            totalCost += modelCost;
        }
        
        return totalCost;
    }
    
    /**
     * Reset usage stats to zero (monthly stats only, not all-time)
     */
    async resetUsageStats(): Promise<void> {
        // Reset all model usage to zero
        this.modelUsage = {};
        
        // Save to localStorage
        this.saveToLocalStorage();
        
        // Update the current month marker to prevent auto-reset
        try {
            if (typeof localStorage !== 'undefined') {
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
                localStorage.setItem('claudesidian-current-month', currentMonth);
            }
        } catch (error) {
            console.warn('Failed to update month marker:', error);
        }
        
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
     * Get cost per thousand tokens based on provider and model
     * Special case: Ollama provider is always free regardless of model
     * @param model Model name
     * @param provider Provider name
     * @returns Cost per thousand tokens
     */
    protected getProviderCostPerThousand(model: string, provider?: string): number {
        // Special case: Ollama provider is always free
        if (provider?.toLowerCase() === 'ollama') {
            return 0;
        }
        
        // For all other providers, use model-specific pricing
        let costPerThousand = this.costPerThousandTokens[model];
        
        // If model not found, check if it's a known free model or use default
        if (costPerThousand === undefined) {
            const modelLower = model.toLowerCase();
            if (modelLower.includes('ollama') || 
                modelLower.includes('nomic') || 
                modelLower.includes('mxbai') || 
                modelLower.includes('minilm') || 
                modelLower.includes('arctic') ||
                modelLower.includes('local') ||
                modelLower.startsWith('llama') ||
                modelLower.includes('snowflake') ||
                (modelLower.includes('mistral') && modelLower.includes('local')) ||
                modelLower === 'all-minilm') {
                costPerThousand = 0; // Free for local models
            } else {
                costPerThousand = this.costPerThousandTokens['default'] || 0.0001;
            }
        }
        
        return costPerThousand;
    }
    
    /**
     * Get display name for provider
     * @param provider Provider name
     * @returns Formatted provider name
     */
    getProviderDisplayName(provider?: string): string {
        if (!provider) return 'Unknown';
        
        const providerMap: { [key: string]: string } = {
            'ollama': 'Ollama',
            'openai': 'OpenAI',
            'anthropic': 'Anthropic',
            'google': 'Google',
            'mistral': 'Mistral',
            'cohere': 'Cohere',
            'voyageai': 'VoyageAI',
            'jina': 'Jina AI'
        };
        
        return providerMap[provider.toLowerCase()] || provider.charAt(0).toUpperCase() + provider.slice(1);
    }
    
    /**
     * Estimate tokens for text using the 4 chars ≈ 1 token approximation
     */
    estimateTokenCount(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }
}