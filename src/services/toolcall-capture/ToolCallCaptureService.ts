import { SimpleMemoryService } from '../memory/SimpleMemoryService';
import { SessionService } from '../session/SessionService';
import { DefaultWorkspaceManager } from '../workspace/DefaultWorkspaceManager';

// Heavy dependencies - loaded on upgrade
type MemoryTraceService = any;
type EmbeddingService = any;

export interface ToolCallRequest {
  toolCallId: string;
  agent: string;
  mode: string;
  params: Record<string, any>;
  timestamp: number;
  source: 'mcp-client' | 'internal' | 'agent-trigger';
  workspaceContext?: {
    workspaceId: string;
    sessionId?: string;
    workspacePath?: string[];
  };
}

export interface ToolCallResponse {
  result: Record<string, any> | null;
  success: boolean;
  executionTime: number;
  timestamp: number;
  error?: {
    type: string;
    message: string;
    code?: string | number;
    stack?: string;
  };
  resultType?: string;
  resultSummary?: string;
  affectedResources?: string[];
}

export interface ToolCallCaptureContext {
  toolCallId: string;
  requestCaptured: boolean;
  responsePending: boolean;
  captureTimestamp: number;
}

export interface PendingToolCallCapture {
  toolCallId: string;
  request: ToolCallRequest;
  response?: ToolCallResponse;
  sessionContext: SessionContext;
  requestTimestamp: number;
  responseTimestamp?: number;
  responseReceived: boolean;
  retryCount: number;
}

export interface SessionContext {
  workspaceId: string;
  sessionId: string;
  sessionCreated: boolean;
  workspacePath?: string[];
}

export interface CaptureQueueItem {
  toolCallId: string;
  request: ToolCallRequest;
  response: ToolCallResponse;
  timestamp: number;
  priority: number;
  retryCount: number;
}

export interface ToolCallCaptureStats {
  totalCalls: number;
  successfulCaptures: number;
  failedCaptures: number;
  queueSize: number;
  processingTime: number;
  averageTime: number;
}

/**
 * Non-blocking tool call capture service that captures tool calls and responses
 * for storage as searchable memory traces with minimal performance impact.
 */
export class ToolCallCaptureService {
  private pendingCaptures = new Map<string, PendingToolCallCapture>();
  private captureQueue: CaptureQueueItem[] = [];
  private isProcessing = false;
  private isUpgraded = false;

  // Performance configuration
  private readonly maxQueueSize = 1000;
  private readonly batchSize = 25;
  private readonly maxProcessingTime = 100; // 100ms max processing time
  private readonly queueProcessingInterval = 1000; // Process every second
  private readonly captureTimeoutMs = 30000; // 30 seconds

  // Performance tracking
  private stats: ToolCallCaptureStats = {
    totalCalls: 0,
    successfulCaptures: 0,
    failedCaptures: 0,
    queueSize: 0,
    processingTime: 0,
    averageTime: 0
  };

  // Configuration
  private captureEnabled = true;
  private shouldCapturePredicate: (request: ToolCallRequest) => boolean;

  // Service dependencies - start with simple, upgrade to full
  private memoryStorage: SimpleMemoryService | MemoryTraceService;
  private embeddingService?: EmbeddingService;

  constructor(
    private simpleMemoryService: SimpleMemoryService,
    private sessionService: SessionService,
    private defaultWorkspaceManager?: DefaultWorkspaceManager
  ) {
    // Start with simple in-memory storage
    this.memoryStorage = simpleMemoryService;
    
    // Default capture strategy
    this.shouldCapturePredicate = this.defaultShouldCapture.bind(this);

    // Start background processing
    this.startBackgroundProcessing();

  }

  /**
   * Capture a tool call request (non-blocking)
   */
  async captureRequest(request: ToolCallRequest): Promise<ToolCallCaptureContext> {
    const captureStartTime = performance.now();

    if (!this.isEnabled() || !this.shouldCapturePredicate(request)) {
      return {
        toolCallId: request.toolCallId,
        requestCaptured: false,
        responsePending: false,
        captureTimestamp: Date.now()
      };
    }

    try {
      this.stats.totalCalls++;


      // Extract or create session context
      const sessionContext = await this.extractSessionContext(request);

      // Create pending capture entry
      const pendingCapture: PendingToolCallCapture = {
        toolCallId: request.toolCallId,
        request: request,
        sessionContext: sessionContext,
        requestTimestamp: request.timestamp,
        responseReceived: false,
        retryCount: 0
      };

      this.pendingCaptures.set(request.toolCallId, pendingCapture);

      const captureTime = performance.now() - captureStartTime;
      this.stats.processingTime += captureTime;

      if (captureTime > 5) { // Log if capture takes more than 5ms
        console.warn(`[ToolCallCapture] Request capture took ${captureTime.toFixed(2)}ms for ${request.toolCallId}`);
      }

      return {
        toolCallId: request.toolCallId,
        requestCaptured: true,
        responsePending: true,
        captureTimestamp: Date.now()
      };

    } catch (error) {
      console.error('[ToolCallCapture] Request capture failed:', error);
      this.stats.failedCaptures++;
      return {
        toolCallId: request.toolCallId,
        requestCaptured: false,
        responsePending: false,
        captureTimestamp: Date.now()
      };
    }
  }

  /**
   * Capture a tool call response (non-blocking)
   */
  async captureResponse(toolCallId: string, response: ToolCallResponse): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const pendingCapture = this.pendingCaptures.get(toolCallId);
      if (!pendingCapture) {
        console.warn('[ToolCallCapture] Response received for unknown tool call:', toolCallId);
        return;
      }

      // Update pending capture with response
      pendingCapture.response = response;
      pendingCapture.responseReceived = true;
      pendingCapture.responseTimestamp = response.timestamp;

      // Add to processing queue if high priority, otherwise will be processed in batch
      if (this.isHighPriority(pendingCapture)) {
        await this.processCapture(pendingCapture);
        this.pendingCaptures.delete(toolCallId);
      }

    } catch (error) {
      console.error('[ToolCallCapture] Response capture failed:', error);
      this.stats.failedCaptures++;
    }
  }

  /**
   * Get capture statistics
   */
  getCaptureStats(): ToolCallCaptureStats {
    return {
      ...this.stats,
      queueSize: this.captureQueue.length,
      averageTime: this.stats.totalCalls > 0 ? this.stats.processingTime / this.stats.totalCalls : 0
    };
  }

  /**
   * Enable/disable capture
   */
  isEnabled(): boolean {
    return this.captureEnabled;
  }

  setEnabled(enabled: boolean): void {
    this.captureEnabled = enabled;
    // Capture state updated
  }

  /**
   * Set custom capture predicate
   */
  setShouldCapture(predicate: (request: ToolCallRequest) => boolean): void {
    this.shouldCapturePredicate = predicate;
  }

  /**
   * Process pending captures manually
   */
  async processPendingCaptures(): Promise<void> {
    if (this.isProcessing) return;
    await this.processQueue();
  }

  private async extractSessionContext(request: ToolCallRequest): Promise<SessionContext> {
    // Extract workspace ID from multiple sources with priority order:
    // 1. context.workspaceId (new primary method)
    // 2. workspaceContext.workspaceId (legacy fallback)
    // 3. 'default' (fallback when none specified)
    
    let workspaceId: string | undefined;
    let workspacePath: string[] | undefined;
    
    // Check context first (new primary method)
    if (request.params?.context?.workspaceId) {
      workspaceId = request.params.context.workspaceId;
    } 
    // Fallback to legacy workspaceContext
    else if (request.workspaceContext?.workspaceId) {
      workspaceId = request.workspaceContext.workspaceId;
      workspacePath = request.workspaceContext.workspacePath;
    }
    // Fallback to params.workspaceContext
    else if (request.params?.workspaceContext?.workspaceId) {
      const wc = typeof request.params.workspaceContext === 'string' 
        ? JSON.parse(request.params.workspaceContext) 
        : request.params.workspaceContext;
      workspaceId = wc.workspaceId;
      workspacePath = wc.workspacePath;
    }

    if (!workspaceId) {
      // No workspace ID found - use default workspace manager
      const defaultId = this.defaultWorkspaceManager?.getDefaultWorkspaceId() || 'default';
      return {
        workspaceId: defaultId,
        sessionId: 'auto-generated',
        sessionCreated: false
      };
    }

    // Get or create session for this workspace
    let sessionId = request.params?.context?.sessionId;
    let sessionCreated = false;

    if (!sessionId) {
      try {
        // Auto-create session for this tool call
        const newSession = await this.sessionService.createSession({
          workspaceId: workspaceId,
          name: `Auto-session for ${request.agent}.${request.mode}`,
          description: `Automatically created for ${request.agent}.${request.mode} operation`
        });

        sessionId = newSession.id;
        sessionCreated = true;
      } catch (error) {
        console.error('[ToolCallCapture] Failed to create session:', error);
        sessionId = 'auto-generated';
      }
    }

    // Tool call counter increment no longer needed since we removed toolCalls field
    try {
      // No action needed for tool calls counting
    } catch (error) {
      console.warn('[ToolCallCapture] Failed to increment tool call count:', error);
    }

    return {
      workspaceId: workspaceId,
      sessionId: sessionId,
      sessionCreated: sessionCreated,
      workspacePath: workspacePath
    };
  }

  private defaultShouldCapture(request: ToolCallRequest): boolean {
    // High-value agents - Always capture
    const highValueAgents = ['contentManager', 'memoryManager', 'vaultLibrarian', 'agentManager'];
    if (highValueAgents.includes(request.agent)) return true;

    // LLM interactions - Always capture
    if (request.agent === 'agentManager') return true;

    // File operations - Capture if multiple files involved
    if (request.params?.paths && Array.isArray(request.params.paths) && request.params.paths.length > 1) {
      return true;
    }

    // Batch operations - Always capture
    if (request.params?.operations && Array.isArray(request.params.operations)) {
      return true;
    }

    // Default: Capture most operations, skip simple health checks
    const skipModes = ['healthCheck', 'getStatus', 'listModes'];
    return !skipModes.includes(request.mode);
  }

  private isHighPriority(capture: PendingToolCallCapture): boolean {
    const request = capture.request;
    const response = capture.response;

    if (!response) return false;

    // Failed operations get high priority for debugging
    if (!response.success) return true;

    // LLM interactions get high priority
    if (request.agent === 'agentManager') return true;

    // Long execution times indicate important operations
    if (response.executionTime > 5000) return true;

    return false;
  }

  /**
   * Upgrade to full functionality with MemoryTraceService
   */
  async upgrade(memoryTraceService: MemoryTraceService, embeddingService?: EmbeddingService): Promise<void> {
    // Starting service upgrade
    
    if (!memoryTraceService) {
      throw new Error('[ToolCallCapture] Cannot upgrade: MemoryTraceService is null/undefined');
    }
    
    // Verify the MemoryTraceService has required methods
    if (typeof memoryTraceService.storeToolCallTrace !== 'function') {
      console.warn('[ToolCallCapture] Warning: MemoryTraceService missing storeToolCallTrace method');
    }
    
    // Migrate existing data from simple storage to full service
    if (this.memoryStorage instanceof SimpleMemoryService) {
      try {
        // Checking for migration data
        const existingData = await this.memoryStorage.exportData();
        
        if (existingData.toolCalls && Object.keys(existingData.toolCalls).length > 0) {
          const toolCallCount = Object.keys(existingData.toolCalls).length;
          // Migrating tool call captures
          
          // Import data into new service if it supports bulk import
          if (typeof memoryTraceService.importToolCallData === 'function') {
            const importedCount = await memoryTraceService.importToolCallData(existingData.toolCalls);
            // Migration completed
          } else {
            console.warn('[ToolCallCapture] MemoryTraceService does not support bulk import - skipping migration');
          }
        } else {
          // No data to migrate
        }
        
        // Also check for traces
        if (existingData.traces && Object.keys(existingData.traces).length > 0) {
          // Found existing traces
        }
        
      } catch (error) {
        console.error('[ToolCallCapture] Failed to migrate data during upgrade:', error);
        // Don't fail the upgrade if migration fails - continue with upgrade
      }
    }
    
    // Perform the upgrade
    this.memoryStorage = memoryTraceService;
    this.embeddingService = embeddingService;
    this.isUpgraded = true;
    
    // Service upgrade completed
  }

  /**
   * Check if service has been upgraded to full functionality
   */
  isFullyFunctional(): boolean {
    return this.isUpgraded;
  }

  private async processCapture(capture: PendingToolCallCapture): Promise<void> {
    try {
      if (!capture.response) {
        console.warn('[ToolCallCapture] Attempting to process capture without response:', capture.toolCallId);
        return;
      }

      // Log which path we're taking for debugging
      const isUpgraded = this.isUpgraded;
      const hasStoreMethod = typeof this.memoryStorage.storeToolCallTrace === 'function';
      
      if (isUpgraded && hasStoreMethod) {
        // Use full MemoryTraceService functionality
        // Processing via MemoryTraceService
        await this.memoryStorage.storeToolCallTrace(capture);
        // Successfully stored via MemoryTraceService
      } else {
        // Log why we're using fallback path
        if (!isUpgraded) {
          // Using fallback - service not upgraded
        } else if (!hasStoreMethod) {
          console.warn(`[ToolCallCapture] Using fallback - MemoryTraceService missing storeToolCallTrace method: ${capture.toolCallId}`);
        }
        // CRITICAL FIX: Store tool call in vector database
        // Create proper memory trace for vector storage
        const toolCallTrace = {
          id: `trace_${capture.toolCallId}_${Date.now()}`,
          workspaceId: capture.sessionContext.workspaceId || 'default',
          workspacePath: capture.sessionContext.workspacePath || [],
          contextLevel: 'workspace' as const,
          activityType: 'tool_call' as const,
          content: `Tool: ${capture.request.agent}.${capture.request.mode}
Status: ${capture.response?.success ? 'SUCCESS' : 'FAILED'}
Time: ${new Date(capture.request.timestamp).toISOString()}
Workspace: ${capture.sessionContext.workspaceId || 'unknown'}

=== COMPLETE REQUEST ===
${JSON.stringify(capture.request.params, null, 2)}

=== COMPLETE RESPONSE ===
${JSON.stringify(capture.response?.result, null, 2)}${!capture.response?.success && capture.response?.error ? `

=== ERROR DETAILS ===
${JSON.stringify(capture.response.error, null, 2)}` : ''}`,
          sessionId: capture.sessionContext.sessionId,
          timestamp: capture.request.timestamp,
          importance: capture.response?.success ? 0.7 : 0.9,
          tags: [
            capture.request.agent,
            capture.request.mode,
            capture.response?.success ? 'success' : 'error',
            'tool_call'
          ],
          toolCallId: capture.toolCallId,
          agent: capture.request.agent,
          mode: capture.request.mode,
          toolName: `${capture.request.agent}.${capture.request.mode}`,
          metadata: {
            request: {
              originalParams: capture.request.params,
              normalizedParams: capture.request.params,
              workspaceContext: capture.request.workspaceContext,
              source: capture.request.source
            },
            response: {
              result: capture.response?.result || null,
              success: capture.response?.success || false,
              error: capture.response?.error,
              resultType: capture.response?.resultType,
              resultSummary: capture.response?.resultSummary,
              affectedResources: capture.response?.affectedResources || []
            },
            tool: `${capture.request.agent}.${capture.request.mode}`,
            params: capture.request.params,
            result: capture.response?.result,
            relatedFiles: capture.response?.affectedResources || []
          },
          executionContext: {
            timing: {
              startTimestamp: capture.request.timestamp,
              endTimestamp: capture.response?.timestamp || Date.now(),
              executionTime: capture.response?.executionTime || 0
            },
            environment: {
              pluginVersion: '2.6.3',
              platform: navigator.platform || 'unknown'
            },
            userContext: {
              sessionStart: capture.sessionContext.sessionId ? Date.now() : 0,
              sessionDuration: 0,
              previousToolCalls: 0
            },
            performance: {
              importance: capture.response?.success ? 0.7 : 0.9,
              complexity: Object.keys(capture.request.params).length > 5 ? 0.8 : 0.5,
              userEngagement: 0.6
            }
          },
          relationships: {
            relatedFiles: capture.response?.affectedResources || [],
            affectedResources: capture.response?.affectedResources || [],
            sessionContext: capture.sessionContext.sessionId,
            parentWorkspace: capture.sessionContext.workspaceId
          }
        };

        // Store as proper memory trace instead of just in-memory
        // Storing via SimpleMemoryService
        await (this.memoryStorage as SimpleMemoryService).storeTrace(toolCallTrace.id, toolCallTrace);
        // Successfully stored via SimpleMemoryService
        
      }
      
      this.stats.successfulCaptures++;

    } catch (error) {
      console.error(`[ToolCallCapture] Failed to process capture ${capture.toolCallId}:`, error);
      this.stats.failedCaptures++;
    }
  }

  private startBackgroundProcessing(): void {
    setInterval(() => {
      if (!this.isProcessing && (this.captureQueue.length > 0 || this.pendingCaptures.size > 0)) {
        this.processQueue();
      }
    }, this.queueProcessingInterval);

    // Also clean up expired captures
    setInterval(() => {
      this.cleanupExpiredCaptures();
    }, 60000); // Every minute
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const processingStartTime = performance.now();

    try {
      // Move completed pending captures to processing queue
      const completedCaptures: PendingToolCallCapture[] = [];
      for (const [toolCallId, capture] of Array.from(this.pendingCaptures.entries())) {
        if (capture.responseReceived && capture.response) {
          completedCaptures.push(capture);
          this.pendingCaptures.delete(toolCallId);
        }
      }

      // Process completed captures in batches
      if (completedCaptures.length > 0) {
        const batches = this.createBatches(completedCaptures, this.batchSize);
        for (const batch of batches) {
          await this.processBatch(batch);
        }
      }

      const processingTime = performance.now() - processingStartTime;

    } catch (error) {
      console.error('[ToolCallCapture] Queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processBatch(captures: PendingToolCallCapture[]): Promise<void> {
    const startTime = performance.now();

    for (const capture of captures) {
      try {
        // Check if we're approaching time limit
        const elapsedTime = performance.now() - startTime;
        if (elapsedTime > this.maxProcessingTime) {
          console.warn(`[ToolCallCapture] Processing time limit reached, deferring remaining captures`);
          
          // Return remaining captures to pending map for next batch
          const remainingCaptures = captures.slice(captures.indexOf(capture));
          for (const remaining of remainingCaptures) {
            this.pendingCaptures.set(remaining.toolCallId, remaining);
          }
          break;
        }

        await this.processCapture(capture);

      } catch (error) {
        console.error(`[ToolCallCapture] Failed to process capture ${capture.toolCallId}:`, error);
        
        // Increment retry count
        capture.retryCount++;
        if (capture.retryCount < 3) {
          this.pendingCaptures.set(capture.toolCallId, capture);
        } else {
          this.stats.failedCaptures++;
        }
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private cleanupExpiredCaptures(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [toolCallId, capture] of Array.from(this.pendingCaptures.entries())) {
      // Remove captures that are too old or have been pending too long
      if (now - capture.requestTimestamp > this.captureTimeoutMs) {
        expiredIds.push(toolCallId);
      }
    }

    // Clean up expired captures
    for (const toolCallId of expiredIds) {
      console.warn(`[ToolCallCapture] Cleaning up expired capture: ${toolCallId}`);
      this.pendingCaptures.delete(toolCallId);
    }

    // Enforce maximum pending captures
    if (this.pendingCaptures.size > this.maxQueueSize) {
      const excessCount = this.pendingCaptures.size - this.maxQueueSize;
      const entries = Array.from(this.pendingCaptures.entries());
      const oldestCaptures = entries
        .sort(([,a], [,b]) => a.requestTimestamp - b.requestTimestamp)
        .slice(0, excessCount);

      for (const [toolCallId] of oldestCaptures) {
        console.warn(`[ToolCallCapture] Removing excess capture: ${toolCallId}`);
        this.pendingCaptures.delete(toolCallId);
      }
    }
  }
}