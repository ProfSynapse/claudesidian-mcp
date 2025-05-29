import { ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { ITokenUsageService } from '../interfaces/ITokenUsageService';
import { ModelCostMap } from '../interfaces/IUsageStatsService';
import { EventManager } from '../../services/EventManager';

/**
 * Token usage tracking and cost calculation
 */
export interface TokenUsageData {
  tokensThisMonth: number;
  estimatedCost: number;
  tokensAllTime: number;
  estimatedCostAllTime: number;
  modelUsage: ModelCostMap;
}

/**
 * Service for tracking token usage and calculating costs
 * Handles provider interactions, localStorage persistence, and cost calculations
 */
export class TokenUsageService implements ITokenUsageService {
  private eventManager: EventManager;
  private settings: any;
  private plugin: any;

  private defaultTokenUsage: TokenUsageData = {
    tokensThisMonth: 0,
    estimatedCost: 0,
    tokensAllTime: 0,
    estimatedCostAllTime: 0,
    modelUsage: {
      'text-embedding-3-small': 0,
      'text-embedding-3-large': 0
    }
  };

  constructor(settings: any, eventManager: EventManager, plugin: any) {
    this.settings = settings;
    this.eventManager = eventManager;
    this.plugin = plugin;
  }

  /**
   * Track token usage for a provider
   */
  async trackTokenUsage(tokens: number, model: string, provider?: ITokenTrackingProvider): Promise<void> {
    try {
      // Update provider stats if provider supports it
      if (provider && this.isTokenTrackingProvider(provider)) {
        await provider.updateUsageStats(tokens, model);
        console.log(`Updated provider token usage: +${tokens} tokens for ${model}`);
      }

      // Update all-time usage in localStorage
      await this.updateAllTimeStats(tokens, this.calculateCost(tokens, model));

      // Emit usage event
      this.emitUsageEvents(tokens, model);
    } catch (error) {
      console.error('Error tracking token usage:', error);
    }
  }

  /**
   * Update provider statistics
   */
  async updateProviderStats(provider: ITokenTrackingProvider, tokens: number, model: string): Promise<void> {
    try {
      if (this.isTokenTrackingProvider(provider)) {
        await provider.updateUsageStats(tokens, model);
        console.log(`Updated provider stats: +${tokens} tokens for ${model}`);
      }
    } catch (error) {
      console.error('Error updating provider stats:', error);
    }
  }

  /**
   * Update all-time statistics in localStorage
   */
  async updateAllTimeStats(tokens: number, cost: number): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') {
        console.warn('localStorage not available');
        return;
      }

      // Get current all-time stats
      const allTimeUsageStr = localStorage.getItem('claudesidian-tokens-all-time');
      let allTimeStats = {
        tokensAllTime: 0,
        estimatedCostAllTime: 0,
        lastUpdated: new Date().toISOString()
      };
      
      if (allTimeUsageStr) {
        try {
          const parsed = JSON.parse(allTimeUsageStr);
          if (typeof parsed === 'object' && parsed !== null) {
            allTimeStats = parsed;
          }
        } catch (parseError) {
          console.warn('Failed to parse all-time token usage:', parseError);
        }
      }
      
      // Add new tokens and cost
      allTimeStats.tokensAllTime += tokens;
      allTimeStats.estimatedCostAllTime += cost;
      allTimeStats.lastUpdated = new Date().toISOString();
      
      // Save updated stats
      localStorage.setItem('claudesidian-tokens-all-time', JSON.stringify(allTimeStats));
      console.log(`Updated all-time token usage: +${tokens} tokens, +$${cost.toFixed(6)} cost`);
      
      // Dispatch storage event
      if (typeof window !== 'undefined' && typeof StorageEvent === 'function') {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'claudesidian-tokens-all-time',
          newValue: JSON.stringify(allTimeStats),
          storageArea: localStorage
        }));
      }
    } catch (error) {
      console.error('Error updating all-time stats:', error);
    }
  }

  /**
   * Calculate cost for tokens and model
   */
  calculateCost(tokens: number, model: string): number {
    const costPerThousandTokens = this.settings.costPerThousandTokens || {
      'text-embedding-3-small': 0.00002,
      'text-embedding-3-large': 0.00013
    };
    
    const costPerThousand = costPerThousandTokens[model] || 0.00002;
    return (tokens / 1000) * costPerThousand;
  }

  /**
   * Get token usage from provider and localStorage
   */
  async getTokenUsage(provider?: ITokenTrackingProvider): Promise<TokenUsageData> {
    const usage = { ...this.defaultTokenUsage };

    try {
      // Load from localStorage first
      this.loadTokenStatsFromLocalStorage(usage);

      // Then try to get from provider if available
      if (provider && this.isTokenTrackingProvider(provider)) {
        try {
          usage.tokensThisMonth = provider.getTokensThisMonth();
          usage.estimatedCost = provider.getTotalCost();
          
          const modelUsage = provider.getModelUsage();
          if (modelUsage) {
            usage.modelUsage = { ...usage.modelUsage, ...modelUsage };
          }
          
          console.log('Loaded token usage from provider:', {
            tokensThisMonth: usage.tokensThisMonth,
            estimatedCost: usage.estimatedCost
          });
        } catch (providerError) {
          console.warn('Error getting usage from provider:', providerError);
        }
      }

      return usage;
    } catch (error) {
      console.error('Error getting token usage:', error);
      return usage;
    }
  }

  /**
   * Reset token usage statistics
   */
  async resetTokenUsage(provider?: ITokenTrackingProvider): Promise<void> {
    try {
      // Reset provider stats if available
      if (provider && this.isTokenTrackingProvider(provider)) {
        await provider.resetUsageStats();
        console.log('Reset provider token usage stats');
      }

      // Reset localStorage stats
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('claudesidian-tokens-used');
        localStorage.removeItem('claudesidian-token-usage');
        localStorage.removeItem('claudesidian-tokens-all-time');
        console.log('Reset localStorage token usage stats');
      }

      // Emit reset event
      this.eventManager.emit('token-usage-reset', null);
    } catch (error) {
      console.error('Error resetting token usage:', error);
    }
  }
  /**
   * Emit usage events
   */
  emitUsageEvents(tokens?: number, model?: string): void {
    this.eventManager.emit('token-usage-updated', {
      tokens,
      model,
      timestamp: Date.now()
    });
  }

  /**
   * Update last indexed date in settings
   */
  async updateLastIndexedDate(): Promise<void> {
    try {
      this.settings.lastIndexedDate = new Date().toISOString();
      await this.plugin.saveSettings();
      console.log('Updated last indexed date:', this.settings.lastIndexedDate);
    } catch (error) {
      console.error('Error updating last indexed date:', error);
    }
  }

  /**
   * Update token usage for operations
   */
  async updateTokenUsage(tokens: number, model: string, cost: number): Promise<void> {
    try {
      await this.trackTokenUsage(tokens, model);
      await this.updateAllTimeStats(tokens, cost);
      this.emitUsageEvents(tokens, model);
      console.log(`Updated token usage: ${tokens} tokens, $${cost.toFixed(6)} cost for model ${model}`);
    } catch (error) {
      console.error('Error updating token usage:', error);
    }
  }

  /**
   * Check if provider implements token tracking interface
   */
  private isTokenTrackingProvider(provider: any): provider is ITokenTrackingProvider {
    return (
      provider &&
      typeof provider.getTotalCost === 'function' &&
      typeof provider.getModelUsage === 'function' &&
      typeof provider.getTokensThisMonth === 'function' &&
      typeof provider.updateUsageStats === 'function' &&
      typeof provider.resetUsageStats === 'function'
    );
  }

  /**
   * Load token stats from localStorage
   */
  private loadTokenStatsFromLocalStorage(usage: TokenUsageData): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      // Try different localStorage keys for monthly usage
      const possibleMonthlyKeys = ['claudesidian-tokens-used', 'claudesidian-token-usage'];
      let parsedMonthlyUsage: any = null;
      
      for (const key of possibleMonthlyKeys) {
        const savedUsage = localStorage.getItem(key);
        if (savedUsage) {
          try {
            const parsed = JSON.parse(savedUsage);
            if (typeof parsed === 'object' && parsed !== null) {
              parsedMonthlyUsage = parsed;
              break;
            }
          } catch (parseError) {
            console.warn(`Failed to parse localStorage key '${key}':`, parseError);
          }
        }
      }
      
      // Load all-time usage stats
      const allTimeUsage = localStorage.getItem('claudesidian-tokens-all-time');
      let parsedAllTimeUsage: any = null;
      
      if (allTimeUsage) {
        try {
          parsedAllTimeUsage = JSON.parse(allTimeUsage);
        } catch (parseError) {
          console.warn('Failed to parse all-time token usage:', parseError);
        }
      }
      
      // Update usage with monthly data
      if (parsedMonthlyUsage) {
        for (const model in parsedMonthlyUsage) {
          if (typeof parsedMonthlyUsage[model] === 'number') {
            usage.modelUsage[model] = parsedMonthlyUsage[model];
          }
        }
        
        usage.tokensThisMonth = Object.values(usage.modelUsage).reduce((sum, count) => sum + count, 0);
        
        // Calculate cost
        const costPerThousandTokens = this.settings.costPerThousandTokens || {
          'text-embedding-3-small': 0.00002,
          'text-embedding-3-large': 0.00013
        };
        
        usage.estimatedCost = 0;
        for (const model in usage.modelUsage) {
          const tokens = usage.modelUsage[model];
          const costPerThousand = costPerThousandTokens[model] || 0;
          usage.estimatedCost += (tokens / 1000) * costPerThousand;
        }
      }
      
      // Update usage with all-time data
      if (parsedAllTimeUsage && typeof parsedAllTimeUsage.tokensAllTime === 'number') {
        usage.tokensAllTime = parsedAllTimeUsage.tokensAllTime;
        usage.estimatedCostAllTime = parsedAllTimeUsage.estimatedCostAllTime || 0;
      } else {
        // Initialize all-time with current monthly stats
        usage.tokensAllTime = usage.tokensThisMonth;
        usage.estimatedCostAllTime = usage.estimatedCost;
      }
      
    } catch (error) {
      console.warn('Failed to load token stats from localStorage:', error);
    }
  }
}
