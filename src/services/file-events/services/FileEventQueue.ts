import { Plugin } from 'obsidian';
import { IFileEventQueue, FileEvent } from '../interfaces/IFileEventServices';

export class FileEventQueue implements IFileEventQueue {
    private queue: Map<string, FileEvent> = new Map();

    constructor(private plugin: Plugin) {
        // Queue now persists to data.json instead of separate file
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
            
            // Load existing plugin data
            const data = await this.plugin.loadData() || {};
            
            // Store queue in data.json under fileEventQueue key
            data.fileEventQueue = {
                version: '2.0.0',
                lastUpdated: Date.now(),
                events: queueData
            };
            
            // Save back to data.json
            await this.plugin.saveData(data);
            
        } catch (error) {
            console.warn('[FileEventQueue] Failed to persist queue to data.json:', error);
        }
    }

    async restore(): Promise<void> {
        try {
            // Load plugin data from data.json
            const data = await this.plugin.loadData();
            
            if (!data?.fileEventQueue?.events) {
                return;
            }
            
            const queueData = data.fileEventQueue.events;
            this.queue.clear();
            
            // Validate that queueData is an array
            if (!Array.isArray(queueData)) {
                console.warn('[FileEventQueue] Invalid queue data format in data.json, starting with empty queue');
                return;
            }
            
            let restoredCount = 0;
            
            // Restore events from data.json
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
            }
            
        } catch (error) {
            console.warn('[FileEventQueue] Failed to restore queue from data.json:', error);
            // Start with empty queue if restore fails
        }
    }

    private getHigherPriority(
        priority1: 'high' | 'normal' | 'low', 
        priority2: 'high' | 'normal' | 'low'
    ): 'high' | 'normal' | 'low' {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return priorityOrder[priority1] >= priorityOrder[priority2] ? priority1 : priority2;
    }

    // Debug methods
    getQueueContents(): { path: string; event: FileEvent }[] {
        return Array.from(this.queue.entries()).map(([path, event]) => ({ path, event }));
    }

    getEventsByOperation(operation: 'create' | 'modify' | 'delete'): FileEvent[] {
        return this.getEvents().filter(event => event.operation === operation);
    }
}