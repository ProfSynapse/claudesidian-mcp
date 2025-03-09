// System Event Types

// System Event Types
export const SYSTEM_EVENTS = {
    ARCHIVE: 'system:archive',
    ERROR: 'system:error',
    WARNING: 'system:warning',
} as const;


// Type Definitions
export type SystemEventType = typeof SYSTEM_EVENTS[keyof typeof SYSTEM_EVENTS];
export type EventType = SystemEventType;

// Event Type Guards
export function isSystemEvent(type: string): type is SystemEventType {
    return Object.values(SYSTEM_EVENTS).includes(type as SystemEventType);
}
