/**
 * Location: src/database/repositories/interfaces/index.ts
 *
 * Repository Interfaces Exports
 *
 * Central export point for all repository interfaces. This provides a single
 * import location for services that depend on repository abstractions.
 *
 * Design Principles:
 * - Dependency Inversion: Services depend on interfaces, not implementations
 * - Single Responsibility: Each interface defines one entity's contract
 * - Interface Segregation: Minimal, focused interfaces
 *
 * Related Files:
 * - src/database/repositories/index.ts - Repository implementations export
 * - src/services/*.ts - Services that use these interfaces
 */

// Base repository interfaces
export type { IRepository } from './IRepository';

// Workspace-related repository interfaces
export type { IWorkspaceRepository } from './IWorkspaceRepository';
export type { CreateWorkspaceData } from './IWorkspaceRepository';
export type { UpdateWorkspaceData } from './IWorkspaceRepository';

export type { ISessionRepository } from './ISessionRepository';
export type { CreateSessionData } from './ISessionRepository';
export type { UpdateSessionData } from './ISessionRepository';

export type { IStateRepository } from './IStateRepository';
export type { SaveStateData } from './IStateRepository';

export type { ITraceRepository } from './ITraceRepository';
export type { AddTraceData } from './ITraceRepository';

// Conversation-related repository interfaces
export type { IConversationRepository } from './IConversationRepository';
export type { CreateConversationData } from './IConversationRepository';
export type { UpdateConversationData } from './IConversationRepository';

export type { IMessageRepository } from './IMessageRepository';
export type { CreateMessageData } from './IMessageRepository';
export type { UpdateMessageData } from './IMessageRepository';
