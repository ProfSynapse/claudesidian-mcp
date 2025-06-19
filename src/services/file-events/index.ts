// Main modular file event manager
export { FileEventManagerModular } from './FileEventManagerModular';

// Interfaces
export type * from './interfaces/IFileEventServices';

// Services
export { FileEventQueue } from './services/FileEventQueue';
export { FileEventProcessor } from './services/FileEventProcessor';
export { EmbeddingScheduler } from './services/EmbeddingScheduler';
export { ActivityTracker } from './services/ActivityTracker';
export { SessionTracker } from './services/SessionTracker';
export { FileMonitor } from './services/FileMonitor';
export { FileEventCoordinator } from './services/FileEventCoordinator';