/**
 * TextChunker - Re-export of refactored components
 * Original file has been refactored following SOLID principles
 */

// Re-export the main TextChunker class and all utilities
export { TextChunker } from './chunking';
export type { ChunkOptions, TextChunk } from './chunking';

// Re-export legacy functions for backward compatibility
export { generateChunkHash, detectSemanticBoundary, estimateTokenCount, chunkText } from './chunking';