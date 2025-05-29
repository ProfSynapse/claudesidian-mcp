import { 
    IChunkingService, 
    ChunkingOptions, 
    ContentExtraction, 
    ChunkMatchResult, 
    ChunkEmbeddingRequest, 
    TextChunk,
    ChunkMetadata
} from '../interfaces/IChunkingService';
import { chunkText } from '../utils/TextChunker';
import { ChunkMatcher } from '../utils/ChunkMatcher';
import * as crypto from 'crypto';

/**
 * Service for text chunking and chunk management
 * Handles text chunking, chunk comparison, and chunk metadata
 */
export class ChunkingService implements IChunkingService {
    
    /**
     * Split text into chunks based on strategy and settings
     */
    chunkText(content: string, options: ChunkingOptions): TextChunk[] {
        // Use the existing TextChunker utility
        return chunkText(content, {
            maxTokens: options.maxTokens,
            strategy: options.strategy as any,
            includeMetadata: options.includeMetadata || true
        });
    }

    /**
     * Extract main content excluding frontmatter
     */
    extractContent(content: string): ContentExtraction {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        
        if (frontmatterMatch) {
            return {
                frontmatter: frontmatterMatch[1],
                mainContent: content.slice(frontmatterMatch[0].length),
                hasFrontmatter: true
            };
        } else {
            return {
                frontmatter: '',
                mainContent: content,
                hasFrontmatter: false
            };
        }
    }

    /**
     * Compare two sets of chunks to find matches
     */
    findChunkMatches(
        oldChunks: TextChunk[], 
        newChunks: TextChunk[], 
        oldEmbeddingIds: string[]
    ): ChunkMatchResult[] {
        // Use the existing ChunkMatcher utility
        return ChunkMatcher.findBestMatches(oldChunks, newChunks, oldEmbeddingIds);
    }

    /**
     * Get chunks that need new embeddings from match results
     */
    getChunksNeedingEmbedding(matchResults: ChunkMatchResult[]): ChunkEmbeddingRequest[] {
        // Use the existing ChunkMatcher utility to filter results, then transform
        const chunksNeeding = ChunkMatcher.getChunksNeedingEmbedding(matchResults);
        
        return chunksNeeding
            .filter(result => result.matchType === 'similar' || result.matchType === 'new')
            .map(result => ({
                newChunk: result.newChunk,
                matchType: result.matchType as 'similar' | 'new',
                oldEmbeddingId: result.oldEmbeddingId
            }));
    }

    /**
     * Generate content hash for chunk deduplication
     */
    generateContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Validate chunk size and content
     */
    validateChunk(chunk: TextChunk, maxTokens: number): boolean {
        // Check if chunk has content
        if (!chunk.content || chunk.content.trim().length === 0) {
            return false;
        }

        // Check token count if available in metadata
        if (chunk.metadata && chunk.metadata.tokenCount) {
            return chunk.metadata.tokenCount <= maxTokens;
        }

        // Fallback: approximate token count (rough estimate: 1 token ≈ 4 characters)
        const approxTokens = chunk.content.length / 4;
        return approxTokens <= maxTokens;
    }

    /**
     * Create chunk metadata
     */
    createChunkMetadata(
        content: string, 
        chunkIndex: number, 
        totalChunks: number,
        startPosition: number = 0,
        endPosition?: number
    ): ChunkMetadata {
        return {
            chunkIndex,
            totalChunks,
            tokenCount: this.estimateTokenCount(content),
            startPosition,
            endPosition: endPosition || startPosition + content.length,
            contentHash: this.generateContentHash(content),
            semanticBoundary: this.detectSemanticBoundary(content)
        };
    }

    /**
     * Estimate token count for text
     */
    private estimateTokenCount(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters for English text
        // This is a simplified estimate; actual tokenization would be more accurate
        return Math.ceil(text.length / 4);
    }

    /**
     * Detect semantic boundary type for chunk
     */
    private detectSemanticBoundary(content: string): 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown' {
        const trimmed = content.trim();
        
        // Check for heading
        if (trimmed.match(/^#{1,6}\s/)) {
            return 'heading';
        }
        
        // Check for code block
        if (trimmed.match(/^```/) || trimmed.match(/^    /)) {
            return 'code-block';
        }
        
        // Check for list
        if (trimmed.match(/^[\-\*\+]\s/) || trimmed.match(/^\d+\.\s/)) {
            return 'list';
        }
        
        // Check for paragraph (has punctuation at the end)
        if (trimmed.match(/[.!?]$/)) {
            return 'paragraph';
        }
        
        return 'unknown';
    }


    /**
     * Merge small chunks if they're below minimum size
     */
    mergeSmallChunks(chunks: TextChunk[], minTokens: number = 100): TextChunk[] {
        if (chunks.length <= 1) {
            return chunks;
        }

        const merged: TextChunk[] = [];
        let current: TextChunk | null = null;

        for (const chunk of chunks) {
            if (!current) {
                current = { ...chunk };
                continue;
            }

            // If current chunk is too small and can be merged with next
            if (current.metadata.tokenCount < minTokens && 
                current.metadata.tokenCount + chunk.metadata.tokenCount < minTokens * 2) {
                
                // Merge chunks
                current.content += '\n\n' + chunk.content;
                current.metadata = this.createChunkMetadata(
                    current.content,
                    current.metadata.chunkIndex,
                    chunks.length, // Will be updated later
                    current.metadata.startPosition,
                    chunk.metadata.endPosition
                );
            } else {
                // Add current to merged and start new current
                merged.push(current);
                current = { ...chunk };
            }
        }

        // Add the last chunk
        if (current) {
            merged.push(current);
        }

        // Update chunk indices and total counts
        return merged.map((chunk, index) => ({
            ...chunk,
            metadata: {
                ...chunk.metadata,
                chunkIndex: index,
                totalChunks: merged.length
            }
        }));
    }

    /**
     * Split overlarge chunks that exceed maximum tokens
     */
    splitOverlargeChunks(chunks: TextChunk[], maxTokens: number): TextChunk[] {
        const result: TextChunk[] = [];

        for (const chunk of chunks) {
            if (chunk.metadata.tokenCount <= maxTokens) {
                result.push(chunk);
                continue;
            }

            // Split chunk into smaller pieces
            const subChunks = this.splitChunkByTokens(chunk, maxTokens);
            result.push(...subChunks);
        }

        // Update chunk indices and total counts
        return result.map((chunk, index) => ({
            ...chunk,
            metadata: {
                ...chunk.metadata,
                chunkIndex: index,
                totalChunks: result.length
            }
        }));
    }

    /**
     * Split a single chunk by token limit
     */
    private splitChunkByTokens(chunk: TextChunk, maxTokens: number): TextChunk[] {
        const content = chunk.content;
        const targetLength = Math.floor(content.length * maxTokens / chunk.metadata.tokenCount);
        
        const subChunks: TextChunk[] = [];
        let start = 0;
        let chunkIndex = 0;

        while (start < content.length) {
            let end = Math.min(start + targetLength, content.length);
            
            // Try to break at word boundary
            if (end < content.length) {
                const spaceIndex = content.lastIndexOf(' ', end);
                if (spaceIndex > start) {
                    end = spaceIndex;
                }
            }

            const subContent = content.substring(start, end).trim();
            if (subContent.length > 0) {
                subChunks.push({
                    content: subContent,
                    metadata: this.createChunkMetadata(
                        subContent,
                        chunkIndex,
                        1, // Will be updated later
                        (chunk.metadata.startPosition || 0) + start,
                        (chunk.metadata.startPosition || 0) + end
                    )
                });
                chunkIndex++;
            }

            start = end + 1; // Skip the space
        }

        // Update total chunks count
        return subChunks.map((subChunk, index) => ({
            ...subChunk,
            metadata: {
                ...subChunk.metadata,
                chunkIndex: index,
                totalChunks: subChunks.length
            }
        }));
    }
}
