import { Plugin } from 'obsidian';
import { promises as fs } from 'fs';
import { join } from 'path';
import { IFileEventQueue, FileEvent } from '../interfaces/IFileEventServices';

export class FileEventQueue implements IFileEventQueue {
    private queue: Map<string, FileEvent> = new Map();
    private persistencePath: string;

    constructor(private plugin: Plugin) {
        // Create persistence path for queue storage
        // Note: this.plugin.app.vault.adapter.path might not exist in all adapters
        // Using a safer approach
        this.persistencePath = join(
            (this.plugin.app.vault.adapter as any).basePath || 
            (this.plugin.app.vault.adapter as any).path || 
            '.', 
            '.obsidian', 
            'claudesidian-file-event-queue.json'
        );
    }

    addEvent(event: FileEvent): void {
        // If event already exists for this path, only keep the latest one
        const existingEvent = this.queue.get(event.path);
        if (existingEvent) {
            // Preserve higher priority and keep latest timestamp
            const priority = this.getHigherPriority(existingEvent.priority, event.priority);
            const updatedEvent: FileEvent = {
                ...event,
                priority,
                timestamp: Math.max(existingEvent.timestamp, event.timestamp)
            };
            this.queue.set(event.path, updatedEvent);
        } else {
            this.queue.set(event.path, event);
        }
    }

    getEvents(): FileEvent[] {
        return Array.from(this.queue.values()).sort((a, b) => {
            // Priority order: high > normal > low
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            
            // Then by timestamp (older first)
            return a.timestamp - b.timestamp;
        });
    }

    removeEvent(path: string): void {
        this.queue.delete(path);
    }

    hasEvent(path: string): boolean {
        return this.queue.has(path);
    }

    clear(): void {
        this.queue.clear();
    }

    size(): number {
        return this.queue.size;
    }

    async persist(): Promise<void> {
        try {
            const queueData = Array.from(this.queue.entries()).map(([path, event]) => ({
                path,
                event
            }));
            
            await fs.writeFile(
                this.persistencePath, 
                JSON.stringify(queueData, null, 2), 
                'utf8'
            );
        } catch (error) {
            console.warn('[FileEventQueue] Failed to persist queue:', error);
        }
    }

    async restore(): Promise<void> {
        try {
            const data = await fs.readFile(this.persistencePath, 'utf8');
            let queueData;
            
            try {
                queueData = JSON.parse(data);
            } catch (parseError) {
                console.warn('[FileEventQueue] Corrupted queue file detected, attempting recovery...');
                
                // Try to recover by cleaning the JSON
                try {
                    const cleanedData = this.attemptJSONRecovery(data);
                    queueData = JSON.parse(cleanedData);
                    console.log('[FileEventQueue] Successfully recovered corrupted queue file');
                } catch (recoveryError) {
                    console.warn('[FileEventQueue] Failed to recover queue file, clearing and starting fresh:', recoveryError);
                    await this.clearPersistedQueue();
                    return;
                }
            }
            
            this.queue.clear();
            
            // Validate that queueData is an array
            if (!Array.isArray(queueData)) {
                console.warn('[FileEventQueue] Invalid queue data format, expected array. Clearing and starting fresh.');
                await this.clearPersistedQueue();
                return;
            }
            
            // Restore all events - let the embedding strategy decide what to process
            let restoredCount = 0;
            
            for (const item of queueData) {
                // Validate item structure
                if (item && typeof item === 'object' && item.path && item.event) {
                    this.queue.set(item.path, item.event);
                    restoredCount++;
                } else {
                    console.warn('[FileEventQueue] Skipping invalid queue item:', item);
                }
            }
            
            if (restoredCount > 0) {
                console.log(`[FileEventQueue] Restored ${restoredCount} events for processing`);
            }
            
        } catch (error) {
            // File might not exist yet, which is fine
            if ((error as any).code !== 'ENOENT') {
                console.warn('[FileEventQueue] Failed to restore queue:', error);
                // If we can't read the file, try to clear it
                await this.clearPersistedQueue();
            }
        }
    }

    private attemptJSONRecovery(corruptedData: string): string {
        // Handle the specific case where JSON starts with "[]" followed by object data
        const trimmedData = corruptedData.trim();
        
        // Check if it starts with "[]" followed by content
        if (trimmedData.startsWith('[]') && trimmedData.length > 2) {
            // Remove the "[]" prefix and any whitespace, then wrap remaining content in array
            const contentAfterPrefix = trimmedData.substring(2).trim();
            
            // If content starts with "{", it's likely object data that should be an array
            if (contentAfterPrefix.startsWith('{')) {
                // Split by },\s*{ pattern to separate objects
                const objectMatches = contentAfterPrefix.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
                if (objectMatches && objectMatches.length > 0) {
                    return '[' + objectMatches.join(',') + ']';
                }
            }
        }
        
        // Try to fix common JSON issues
        let cleanedData = trimmedData;
        
        // Remove trailing commas before closing brackets/braces
        cleanedData = cleanedData.replace(/,(\s*[}\]])/g, '$1');
        
        // Ensure proper array structure if it looks like it should be an array
        if (!cleanedData.startsWith('[') && !cleanedData.startsWith('{')) {
            cleanedData = '[' + cleanedData + ']';
        }
        
        return cleanedData;
    }

    private getHigherPriority(
        priority1: 'high' | 'normal' | 'low', 
        priority2: 'high' | 'normal' | 'low'
    ): 'high' | 'normal' | 'low' {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return priorityOrder[priority1] >= priorityOrder[priority2] ? priority1 : priority2;
    }

    private async clearPersistedQueue(): Promise<void> {
        try {
            await fs.unlink(this.persistencePath);
        } catch (error) {
            console.warn('[FileEventQueue] Failed to clear persisted queue:', error);
        }
    }

    // Debug methods
    getQueueContents(): { path: string; event: FileEvent }[] {
        return Array.from(this.queue.entries()).map(([path, event]) => ({ path, event }));
    }

    getEventsByOperation(operation: 'create' | 'modify' | 'delete'): FileEvent[] {
        return this.getEvents().filter(event => event.operation === operation);
    }
}