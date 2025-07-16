/**
 * Search and Memory Query Types
 * Extracted from types.ts for better organization
 */

/**
 * Embeddings and memory storage types
 */
export interface EmbeddingRecord {
  id: string;              
  filePath: string;        
  lineStart: number;       
  lineEnd: number;         
  content: string;         
  embedding: number[];     
  createdAt: number;
  updatedAt: number;
  metadata: {              
    frontmatter: Record<string, any>;
    tags: string[];
    createdDate?: string;
    modifiedDate?: string;
    links: {
      outgoing: Array<{
        displayText: string;
        targetPath: string;
        position: { line: number; col: number; }
      }>;
      incoming: Array<{
        sourcePath: string;
        displayText: string;
        position: { line: number; col: number; }
      }>;
    }
  }
}

export interface MemoryQueryParams {
  query: string;         
  limit?: number;        
  threshold?: number;    
  filters?: {            
    tags?: string[];     
    paths?: string[];    
    properties?: Record<string, any>;
    dateRange?: {        
      start?: string;
      end?: string;
    }
  },
  graphOptions?: {
    useGraphBoost: boolean;
    boostFactor: number;
    includeNeighbors: boolean;
    maxDistance: number;
    seedNotes?: string[];
  }
}

export interface MemoryQueryResult {
  matches: Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    metadata: {
      frontmatter: Record<string, any>;
      tags: string[];
      links: {
        outgoing: Array<{
          displayText: string;
          targetPath: string;
        }>;
        incoming: Array<{
          sourcePath: string;
          displayText: string;
        }>;
      }
    }
  }>
}

export interface MemoryUsageStats {
  tokensThisMonth: number;
  totalEmbeddings: number;
  dbSizeMB: number;
  lastIndexedDate: string;
  indexingInProgress: boolean;
  estimatedCost?: number;
  modelUsage?: {
    'text-embedding-3-small': number;
    'text-embedding-3-large': number;
  };
}