import { BaseMode } from '../../baseMode';
import { MemoryManager } from '../memoryManager';
import { StatusParams, StatusResult } from '../types';
import { schema } from '../config';

/**
 * Mode for getting memory manager status
 * Returns information about the memory system
 */
export class GetStatusMode extends BaseMode<StatusParams, StatusResult> {
    constructor(private memoryManager: MemoryManager) {
        super('get-status', 'Get Memory Status', 'Retrieves the current status of the memory system', '1.0.0');
    }

    /**
     * Execute the get status mode
     * 
     * @param params Status parameters (none required)
     * @returns Status result
     */
    async execute(params: StatusParams): Promise<StatusResult> {
        try {
            // Get memory manager status information
            const usageStats = this.memoryManager.getUsageStats();
            
            // Get settings
            const settings = this.memoryManager['settings'];
            
            return {
                enabled: settings.enabled,
                provider: settings.apiProvider,
                model: settings.embeddingModel,
                dimensions: settings.dimensions,
                totalEmbeddings: usageStats.totalEmbeddings,
                tokenUsage: {
                    tokensThisMonth: usageStats.tokensThisMonth,
                    maxTokensPerMonth: settings.maxTokensPerMonth,
                    percentUsed: (usageStats.tokensThisMonth / settings.maxTokensPerMonth) * 100
                },
                dbSizeMB: usageStats.dbSizeMB,
                lastIndexed: usageStats.lastIndexedDate,
                indexingInProgress: usageStats.indexingInProgress
            };
        } catch (error) {
            console.error('Error getting memory status:', error);
            throw error;
        }
    }

    /**
     * Get parameter JSON schema
     */
    getParameterSchema(): Record<string, any> {
        return schema.statusParams;
    }

    /**
     * Get result JSON schema
     */
    getResultSchema(): Record<string, any> {
        return schema.statusResults;
    }
}