import { TAbstractFile } from 'obsidian';

// Core event types
export type FileOperation = 'create' | 'modify' | 'delete';

export interface FileEvent {
    path: string;
    operation: FileOperation;
    timestamp: number;
    isSystemOperation: boolean;
    source: 'vault' | 'manual';
    priority: 'high' | 'normal' | 'low';
}

export interface ProcessingResult {
    success: boolean;
    embeddingCreated?: boolean;
    activityRecorded?: boolean;
    error?: string;
}

export interface EmbeddingStrategy {
    type: 'manual' | 'idle' | 'startup';
    idleTimeThreshold: number;
    batchSize: number;
    processingDelay: number;
}

// Service interfaces following ISP
export interface IFileEventQueue {
    addEvent(event: FileEvent): void;
    getEvents(): FileEvent[];
    removeEvent(path: string): void;
    hasEvent(path: string): boolean;
    clear(): void;
    size(): number;
    persist(): Promise<void>;
    restore(): Promise<void>;
}

export interface IFileEventProcessor {
    processEvent(event: FileEvent): Promise<ProcessingResult>;
    isProcessing(path: string): boolean;
    getResult(path: string): ProcessingResult | undefined;
}

export interface IEmbeddingScheduler {
    setStrategy(strategy: EmbeddingStrategy): void;
    getStrategy(): EmbeddingStrategy;
    shouldProcessEmbedding(event: FileEvent): boolean;
    scheduleEmbedding(events: FileEvent[]): Promise<void>;
    batchProcessEmbeddings(events: FileEvent[]): Promise<ProcessingResult[]>;
}

export interface IActivityTracker {
    recordFileActivity(event: FileEvent): Promise<void>;
    trackWorkspaceActivity(filePath: string, operation: FileOperation): Promise<void>;
    clearCache(): void;
    getCacheStats(): any;
}

export interface ISessionTracker {
    setActiveSession(workspaceId: string, sessionId: string): void;
    getActiveSession(workspaceId: string): string | undefined;
    removeSession(workspaceId: string): void;
    getActiveSessions(): Record<string, string>;
    getSessionCount(): number;
}

export interface IFileMonitor {
    startMonitoring(): void;
    stopMonitoring(): void;
    shouldProcessFile(file: TAbstractFile): boolean;
    isSystemOperation(): boolean;
    setSystemOperation(isSystem: boolean): void;
    isVaultReady(): boolean;
    incrementStartupEventCount(): void;
    hasContentChanged(file: TAbstractFile): Promise<boolean>;
    shouldSkipEmbeddingUpdate(filePath: string): boolean;
    clearCaches(): void;
    getCacheStats(): any;
}

export interface IFileEventCoordinator {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    handleFileCreated(file: TAbstractFile): Promise<void>;
    handleFileModified(file: TAbstractFile): Promise<void>;
    handleFileDeleted(file: TAbstractFile): Promise<void>;
    handleFileRenamed(file: TAbstractFile, oldPath: string): Promise<void>;
    processQueue(): Promise<void>;
}

export interface IFileEventManagerDependencies {
    fileEventQueue: IFileEventQueue;
    fileEventProcessor: IFileEventProcessor;
    embeddingScheduler: IEmbeddingScheduler;
    activityTracker: IActivityTracker;
    sessionTracker: ISessionTracker;
    fileMonitor: IFileMonitor;
}