import { BaseMode } from '../../baseMode';
import { MemoryManagerAgent } from '../memoryManager';
import { MemoryUsageStats } from '../types';

/**
 * Get status mode for memory manager
 * Returns information about the current state of the memory system
 */
export class GetStatusMode extends BaseMode<{}, MemoryUsageStats | { enabled: false }> {
    private agent: MemoryManagerAgent;
    
    /**
     * Create a new get status mode
     * @param agent Memory manager agent
     */
    constructor(agent: MemoryManagerAgent) {
        super(
            'getStatus',
            'Get Memory Status',
            'Get the current status of the memory system',
            '1.0.0'
        );
        this.agent = agent;
    }
    
    /**
     * Execute the mode
     * @param params No parameters required
     * @returns Memory usage statistics or disabled state
     */
    async execute(params: {}): Promise<MemoryUsageStats | { enabled: false }> {
        try {
            // Check if memory is enabled
            if (!this.agent.isMemoryEnabled()) {
                return { enabled: false };
            }
            
            // For now, return placeholder data
            // In a real implementation, this would query the database for actual stats
            const stats: MemoryUsageStats = {
                itemCount: 0,
                totalTokens: 0,
                storageUsed: 0,
                lastIndexed: Date.now(),
                monthlyApiUsage: {
                    tokens: 0,
                    requests: 0,
                    lastReset: Date.now()
                }
            };
            
            return stats;
        } catch (error) {
            console.error('Error getting memory status', error);
            throw error;
        }
    }
    
    /**
     * Get parameter schema for this mode
     * @returns Parameter schema
     */
    getParameterSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {},
            required: []
        };
    }
    
    /**
     * Get result schema for this mode
     * @returns Result schema
     */
    getResultSchema(): Record<string, any> {
        return {
            oneOf: [
                {
                    type: 'object',
                    properties: {
                        enabled: {
                            type: 'boolean',
                            enum: [false]
                        }
                    },
                    required: ['enabled']
                },
                {
                    type: 'object',
                    properties: {
                        itemCount: { type: 'number' },
                        totalTokens: { type: 'number' },
                        storageUsed: { type: 'number' },
                        lastIndexed: { type: 'number' },
                        monthlyApiUsage: {
                            type: 'object',
                            properties: {
                                tokens: { type: 'number' },
                                requests: { type: 'number' },
                                lastReset: { type: 'number' }
                            },
                            required: ['tokens', 'requests', 'lastReset']
                        }
                    },
                    required: ['itemCount', 'totalTokens', 'storageUsed', 'lastIndexed', 'monthlyApiUsage']
                }
            ]
        };
    }
}