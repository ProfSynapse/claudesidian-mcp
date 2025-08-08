/**
 * Memory and Embedding Types
 * Extracted from workspace-types.ts for better organization
 */

import { HierarchyType } from '../workspace/WorkspaceTypes';

/**
 * File embedding interface
 */
export interface FileEmbedding {
  /**
   * Unique identifier
   */
  id: string;
  
  /**
   * Path to the file
   */
  filePath: string;
  
  /**
   * Creation timestamp
   */
  timestamp: number;
  
  /**
   * Associated workspace ID (optional)
   */
  workspaceId?: string;
  
  /**
   * Embedding vector
   */
  vector: number[];
  
  /**
   * The text content that was embedded (optional)
   */
  content?: string;
  
  /**
   * Chunk index when file content is split into multiple chunks (0-based)
   */
  chunkIndex?: number;
  
  /**
   * Total number of chunks for this file
   */
  totalChunks?: number;
  
  /**
   * Content hash for identifying this chunk
   */
  chunkHash?: string;
  
  /**
   * Semantic boundary type (paragraph, heading, code-block, list)
   */
  semanticBoundary?: 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown';
  
  /**
   * Additional metadata
   */
  metadata?: any;
}

/**
 * Memory trace for workspace activity
 * Records tool interactions with embedding for similarity search
 */
export interface WorkspaceMemoryTrace {
  /**
   * Unique identifier
   */
  id: string;
  
  /**
   * Associated workspace ID
   */
  workspaceId: string;
  
  /**
   * Full workspace path (main→phase→task)
   */
  workspacePath: string[];
  
  /**
   * Which level this applies to
   */
  contextLevel: HierarchyType;
  
  /**
   * When this interaction occurred
   */
  timestamp: number;
  
  /**
   * Type of project management activity
   */
  activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research';
  
  /**
   * Specific type of memory trace (more detailed than activityType)
   */
  type?: string;
  
  /**
   * The actual interaction content
   */
  content: string;
  
  /**
   * Vector representation for similarity search
   */
  embedding: number[];
  
  /**
   * Additional information about the interaction
   */
  metadata: {
    tool: string;
    params: any;
    result: any;
    relatedFiles: string[];
  };
  
  /**
   * Auto-scored importance (0-1)
   */
  importance: number;
  
  /**
   * Automatically generated descriptive tags
   */
  tags: string[];
  
  /**
   * Associated session ID (if created during a session)
   */
  sessionId?: string;
  
  /**
   * Sequence number within the session (for ordering)
   */
  sequenceNumber?: number;
}