/**
 * Location: /src/core/commands/CommandDefinitions.ts
 * 
 * Command Definitions - Centralized command configuration
 * 
 * This module defines all maintenance commands in a data-driven way,
 * making it easy to add new commands without modifying core classes.
 */

import { Notice } from 'obsidian';
import type { IVectorStore } from '../../database/interfaces/IVectorStore';

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
        name: 'Repair vector collections',
        callback: async (context) => {
            try {
                const notice = new Notice('Repairing vector collections...', 0);
                
                const vectorStore = await context.getService<IVectorStore>('vectorStore', 15000);
                if (!vectorStore) {
                    notice.setMessage('Vector store not available or failed to initialize');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                if (typeof (vectorStore as any).repairCollections !== 'function') {
                    notice.setMessage('Repair function not available');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                const result = await (vectorStore as any).repairCollections();
                
                if (result.success) {
                    notice.setMessage(`Repair successful: ${result.repairedCollections.length} collections restored`);
                } else {
                    notice.setMessage(`Repair completed with issues: ${result.errors.length} errors`);
                    console.error('Collection repair errors:', result.errors);
                }
                
                setTimeout(() => notice.hide(), 5000);
            } catch (error) {
                new Notice(`Repair failed: ${(error as Error).message}`);
                console.error('Collection repair error:', error);
            }
        }
    },
    
    {
        id: 'cleanup-obsolete-collections',
        name: 'Clean up obsolete collections',
        callback: async (context) => {
            try {
                const notice = new Notice('Cleaning up obsolete collections...', 0);
                
                const vectorStore = await context.getService<IVectorStore>('vectorStore', 15000);
                if (!vectorStore) {
                    notice.setMessage('Vector store not available or failed to initialize');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                // Access the collection manager through the vector store
                const collectionManager = (vectorStore as any).collectionManager;
                if (!collectionManager || typeof collectionManager.cleanupObsoleteCollections !== 'function') {
                    notice.setMessage('Collection cleanup not available');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                const result = await collectionManager.cleanupObsoleteCollections();
                
                if (result.cleaned.length > 0) {
                    notice.setMessage(`Cleaned up ${result.cleaned.length} collections: ${result.cleaned.join(', ')}`);
                } else {
                    notice.setMessage('No obsolete collections found to clean up');
                }
                
                if (result.errors.length > 0) {
                    console.warn('Collection cleanup errors:', result.errors);
                }
                
                setTimeout(() => notice.hide(), 8000);
            } catch (error) {
                new Notice(`Cleanup failed: ${(error as Error).message}`);
                console.error('Collection cleanup error:', error);
            }
        }
    },
    
    {
        id: 'check-vector-storage',
        name: 'Check vector storage status',
        callback: async (context) => {
            try {
                const notice = new Notice('Checking vector storage...', 0);
                
                const vectorStore = await context.getService<IVectorStore>('vectorStore', 15000);
                if (!vectorStore) {
                    notice.setMessage('Vector store not available or failed to initialize');
                    setTimeout(() => notice.hide(), 5000);
                    return;
                }
                
                const diagnostics = await vectorStore.getDiagnostics();
                
                const message = [
                    `Storage mode: ${diagnostics.storageMode}`,
                    `Path: ${diagnostics.persistentPath}`,
                    `Collections: ${diagnostics.totalCollections}`,
                    `Directory exists: ${diagnostics.dataDirectoryExists ? 'Yes' : 'No'}`,
                    `Permissions OK: ${diagnostics.filePermissionsOk ? 'Yes' : 'No'}`
                ].join('\\n');
                
                notice.setMessage(message);
                
                setTimeout(() => notice.hide(), 10000);
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