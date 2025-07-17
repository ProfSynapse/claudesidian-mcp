/**
 * Types for text chunking system
 */

export interface ChunkOptions {
    /**
     * Maximum number of tokens per chunk
     * Default: 8000 (just under OpenAI's 8192 limit)
     */
    maxTokens?: number;
    
    /**
     * Number of tokens to overlap between chunks for context preservation
     * Default: 200
     */
    overlap?: number;
    
    /**
     * Strategy for chunking
     * Default: paragraph
     */
    strategy?: 'paragraph' | 'sentence' | 'fixed' | 'heading' | 'sliding-window' | 'full-document';
    
    /**
     * When using fixed strategy, the number of characters per chunk
     * Default: 4000 characters (about 1000 tokens)
     */
    chunkSize?: number;
    
    /**
     * Whether to include metadata about the chunk's position in the original document
     * Default: true
     */
    includeMetadata?: boolean;
}

export interface TextChunk {
    /**
     * The chunked text content
     */
    content: string;
    
    /**
     * Metadata about the chunk
     */
    metadata: {
        /**
         * Index of the chunk in the sequence (0-based)
         */
        chunkIndex: number;
        
        /**
         * Total number of chunks in the document
         */
        totalChunks: number;
        
        /**
         * Approximate start position in the original text
         */
        startPosition?: number;
        
        /**
         * Approximate end position in the original text
         */
        endPosition?: number;
        
        /**
         * Estimated token count in this chunk
         */
        tokenCount: number;
        
        /**
         * Content hash for identifying this chunk
         */
        contentHash?: string;
        
        /**
         * Semantic boundary type (paragraph, heading, code-block, list)
         */
        semanticBoundary?: 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown';
    };
}