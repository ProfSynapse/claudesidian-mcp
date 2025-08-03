import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { WorkspaceMemoryTrace } from '../workspace-types';
import { v4 as uuidv4 } from 'uuid';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Collection manager for memory traces
 */
export class MemoryTraceCollection extends BaseChromaCollection<WorkspaceMemoryTrace> {
  /**
   * Create a new memory trace collection
   * @param vectorStore Vector store instance
   */
  constructor(vectorStore: IVectorStore) {
    super(vectorStore, 'memory_traces');
  }
  
  /**
   * Extract ID from a memory trace
   * @param trace Memory trace object
   * @returns Trace ID
   */
  protected extractId(trace: WorkspaceMemoryTrace): string {
    return trace.id;
  }
  
  /**
   * Convert a memory trace to storage format
   * @param trace Memory trace object
   * @returns Storage object
   */
  protected itemToStorage(trace: WorkspaceMemoryTrace): {
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  } {
    // Use the trace content as the document
    const document = trace.content;
    
    // Extract important metadata fields for filtering and searching
    const metadata = {
      workspaceId: trace.workspaceId,
      timestamp: trace.timestamp,
      activityType: trace.activityType,
      importance: trace.importance,
      sessionId: trace.sessionId || '',
      sequenceNumber: trace.sequenceNumber !== undefined ? trace.sequenceNumber : -1,
      tags: JSON.stringify(trace.tags),
      contextLevel: trace.contextLevel,
      
      // Path array converted to string for filtering
      workspacePath: trace.workspacePath.join('/'),
      
      // Store tool info for filtering
      tool: trace.metadata.tool,
      relatedFiles: JSON.stringify(trace.metadata.relatedFiles),
      
      // Metadata field for searching
      isMemoryTrace: true,
    };
    
    return {
      id: trace.id,
      embedding: trace.embedding,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to memory trace
   * @param storage Storage object
   * @returns Memory trace object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): WorkspaceMemoryTrace {
    // If no metadata or embedding is provided, we'll create a minimal trace
    if (!storage.metadata || !storage.embedding) {
      return {
        id: storage.id,
        workspaceId: '',
        workspacePath: [],
        contextLevel: 'workspace',
        timestamp: Date.now(),
        activityType: 'research',
        content: storage.document || '',
        embedding: storage.embedding || [],
        metadata: {
          tool: 'unknown',
          params: {},
          result: {},
          relatedFiles: []
        },
        importance: 0.5,
        tags: []
      };
    }
    
    // Reconstruct the memory trace from metadata and document
    return {
      id: storage.id,
      workspaceId: storage.metadata.workspaceId,
      workspacePath: storage.metadata.workspacePath ? 
        storage.metadata.workspacePath.split('/') : [],
      contextLevel: storage.metadata.contextLevel,
      timestamp: storage.metadata.timestamp,
      activityType: storage.metadata.activityType,
      content: storage.document || '',
      embedding: storage.embedding,
      metadata: {
        tool: storage.metadata.tool,
        params: storage.metadata.params ? JSON.parse(storage.metadata.params) : {},
        result: storage.metadata.result ? JSON.parse(storage.metadata.result) : {},
        relatedFiles: storage.metadata.relatedFiles ? 
          JSON.parse(storage.metadata.relatedFiles) : []
      },
      importance: storage.metadata.importance,
      tags: storage.metadata.tags ? JSON.parse(storage.metadata.tags) : [],
      sessionId: storage.metadata.sessionId || undefined,
      sequenceNumber: storage.metadata.sequenceNumber !== -1 ? 
        storage.metadata.sequenceNumber : undefined
    };
  }
  
  /**
   * Create a new memory trace
   * @param trace Memory trace data without ID
   * @returns Created memory trace with generated ID
   */
  async createMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    const id = uuidv4();
    const newTrace: WorkspaceMemoryTrace = {
      ...trace,
      id,
      timestamp: trace.timestamp || Date.now()
    };
    
    await this.add(newTrace);
    return newTrace;
  }
  
  /**
   * Get memory traces for a workspace
   * @param workspaceId Workspace ID
   * @param limit Maximum number of traces to return
   * @returns Memory traces for the workspace
   */
  async getTracesByWorkspace(workspaceId: string, limit = 100): Promise<WorkspaceMemoryTrace[]> {
    const traces = await this.getAll({
      where: { workspaceId },
      sortBy: 'timestamp',
      sortOrder: 'desc',
      limit
    });
    
    return traces;
  }
  
  /**
   * Get memory traces for a session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   * @returns Memory traces for the session
   */
  async getTracesBySession(sessionId: string, limit = 100): Promise<WorkspaceMemoryTrace[]> {
    const traces = await this.getAll({
      where: { sessionId },
      sortBy: 'sequenceNumber',
      sortOrder: 'asc',
      limit
    });
    
    return traces;
  }
  
  /**
   * Search memory traces by similarity
   * @param embedding Query embedding
   * @param options Search options
   * @returns Similar memory traces
   */
  async searchTraces(embedding: number[], options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    sessionId?: string;
  }): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    // Build where clause for filtering
    const where: Record<string, any> = {};
    
    if (options?.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    
    if (options?.workspacePath) {
      const pathString = options.workspacePath.join('/');
      where.workspacePath = { $like: `${pathString}%` };
    }
    
    if (options?.sessionId) {
      where.sessionId = options.sessionId;
    }
    
    // Query by similarity
    const results = await this.query(embedding, {
      limit: options?.limit || 10,
      where: Object.keys(where).length > 0 ? where : undefined
    });
    
    // Map to the expected return format
    return results.map(result => ({
      trace: result.item,
      similarity: result.similarity
    }));
  }
  
  /**
   * Search memory traces by text directly using ChromaDB's text search capabilities
   * @param query Query text
   * @param options Search options
   * @returns Similar memory traces and content
   */
  async searchDirectWithText(query: string, options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    sessionId?: string;
  }): Promise<Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    metadata?: Record<string, any>;
  }>> {
    // Build where clause for filtering
    const where: Record<string, any> = {};
    
    if (options?.workspaceId) {
      where['metadata.workspaceId'] = options.workspaceId;
    }
    
    if (options?.workspacePath) {
      const pathString = options.workspacePath.join('/');
      where['metadata.workspacePath'] = { $like: `${pathString}%` };
    }
    
    if (options?.sessionId) {
      where['metadata.sessionId'] = options.sessionId;
    }
    
    try {
      // Query ChromaDB with text query
      const results = await this.vectorStore.query(this.collectionName, {
        queryTexts: [query],
        nResults: options?.limit || 10,
        where: Object.keys(where).length > 0 ? where : undefined,
        include: ['metadatas', 'documents', 'distances']
      });
      
      if (!results.ids[0]?.length) {
        return [];
      }
      
      // Process and return the results
      const matches: Array<{
        similarity: number;
        content: string;
        filePath: string;
        lineStart?: number;
        lineEnd?: number;
        metadata?: Record<string, any>;
      }> = [];
      
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances?.[0]?.[i] || 0;
        const metadata = results.metadatas?.[0]?.[i] || {};
        const document = results.documents?.[0]?.[i] || '';
        
        // Convert distance to similarity
        const similarity = 1 - distance;
        
        // Note: No threshold filtering - return all results sorted by similarity
        
        matches.push({
          similarity,
          content: document,
          filePath: metadata.workspacePath || '',
          // Include line information if available
          lineStart: metadata.lineStart,
          lineEnd: metadata.lineEnd,
          metadata
        });
      }
      
      return matches;
    } catch (error) {
      console.error('Error in direct text search:', error);
      throw new Error(`Direct text search failed: ${getErrorMessage(error)}`);
    }
  }
}