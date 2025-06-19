/**
 * TokenTrackingMixin - Provides token tracking functionality for embedding providers
 * This is designed to be mixed into embedding provider classes to provide
 * consistent token usage tracking across different provider implementations.
 */
export class TokenTrackingMixin {
    protected modelUsage: {[key: string]: number} = {};
    
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
     */
    initializeTokenTracking(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    // Validate that it's an object with model keys
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = { ...parsedUsage };
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
     * Reset usage stats to zero
     */
    async resetUsageStats(): Promise<void> {
        // Reset all model usage to zero
        this.modelUsage = {};
        
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