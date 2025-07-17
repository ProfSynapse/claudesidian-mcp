/**
 * Text chunking module exports
 * Provides centralized access to all chunking functionality
 */

export { TextChunker } from './TextChunker';
export type { ChunkOptions, TextChunk } from './types';
export { 
    TokenEstimator, 
    ContentAnalyzer, 
    ChunkingStrategies, 
    ChunkMetadataManager 
} from './services';

// Legacy functions for backward compatibility
import { ContentAnalyzer } from './services/ContentAnalyzer';
import { TokenEstimator } from './services/TokenEstimator';
import { TextChunker } from './TextChunker';
import { ChunkOptions, TextChunk } from './types';

const contentAnalyzer = new ContentAnalyzer();
const tokenEstimator = new TokenEstimator();
const textChunker = new TextChunker();

export function generateChunkHash(content: string): string {
    return contentAnalyzer.generateChunkHash(content);
}

export function detectSemanticBoundary(content: string): 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown' {
    return contentAnalyzer.detectSemanticBoundary(content);
}

export function estimateTokenCount(text: string): number {
    return tokenEstimator.estimateTokenCount(text);
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
    return textChunker.chunkText(text, options);
}