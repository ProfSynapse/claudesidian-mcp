/**
 * createSessionMode.ts - Refactored following SOLID principles
 * Main export for backward compatibility
 */

// Export the refactored CreateSessionMode as the main CreateSessionMode
export { CreateSessionMode } from './create/CreateSessionMode';

// Export specialized services for direct use if needed
export { WorkspaceResolver } from './create/services/WorkspaceResolver';
export { SessionCreator } from './create/services/SessionCreator';
export { ContextBuilder } from './create/services/ContextBuilder';
export { MemoryTracer } from './create/services/MemoryTracer';
export { SessionInstructionManager } from './create/services/SessionInstructionManager';
// SessionSchemaBuilder removed - using unified schema builder

// Export types for service interfaces
export type { WorkspaceResolutionResult } from './create/services/WorkspaceResolver';
export type { SessionCreationData, SessionCreationResult } from './create/services/SessionCreator';
export type { ContextData, ContextBuildingOptions } from './create/services/ContextBuilder';
export type { MemoryTraceData } from './create/services/MemoryTracer';
export type { SessionInstructionResult } from './create/services/SessionInstructionManager';