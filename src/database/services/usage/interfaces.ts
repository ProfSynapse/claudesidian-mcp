import { UsageStats, ModelCostMap, CollectionStat } from '../UsageStatsService';

export interface ITokenStatsHandler {
    updateTokenStats(stats: UsageStats): Promise<void>;
    resetTokenStats(): Promise<void>;
    updateTokenUsage(tokenCount: number, model?: string): Promise<void>;
}

export interface ICollectionStatsHandler {
    updateCollectionStats(stats: UsageStats): Promise<void>;
}

export interface ILocalStorageManager {
    loadTokenStats(): Promise<{
        modelUsage: ModelCostMap;
        tokensThisMonth: number;
        estimatedCost: number;
        tokensAllTime: number;
        estimatedCostAllTime: number;
    }>;
    saveAllTimeStats(tokensAllTime: number, estimatedCostAllTime: number): Promise<void>;
    updateAllTimeStats(tokenCount: number, cost: number): Promise<void>;
}

export interface IProviderCapabilityChecker {
    isTokenTrackingProvider(provider: any): boolean;
    hasMethod(provider: any, methodName: string): boolean;
}

export interface IRefreshManager {
    canRefresh(): boolean;
    startRefresh(): void;
    endRefresh(): void;
    getLastRefreshTime(): number;
}