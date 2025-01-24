import { EventEmitter } from 'events';

export const EventTypes = {
    MEMORY_CREATED: 'memory:created',
    MEMORY_UPDATED: 'memory:updated',
    MEMORY_DELETED: 'memory:deleted',
    REASONING_CREATED: 'reasoning:created',
    REASONING_UPDATED: 'reasoning:updated',
    MEMORY_ACCESSED: 'memory_accessed',
    MEMORY_ARCHIVED: 'memory_archived'
} as const;

export interface BaseEvent {
    type: string;
    title: string;
    path: string;
    tags?: string[];
    relationships?: string[];
    context?: string;
    timestamp?: number;
    description?: string;
    accessCount?: number;
    metadata?: {
        accessCount?: number;
        lastAccessed?: number;
        importance?: number;
    };
}

export type MemoryAccessEvent = {
    type: 'memory_accessed';
    title: string;
    path: string;
    timestamp: number;
    accessCount: number;
    description?: string;
    importance?: number;
    metadata?: {
        accessCount?: number;
        lastAccessed?: number;
        importance?: number;
    };
};

export type MemoryEvent = BaseEvent & {
    memoryType?: 'Core' | 'Episodic' | 'Semantic' | 'Procedural' | 'Emotional' | 'Contextual';
};

export interface ReasoningEvent extends BaseEvent {
    reasoningType?: 'Analysis' | 'Decision' | 'Planning' | 'Problem Solving';
}

export class EventManager {
    private emitter: EventEmitter;

    constructor() {
        this.emitter = new EventEmitter();
    }

    on(event: typeof EventTypes[keyof typeof EventTypes], handler: (data: MemoryEvent | ReasoningEvent | MemoryAccessEvent) => void) {
        this.emitter.on(event, handler);
    }

    emit(event: typeof EventTypes[keyof typeof EventTypes], data: MemoryEvent | ReasoningEvent | MemoryAccessEvent) {
        this.emitter.emit(event, data);
    }
}
