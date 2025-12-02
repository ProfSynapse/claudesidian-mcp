import { EventEmitter } from 'events';
import { Vault, TFile } from 'obsidian';
import { WorkspaceService } from '../../../services/WorkspaceService';
import { MemoryService } from '../../../agents/memoryManager/services/MemoryService';

interface CachedWorkspace {
    data: any;
    sessionIds: string[];
    stateIds: string[];
    associatedFiles: string[];
    timestamp: number;
}

interface CachedSession {
    data: any;
    traceIds: string[];
    associatedFiles: string[];
    timestamp: number;
}

interface CachedState {
    data: any;
    associatedFiles: string[];
    timestamp: number;
}

interface FileMetadata {
    path: string;
    name: string;
    modified: number;
    size: number;
    isKeyFile: boolean;
    frontmatter?: any;
    workspaceIds?: string[];
}

interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
    maxSize?: number; // Maximum number of items per cache
}

export class EntityCache extends EventEmitter {
    private workspaceCache = new Map<string, CachedWorkspace>();
    private sessionCache = new Map<string, CachedSession>();
    private stateCache = new Map<string, CachedState>();
    private fileMetadataCache = new Map<string, FileMetadata>();
    
    private readonly defaultTTL = 30 * 60 * 1000; // 30 minutes
    private readonly maxCacheSize = 1000;
    
    constructor(
        private vault: Vault,
        private workspaceService: WorkspaceService,
        private memoryService: MemoryService,
        private options: CacheOptions = {}
    ) {
        super();
        this.options.ttl = options.ttl || this.defaultTTL;
        this.options.maxSize = options.maxSize || this.maxCacheSize;
    }

    // Workspace caching methods
    async preloadWorkspace(workspaceId: string): Promise<void> {
        try {
            // Check if already cached and valid
            const cached = this.workspaceCache.get(workspaceId);
            if (cached && this.isValid(cached.timestamp)) {
                return;
            }

            // Load workspace data
            const workspace = await this.workspaceService.getWorkspace(workspaceId);
            
            if (!workspace) {
                return;
            }

            // Collect related IDs
            const sessionIds: string[] = [];
            const stateIds: string[] = [];
            const associatedFiles = new Set<string>();

            // Get sessions for this workspace
            const sessions = await this.memoryService.getSessions(workspaceId);
            sessionIds.push(...sessions.map(s => s.id));

            // Get states for this workspace
            const states = await this.memoryService.getStates(workspaceId);
            stateIds.push(...states.map(s => s.id));

            // Collect associated files
            if (workspace.rootFolder) {
                associatedFiles.add(workspace.rootFolder);
            }
            // Note: ProjectWorkspace doesn't have associatedFiles property

            // Cache the workspace
            this.workspaceCache.set(workspaceId, {
                data: workspace,
                sessionIds,
                stateIds,
                associatedFiles: Array.from(associatedFiles),
                timestamp: Date.now()
            });

            // Preload related entities in parallel
            await Promise.all([
                ...sessionIds.map(id => this.preloadSession(id)),
                ...stateIds.slice(0, 5).map(id => this.preloadState(id)) // Limit states
            ]);

            // Preload file metadata
            await this.preloadFiles(Array.from(associatedFiles));

            this.emit('workspace:preloaded', workspaceId);
        } catch (error) {
            console.error('Error preloading workspace:', error);
        }
    }

    async preloadSession(sessionId: string): Promise<void> {
        try {
            // Check if already cached and valid
            const cached = this.sessionCache.get(sessionId);
            if (cached && this.isValid(cached.timestamp)) {
                return;
            }

            // Load session data
            // First try to get the session directly
            const sessionData = await this.memoryService.getSession('default-workspace', sessionId);
            if (!sessionData) {
                return;
            }
            const session = sessionData;

            // Get memory traces for this session
            const traces = await this.memoryService.getMemoryTraces(sessionId);
            const traceIds = traces.map(t => t.id);
            
            // Collect associated files
            const associatedFiles = new Set<string>();
            // Note: WorkspaceSession doesn't have activeNote property
            traces.forEach(trace => {
                const files =
                  (trace.metadata?.input?.files && Array.isArray(trace.metadata.input.files)
                    ? trace.metadata.input.files
                    : trace.metadata?.legacy?.relatedFiles) || [];
                files.forEach((f: string) => associatedFiles.add(f));
            });

            // Cache the session
            this.sessionCache.set(sessionId, {
                data: session,
                traceIds,
                associatedFiles: Array.from(associatedFiles),
                timestamp: Date.now()
            });

            // Preload file metadata
            await this.preloadFiles(Array.from(associatedFiles));

            this.emit('session:preloaded', sessionId);
        } catch (error) {
            console.error('Error preloading session:', error);
        }
    }

    async preloadState(stateId: string): Promise<void> {
        try {
            // Check if already cached and valid
            const cached = this.stateCache.get(stateId);
            if (cached && this.isValid(cached.timestamp)) {
                return;
            }

            // Load state data
            const allStates = await this.memoryService.getStates('default-workspace');
            const state = allStates.find(s => s.id === stateId);

            if (!state) {
                return;
            }

            // Collect associated files from state context
            const associatedFiles = new Set<string>();
            // Note: WorkspaceState structure may vary

            // Cache the state
            this.stateCache.set(stateId, {
                data: state,
                associatedFiles: Array.from(associatedFiles),
                timestamp: Date.now()
            });

            // Preload file metadata
            await this.preloadFiles(Array.from(associatedFiles));

            this.emit('state:preloaded', stateId);
        } catch (error) {
            console.error('Error preloading state:', error);
        }
    }

    async preloadFiles(filePaths: string[]): Promise<void> {
        const files = filePaths
            .map(path => this.vault.getAbstractFileByPath(path))
            .filter(file => file instanceof TFile) as TFile[];

        await Promise.all(files.map(file => this.cacheFileMetadata(file)));
    }

    private async cacheFileMetadata(file: TFile): Promise<void> {
        const keyFilePatterns = [/readme\.md$/i, /index\.md$/i, /\.canvas$/];
        
        this.fileMetadataCache.set(file.path, {
            path: file.path,
            name: file.name,
            modified: file.stat.mtime,
            size: file.stat.size,
            isKeyFile: keyFilePatterns.some(p => p.test(file.path)),
            // Frontmatter will be loaded lazily when needed
        });
    }

    // Batch loading methods
    async batchLoadSessions(sessionIds: string[]): Promise<any[]> {
        const uncached: string[] = [];
        const results: any[] = [];

        // Check cache first
        for (const id of sessionIds) {
            const cached = this.sessionCache.get(id);
            if (cached && this.isValid(cached.timestamp)) {
                results.push(cached.data);
            } else {
                uncached.push(id);
            }
        }

        // Batch load uncached items
        if (uncached.length > 0) {
            // Load sessions individually
            const sessionPromises = uncached.map(id => this.memoryService.getSession('default-workspace', id));
            const sessionResults = await Promise.all(sessionPromises);
            const sessions = sessionResults.filter((s): s is any => s !== undefined);
            
            // Cache the loaded sessions
            for (const session of sessions) {
                if (session) {
                    this.sessionCache.set(session.id, {
                        data: session,
                        traceIds: [],
                        associatedFiles: [],
                        timestamp: Date.now()
                    });
                    results.push(session);
                }
            }
        }

        return results;
    }

    async batchLoadStates(stateIds: string[]): Promise<any[]> {
        const uncached: string[] = [];
        const results: any[] = [];

        // Check cache first
        for (const id of stateIds) {
            const cached = this.stateCache.get(id);
            if (cached && this.isValid(cached.timestamp)) {
                results.push(cached.data);
            } else {
                uncached.push(id);
            }
        }

        // Batch load uncached items
        if (uncached.length > 0) {
            // Load all states and filter
            const allStates = await this.memoryService.getStates('default-workspace');
            const states = allStates.filter(s => uncached.includes(s.id));
            
            // Cache the loaded states
            for (const state of states) {
                if (state) {
                    this.stateCache.set(state.id, {
                        data: state,
                        associatedFiles: [],
                        timestamp: Date.now()
                    });
                    results.push(state);
                }
            }
        }

        return results;
    }


    // Cache access methods
    getWorkspace(workspaceId: string): CachedWorkspace | undefined {
        const cached = this.workspaceCache.get(workspaceId);
        if (cached && this.isValid(cached.timestamp)) {
            return cached;
        }
        this.workspaceCache.delete(workspaceId);
        return undefined;
    }

    getSession(sessionId: string): CachedSession | undefined {
        const cached = this.sessionCache.get(sessionId);
        if (cached && this.isValid(cached.timestamp)) {
            return cached;
        }
        this.sessionCache.delete(sessionId);
        return undefined;
    }

    getState(stateId: string): CachedState | undefined {
        const cached = this.stateCache.get(stateId);
        if (cached && this.isValid(cached.timestamp)) {
            return cached;
        }
        this.stateCache.delete(stateId);
        return undefined;
    }

    getFileMetadata(filePath: string): FileMetadata | undefined {
        return this.fileMetadataCache.get(filePath);
    }

    // Cache management
    invalidateWorkspace(workspaceId: string): void {
        this.workspaceCache.delete(workspaceId);
        this.emit('workspace:invalidated', workspaceId);
    }

    invalidateSession(sessionId: string): void {
        this.sessionCache.delete(sessionId);
        this.emit('session:invalidated', sessionId);
    }

    invalidateState(stateId: string): void {
        this.stateCache.delete(stateId);
        this.emit('state:invalidated', stateId);
    }

    invalidateFile(filePath: string): void {
        this.fileMetadataCache.delete(filePath);
    }

    clear(): void {
        this.workspaceCache.clear();
        this.sessionCache.clear();
        this.stateCache.clear();
        this.fileMetadataCache.clear();
        this.emit('cache:cleared');
    }

    private isValid(timestamp: number): boolean {
        return Date.now() - timestamp < (this.options.ttl || this.defaultTTL);
    }

    // Enforce cache size limits
    private enforceLimit<T>(cache: Map<string, T>): void {
        if (cache.size > (this.options.maxSize || this.maxCacheSize)) {
            // Remove oldest entries
            const entries = Array.from(cache.entries());
            entries.sort((a, b) => {
                const timestampA = (a[1] as any).timestamp || 0;
                const timestampB = (b[1] as any).timestamp || 0;
                return timestampA - timestampB;
            });
            
            const toRemove = entries.slice(0, Math.floor(cache.size * 0.2)); // Remove 20%
            toRemove.forEach(([key]) => cache.delete(key));
        }
    }
}
