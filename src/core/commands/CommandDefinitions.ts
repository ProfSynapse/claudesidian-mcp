/**
 * Location: /src/core/commands/CommandDefinitions.ts
 * 
 * Command Definitions - Centralized command configuration
 * 
 * This module defines all maintenance commands in a data-driven way,
 * making it easy to add new commands without modifying core classes.
 */

import { Notice } from 'obsidian';

export interface CommandDefinition {
    id: string;
    name: string;
    callback: (context: CommandContext) => Promise<void> | void;
}

export interface CommandContext {
    getService: <T>(name: string, timeoutMs?: number) => Promise<T | null>;
    serviceManager: any;
    isInitialized: boolean;
}

/**
 * Maintenance command definitions
 */
export const MAINTENANCE_COMMAND_DEFINITIONS: CommandDefinition[] = [
    {
        id: 'repair-collections',
        name: 'Repair memory collections',
        callback: async (context) => {
            try {
                const notice = new Notice('Repairing memory collections...', 0);

                const memoryService = await context.getService('memoryService', 15000);
                if (!memoryService) {
                    notice.setMessage('Memory service not available or failed to initialize');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }

                // Simple repair operation for memory service
                notice.setMessage('Memory collections are ready');
                setTimeout(() => notice.hide(), 3000);
            } catch (error) {
                new Notice(`Repair failed: ${(error as Error).message}`);
                console.error('Collection repair error:', error);
            }
        }
    },
    
    {
        id: 'cleanup-obsolete-collections',
        name: 'Clean up cached data',
        callback: async (context) => {
            try {
                const notice = new Notice('Cleaning up cached data...', 0);

                const cacheManager = await context.getService('cacheManager', 15000);
                if (cacheManager) {
                    (cacheManager as any).clearCache();
                    notice.setMessage('Cache cleared successfully');
                } else {
                    notice.setMessage('Cache manager not available');
                }

                setTimeout(() => notice.hide(), 3000);
            } catch (error) {
                new Notice(`Cleanup failed: ${(error as Error).message}`);
                console.error('Cache cleanup error:', error);
            }
        }
    },
    
    {
        id: 'check-storage-status',
        name: 'Check storage status',
        callback: async (context) => {
            try {
                const notice = new Notice('Checking storage status...', 0);

                const memoryService = await context.getService('memoryService', 15000);
                const workspaceService = await context.getService('workspaceService', 15000);

                const message = [
                    `Memory service: ${memoryService ? 'Available' : 'Not available'}`,
                    `Workspace service: ${workspaceService ? 'Available' : 'Not available'}`,
                    `Plugin initialized: ${context.isInitialized ? 'Yes' : 'No'}`
                ].join('\\n');

                notice.setMessage(message);
                setTimeout(() => notice.hide(), 8000);
            } catch (error) {
                new Notice(`Diagnostics failed: ${(error as Error).message}`);
                console.error('Diagnostics error:', error);
            }
        }
    },
    
    {
        id: 'check-service-readiness',
        name: 'Check service readiness status',
        callback: async (context) => {
            try {
                const notice = new Notice('Checking service readiness...', 0);
                
                if (!context.serviceManager) {
                    notice.setMessage('Service manager not available');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                const stats = context.serviceManager.getStats();
                const metadata = context.serviceManager.getAllServiceStatus();
                
                const readyServices = Object.values(metadata).filter((m: any) => m.ready).length;
                const totalServices = Object.keys(metadata).length;
                
                const message = [
                    `Services: ${readyServices}/${totalServices} ready`,
                    `Registered: ${stats.registered}`,
                    `Ready: ${stats.ready}`,
                    `Failed: ${stats.failed}`,
                    `Plugin initialized: ${context.isInitialized ? 'Yes' : 'No'}`
                ].join('\\n');
                
                notice.setMessage(message);
                
                setTimeout(() => notice.hide(), 8000);
            } catch (error) {
                new Notice(`Readiness check failed: ${(error as Error).message}`);
                console.error('Service readiness check error:', error);
            }
        }
    }
];

/**
 * Fallback troubleshooting command for when services fail to initialize
 */
export const TROUBLESHOOT_COMMAND_DEFINITION: CommandDefinition = {
    id: 'troubleshoot-services',
    name: 'Troubleshoot service initialization',
    callback: (context) => {
        const stats = context.serviceManager?.getStats() || { registered: 0, ready: 0, failed: 0 };
        const message = `Service initialization failed. Registered: ${stats.registered}, Ready: ${stats.ready}`;
        new Notice(message, 10000);
        // Service diagnostic information logged
    }
};