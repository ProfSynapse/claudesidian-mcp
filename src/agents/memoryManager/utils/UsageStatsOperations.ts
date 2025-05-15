import { MemoryUsageStats } from '../../../types';

/**
 * Utility class for usage statistics operations related to memory management
 * Handles tracking, saving, loading, and resetting usage stats
 */
export class UsageStatsOperations {
    // Storage key for usage stats
    private static readonly STORAGE_KEY = 'claudesidian-memory-usage';
    
    /**
     * Save usage statistics to localStorage
     * 
     * @param usageStats The usage stats to save
     */
    static saveUsageStats(usageStats: MemoryUsageStats): void {
        try {
            localStorage.setItem(UsageStatsOperations.STORAGE_KEY, JSON.stringify({
                tokensThisMonth: usageStats.tokensThisMonth,
                lastReset: Date.now()
            }));
        } catch (error) {
            console.error('Error saving usage stats:', error);
        }
    }
    
    /**
     * Load usage statistics from localStorage
     * 
     * @param usageStats The usage stats object to update
     */
    static loadUsageStats(usageStats: MemoryUsageStats): void {
        try {
            const stats = localStorage.getItem(UsageStatsOperations.STORAGE_KEY);
            if (stats) {
                const parsed = JSON.parse(stats);
                
                // Check if we need to reset monthly tokens (if it's been more than a month)
                const lastReset = new Date(parsed.lastReset || 0);
                const now = new Date();
                const monthDiff = 
                    (now.getFullYear() - lastReset.getFullYear()) * 12 + 
                    now.getMonth() - lastReset.getMonth();
                
                if (monthDiff >= 1) {
                    // It's been at least a month, reset the counter
                    usageStats.tokensThisMonth = 0;
                    UsageStatsOperations.saveUsageStats(usageStats);
                } else {
                    usageStats.tokensThisMonth = parsed.tokensThisMonth || 0;
                }
            }
        } catch (error) {
            console.error('Error loading usage stats:', error);
        }
    }
    
    /**
     * Reset monthly token counter
     * 
     * @param usageStats The usage stats object to update
     */
    static resetUsageStats(usageStats: MemoryUsageStats): void {
        usageStats.tokensThisMonth = 0;
        UsageStatsOperations.saveUsageStats(usageStats);
    }
    
    /**
     * Update token usage statistics
     * 
     * @param usageStats The usage stats object to update
     * @param tokens Number of tokens to add to the counter
     * @param maxTokensPerMonth Maximum token limit per month
     * @returns Boolean indicating if the limit has been exceeded
     */
    static updateTokenUsage(
        usageStats: MemoryUsageStats, 
        tokens: number, 
        maxTokensPerMonth?: number
    ): boolean {
        usageStats.tokensThisMonth += tokens;
        UsageStatsOperations.saveUsageStats(usageStats);
        
        // Check if limit is exceeded (if a limit is provided)
        if (maxTokensPerMonth && usageStats.tokensThisMonth > maxTokensPerMonth) {
            return true; // Limit exceeded
        }
        
        return false; // Limit not exceeded or no limit provided
    }
    
    /**
     * Check if token usage has exceeded the limit
     * 
     * @param usageStats The usage stats object to check
     * @param maxTokensPerMonth Maximum token limit per month
     * @returns Boolean indicating if the limit has been exceeded
     */
    static isTokenLimitExceeded(
        usageStats: MemoryUsageStats, 
        maxTokensPerMonth: number
    ): boolean {
        return usageStats.tokensThisMonth >= maxTokensPerMonth;
    }
    
    /**
     * Update the last indexed time
     * 
     * @param usageStats The usage stats object to update
     */
    static updateLastIndexedTime(usageStats: MemoryUsageStats): void {
        const now = new Date();
        usageStats.lastIndexedDate = now.toISOString();
    }
    
    /**
     * Set indexing in progress status
     * 
     * @param usageStats The usage stats object to update
     * @param inProgress Whether indexing is in progress
     */
    static setIndexingInProgress(usageStats: MemoryUsageStats, inProgress: boolean): void {
        usageStats.indexingInProgress = inProgress;
    }
    
    /**
     * Create a snapshot of usage stats for returning to clients
     * 
     * @param usageStats The usage stats to snapshot
     * @param maxTokensPerMonth The maximum tokens per month setting
     * @returns A new usage stats object with derived fields
     */
    static createUsageSnapshot(
        usageStats: MemoryUsageStats,
        maxTokensPerMonth: number
    ): {
        enabled: boolean,
        provider: string,
        model: string,
        dimensions: number,
        totalEmbeddings: number,
        tokenUsage: {
            tokensThisMonth: number,
            maxTokensPerMonth: number,
            percentUsed: number
        },
        dbSizeMB: number,
        lastIndexed: string,
        indexingInProgress: boolean
    } {
        return {
            enabled: true, // This will be overridden by the caller
            provider: '', // This will be overridden by the caller
            model: '',    // This will be overridden by the caller
            dimensions: 0, // This will be overridden by the caller
            totalEmbeddings: usageStats.totalEmbeddings,
            tokenUsage: {
                tokensThisMonth: usageStats.tokensThisMonth,
                maxTokensPerMonth: maxTokensPerMonth,
                percentUsed: (usageStats.tokensThisMonth / maxTokensPerMonth) * 100
            },
            dbSizeMB: usageStats.dbSizeMB,
            lastIndexed: usageStats.lastIndexedDate,
            indexingInProgress: usageStats.indexingInProgress
        };
    }
}