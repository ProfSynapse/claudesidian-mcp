import { EmbeddingService } from '../EmbeddingService';
import { UsageStats } from '../UsageStatsService';
import { ITokenStatsHandler, ILocalStorageManager, IProviderCapabilityChecker } from './interfaces';
import { ITokenTrackingProvider } from '../../interfaces/IEmbeddingProvider';

export class TokenStatsHandler implements ITokenStatsHandler {
    constructor(
        private embeddingService: EmbeddingService | null,
        private localStorageManager: ILocalStorageManager,
        private capabilityChecker: IProviderCapabilityChecker,
        private settings: any
    ) {}

    async updateTokenStats(stats: UsageStats): Promise<void> {
        try {
            // Load from localStorage first
            const localStats = await this.localStorageManager.loadTokenStats();
            
            // Update stats with localStorage data
            stats.modelUsage = localStats.modelUsage;
            stats.tokensThisMonth = localStats.tokensThisMonth;
            stats.estimatedCost = localStats.estimatedCost;
            stats.tokensAllTime = localStats.tokensAllTime;
            stats.estimatedCostAllTime = localStats.estimatedCostAllTime;

            // Try to get from provider if available
            const provider = this.getProvider();
            if (provider) {
                await this.updateFromProvider(stats, provider);
            }

            console.log('Updated token stats:', {
                tokensThisMonth: stats.tokensThisMonth,
                estimatedCost: stats.estimatedCost,
                modelUsage: stats.modelUsage
            });
        } catch (error) {
            console.error('Error updating token stats:', error);
        }
    }

    async resetTokenStats(): Promise<void> {
        const provider = this.getProvider();
        if (!provider) return;

        try {
            if (this.capabilityChecker.isTokenTrackingProvider(provider)) {
                await provider.resetUsageStats();
            } else if (this.capabilityChecker.hasMethod(provider, 'resetUsageStats')) {
                await (provider as any).resetUsageStats();
                console.log('Reset usage stats using fallback method');
            } else {
                console.warn('Provider does not support resetUsageStats method');
            }
        } catch (error) {
            console.error('Error resetting token stats:', error);
        }
    }

    async updateTokenUsage(tokenCount: number, model?: string): Promise<void> {
        const provider = this.getProvider();
        if (!provider) return;

        try {
            // Update through provider (which now handles all-time stats internally)
            if (this.capabilityChecker.isTokenTrackingProvider(provider)) {
                await provider.updateUsageStats(tokenCount, model);
            } else if (this.capabilityChecker.hasMethod(provider, 'updateUsageStats')) {
                await (provider as any).updateUsageStats(tokenCount, model);
                console.log(`Updated token usage stats using fallback method: +${tokenCount} tokens`);
            } else {
                console.warn('Provider does not support updateUsageStats method');
            }
        } catch (error) {
            console.error('Error updating token usage:', error);
        }
    }

    private getProvider(): any | null {
        if (!this.embeddingService) {
            console.warn('EmbeddingService not available');
            return null;
        }

        const provider = this.embeddingService.getProvider();
        if (!provider) {
            console.log('Provider not available');
            return null;
        }

        return provider;
    }

    private async updateFromProvider(stats: UsageStats, provider: any): Promise<void> {
        if (this.capabilityChecker.isTokenTrackingProvider(provider)) {
            const trackingProvider = provider as ITokenTrackingProvider;
            stats.estimatedCost = trackingProvider.getTotalCost() || stats.estimatedCost;
            stats.modelUsage = trackingProvider.getModelUsage() || stats.modelUsage;
            stats.tokensThisMonth = trackingProvider.getTokensThisMonth() || stats.tokensThisMonth;
        } else {
            // Fallback for backward compatibility
            if (this.capabilityChecker.hasMethod(provider, 'getTotalCost')) {
                stats.estimatedCost = provider.getTotalCost() || stats.estimatedCost;
            }

            if (this.capabilityChecker.hasMethod(provider, 'getModelUsage')) {
                stats.modelUsage = provider.getModelUsage() || stats.modelUsage;
            } else if (provider.modelUsage) {
                stats.modelUsage = { ...provider.modelUsage };
            }

            if (this.capabilityChecker.hasMethod(provider, 'getTokensThisMonth')) {
                stats.tokensThisMonth = provider.getTokensThisMonth() || stats.tokensThisMonth;
            } else {
                stats.tokensThisMonth = Object.values(stats.modelUsage || {}).reduce((sum, count) => sum + count, 0);
            }
        }
    }
}