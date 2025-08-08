import { ModelCostMap } from './UsageStatsService';
import { ILocalStorageManager } from './interfaces';

export class LocalStorageManager implements ILocalStorageManager {
    private readonly monthlyKeys = ['claudesidian-tokens-used', 'claudesidian-token-usage'];
    private readonly allTimeKey = 'claudesidian-tokens-all-time';
    private readonly monthInfoKey = 'claudesidian-current-month';

    constructor(private settings: any) {}

    async loadTokenStats(): Promise<{
        modelUsage: ModelCostMap;
        tokensThisMonth: number;
        estimatedCost: number;
        tokensAllTime: number;
        estimatedCostAllTime: number;
    }> {
        const result = {
            modelUsage: {} as ModelCostMap,
            tokensThisMonth: 0,
            estimatedCost: 0,
            tokensAllTime: 0,
            estimatedCostAllTime: 0
        };

        if (typeof localStorage === 'undefined') {
            console.log('localStorage not available');
            return result;
        }

        try {
            // Check if we need to reset monthly stats
            await this.checkAndResetMonthlyStats();

            // Load monthly usage
            const monthlyUsage = this.loadMonthlyUsage();
            if (monthlyUsage) {
                result.modelUsage = monthlyUsage;
                result.tokensThisMonth = this.calculateTotalTokens(monthlyUsage);
                result.estimatedCost = this.calculateCost(monthlyUsage);
            }

            // Load all-time usage
            const allTimeUsage = this.loadAllTimeUsage();
            if (allTimeUsage) {
                result.tokensAllTime = allTimeUsage.tokensAllTime;
                result.estimatedCostAllTime = allTimeUsage.estimatedCostAllTime;
            } else {
                // Initialize all-time stats to 0 if they don't exist
                result.tokensAllTime = 0;
                result.estimatedCostAllTime = 0;
                await this.saveAllTimeStats(0, 0);
            }

            return result;
        } catch (error) {
            console.warn('Failed to load token usage from localStorage:', error);
            return result;
        }
    }

    async saveAllTimeStats(tokensAllTime: number, estimatedCostAllTime: number): Promise<void> {
        if (typeof localStorage === 'undefined') return;

        try {
            const allTimeStats = {
                tokensAllTime,
                estimatedCostAllTime,
                lastUpdated: new Date().toISOString()
            };

            localStorage.setItem(this.allTimeKey, JSON.stringify(allTimeStats));
            console.log('Saved all-time token usage stats to localStorage');
        } catch (error) {
            console.warn('Failed to save all-time token usage to localStorage:', error);
        }
    }

    async updateAllTimeStats(tokenCount: number, cost: number): Promise<void> {
        if (typeof localStorage === 'undefined') return;

        try {
            const current = this.loadAllTimeUsage() || {
                tokensAllTime: 0,
                estimatedCostAllTime: 0,
                lastUpdated: new Date().toISOString()
            };

            current.tokensAllTime += tokenCount;
            current.estimatedCostAllTime += cost;
            current.lastUpdated = new Date().toISOString();

            localStorage.setItem(this.allTimeKey, JSON.stringify(current));
            console.log(`Updated all-time token usage: +${tokenCount} tokens, +$${cost.toFixed(6)} cost. New total: ${current.tokensAllTime} tokens, $${current.estimatedCostAllTime.toFixed(6)} cost`);
        } catch (error) {
            console.warn('Failed to update all-time token usage:', error);
        }
    }

    private loadMonthlyUsage(): ModelCostMap | null {
        for (const key of this.monthlyKeys) {
            const saved = localStorage.getItem(key);
            console.log(`Checking localStorage key '${key}':`, saved ? 'found' : 'not found');

            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (typeof parsed === 'object' && parsed !== null) {
                        console.log(`Successfully parsed token usage from key '${key}':`, parsed);
                        return this.validateModelUsage(parsed);
                    }
                } catch (error) {
                    console.warn(`Failed to parse token usage from key '${key}':`, error);
                }
            }
        }
        return null;
    }

    private loadAllTimeUsage(): { tokensAllTime: number; estimatedCostAllTime: number; lastUpdated: string } | null {
        const saved = localStorage.getItem(this.allTimeKey);
        if (!saved) {
            console.log("All-time token usage not found in localStorage");
            return null;
        }

        try {
            const parsed = JSON.parse(saved);
            if (typeof parsed === 'object' && parsed !== null && typeof parsed.tokensAllTime === 'number') {
                console.log('Successfully parsed all-time token usage:', parsed);
                return parsed;
            }
        } catch (error) {
            console.warn('Failed to parse all-time token usage:', error);
        }
        return null;
    }

    private validateModelUsage(usage: any): ModelCostMap {
        const validated: ModelCostMap = {};
        for (const model in usage) {
            if (typeof usage[model] === 'number') {
                validated[model] = usage[model];
            }
        }
        return validated;
    }

    private calculateTotalTokens(modelUsage: ModelCostMap): number {
        return Object.values(modelUsage).reduce((sum, count) => sum + count, 0);
    }

    private calculateCost(modelUsage: ModelCostMap): number {
        const costPerThousandTokens = this.settings.costPerThousandTokens || {
            'text-embedding-3-small': 0.00002,
            'text-embedding-3-large': 0.00013
        };

        let totalCost = 0;
        for (const model in modelUsage) {
            const tokens = modelUsage[model];
            const costPerThousand = costPerThousandTokens[model] || 0;
            totalCost += (tokens / 1000) * costPerThousand;
        }
        return totalCost;
    }

    private async checkAndResetMonthlyStats(): Promise<void> {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
        
        const savedMonth = localStorage.getItem(this.monthInfoKey);
        
        if (savedMonth !== currentMonth) {
            console.log(`New month detected (${savedMonth} -> ${currentMonth}), resetting monthly stats`);
            
            // Reset monthly stats
            for (const key of this.monthlyKeys) {
                localStorage.setItem(key, '{}');
            }
            
            // Update the current month
            localStorage.setItem(this.monthInfoKey, currentMonth);
        }
    }
}