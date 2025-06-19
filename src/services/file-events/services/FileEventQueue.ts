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
            const queueData = JSON.parse(data);
            
            this.queue.clear();
            
            // Restore all events - let the embedding strategy decide what to process
            let restoredCount = 0;
            
            for (const item of queueData) {
                this.queue.set(item.path, item.event);
                restoredCount++;
            }
            
            if (restoredCount > 0) {
                console.log(`[FileEventQueue] Restored ${restoredCount} events for processing`);
            }
            
        } catch (error) {
            // File might not exist yet, which is fine
            if ((error as any).code !== 'ENOENT') {
                console.warn('[FileEventQueue] Failed to restore queue:', error);
            }
        }
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