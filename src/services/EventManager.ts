import { EventEmitter } from 'events';

export enum EventTypes {
    MEMORY_CREATED = 'memory:created',
    MEMORY_UPDATED = 'memory:updated',
    REASONING_CREATED = 'reasoning:created',
    REASONING_UPDATED = 'reasoning:updated'
}

export interface MemoryEvent {
    type: string;
    title: string;
    path: string;
}

export interface ReasoningEvent {
    type: string;
    title: string;
    path: string;
}

export class EventManager {
    private emitter: EventEmitter;

    constructor() {
        this.emitter = new EventEmitter();
    }

    on(event: EventTypes, handler: (data: MemoryEvent | ReasoningEvent) => void) {
        this.emitter.on(event, handler);
    }

    emit(event: EventTypes, data: MemoryEvent | ReasoningEvent) {
        this.emitter.emit(event, data);
    }
}
