/**
 * Utility class for processing ChromaDB query results
 */
export class QueryResultProcessor {
  /**
   * Convert ChromaDB distance to similarity score
   * @param distance ChromaDB distance value
   * @returns Similarity score (0-1)
   */
  static distanceToSimilarity(distance: number): number {
    return 1 - distance;
  }

  /**
   * Process ChromaDB query results into standardized format
   * @param results Raw ChromaDB query results
   * @param options Processing options
   * @returns Processed matches array
   */
  static processQueryResults(
    results: any,
    options?: {
      threshold?: number;
      collectionType?: 'file_embeddings' | 'memory_traces';
    }
  ): Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    metadata?: Record<string, any>;
  }> {
    if (!results.ids?.[0]?.length) {
      return [];
    }

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

      const similarity = this.distanceToSimilarity(distance);

      // Apply threshold filter if provided
      if (options?.threshold !== undefined && similarity < options.threshold) {
        continue;
      }

      // Determine file path based on collection type
      let filePath = '';
      if (options?.collectionType === 'file_embeddings') {
        filePath = metadata.path || metadata.filePath || '';
      } else {
        // For memory traces or default
        filePath = metadata.path || metadata.workspacePath || '';
      }

      matches.push({
        similarity,
        content: document,
        filePath,
        lineStart: metadata.lineStart,
        lineEnd: metadata.lineEnd,
        metadata
      });
    }

    return matches;
  }

  /**
   * Build ChromaDB where clause from search options
   * @param workspaceId Optional workspace ID filter
   * @param workspacePath Optional workspace path filter
   * @param sessionId Optional session ID filter
   * @param customFilters Optional custom filters
   * @returns ChromaDB where clause or undefined
   */
  static buildWhereClause(
    workspaceId?: string,
    workspacePath?: string[],
    sessionId?: string,
    customFilters?: Record<string, any>
  ): Record<string, any> | undefined {
    const where: Record<string, any> = {};

    if (workspaceId) {
      where['metadata.workspaceId'] = workspaceId;
    }

    if (workspacePath && workspacePath.length > 0) {
      const pathString = workspacePath.join('/');
      where['metadata.workspacePath'] = { $like: `${pathString}%` };
    }

    if (sessionId) {
      where['metadata.sessionId'] = sessionId;
    }

    // Merge custom filters
    if (customFilters) {
      Object.assign(where, customFilters);
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }
}