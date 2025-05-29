/**
 * Interface for chunking service
 * Handles text chunking, chunk comparison, and chunk management
 */
export interface IChunkingService {
    /**
     * Split text into chunks based on strategy and settings
     * @param content Text content to chunk
     * @param options Chunking options
     * @returns Array of text chunks with metadata
     */
    chunkText(content: string, options: ChunkingOptions): TextChunk[];

    /**
     * Extract main content excluding frontmatter
     * @param content Full content with potential frontmatter
     * @returns Object with extracted frontmatter and main content
     */
    extractContent(content: string): ContentExtraction;

    /**
     * Compare two sets of chunks to find matches
     * @param oldChunks Previously chunked content
     * @param newChunks Newly chunked content
     * @param oldEmbeddingIds IDs of existing embeddings for old chunks
     * @returns Array of match results for each new chunk
     */
    findChunkMatches(
        oldChunks: TextChunk[], 
        newChunks: TextChunk[], 
        oldEmbeddingIds: string[]
    ): ChunkMatchResult[];

    /**
     * Get chunks that need new embeddings from match results
     * @param matchResults Results from chunk matching
     * @returns Chunks that need new embeddings generated
     */
    getChunksNeedingEmbedding(matchResults: ChunkMatchResult[]): ChunkEmbeddingRequest[];

    /**
     * Generate content hash for chunk deduplication
     * @param content Chunk content
     * @returns Hash string
     */
    generateContentHash(content: string): string;

    /**
     * Validate chunk size and content
     * @param chunk Text chunk to validate
     * @param maxTokens Maximum allowed tokens
     * @returns True if chunk is valid
     */
    validateChunk(chunk: TextChunk, maxTokens: number): boolean;
}

/**
 * Options for text chunking
 */
export interface ChunkingOptions {
    maxTokens: number;
    strategy: ChunkStrategy;
    includeMetadata?: boolean;
}

/**
 * Chunking strategies
 */
export type ChunkStrategy = 'paragraph' | 'sentence' | 'token' | 'semantic';

/**
 * Result of content extraction
 */
export interface ContentExtraction {
    frontmatter: string;
    mainContent: string;
    hasFrontmatter: boolean;
}

/**
 * Result of chunk matching
 */
export interface ChunkMatchResult {
    newChunk: TextChunk;
    matchType: 'exact' | 'similar' | 'new';
    oldEmbeddingId?: string;
    similarityScore?: number;
}

/**
 * Request for chunk embedding
 */
export interface ChunkEmbeddingRequest {
    newChunk: TextChunk;
    matchType: 'similar' | 'new';
    oldEmbeddingId?: string;
}

/**
 * Text chunk with metadata
 */
export interface TextChunk {
    content: string;
    metadata: ChunkMetadata;
}

/**
 * Metadata for text chunks
 */
export interface ChunkMetadata {
    chunkIndex: number;
    totalChunks: number;
    tokenCount: number;
    startPosition?: number;
    endPosition?: number;
    contentHash?: string;
    semanticBoundary?: 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown';
}
