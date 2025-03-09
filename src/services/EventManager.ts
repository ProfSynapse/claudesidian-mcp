import { EventType } from '../types/event-types';

export type { EventType };

export type EventPayload = {
    type: string;
    title: string;
    path: string;
    timestamp: number;
};

export class EventManager {
    private listeners: Map<EventType, Array<(event: EventPayload) => void>> = new Map();

    on(eventType: EventType, callback: (event: EventPayload) => void): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)?.push(callback);
    }

    off(eventType: EventType, callback: (event: EventPayload) => void): void {
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(eventType: EventType, event: EventPayload): void {
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Error in event listener for ${eventType}:`, error);
                }
            });
        }
    }

    clear(): void {
        this.listeners.clear();
    }
}
