/**
 * ContentAnalyzer - Handles content analysis and semantic boundary detection
 * Follows Single Responsibility Principle by focusing only on content analysis
 */

import * as crypto from 'crypto';
import { TextChunk } from '../types';

/**
 * Service responsible for analyzing text content and detecting semantic boundaries
 * Follows SRP by focusing only on content analysis operations
 */
export class ContentAnalyzer {
    /**
     * Generate a content hash for a chunk
     */
    generateChunkHash(content: string): string {
        return crypto.createHash('md5').update(content.trim()).digest('hex');
    }

    /**
     * Detect the semantic boundary type of a text chunk
     */
    detectSemanticBoundary(content: string): 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown' {
        const trimmed = content.trim();
        
        // Check for headings (Markdown style)
        if (/^#{1,6}\s+/.test(trimmed)) {
            return 'heading';
        }
        
        // Check for code blocks
        if (trimmed.startsWith('```') || /^(\s{4}|\t)/.test(trimmed.split('\n')[0])) {
            return 'code-block';
        }
        
        // Check for lists
        if (/^[\s]*[-*+]\s+|^[\s]*\d+\.\s+/.test(trimmed)) {
            return 'list';
        }
        
        // Check if it looks like a regular paragraph
        if (trimmed.length > 50 && !trimmed.includes('\n\n')) {
            return 'paragraph';
        }
        
        return 'unknown';
    }

    /**
     * Analyze text structure for optimal chunking strategy
     */
    analyzeTextStructure(text: string): {
        hasHeadings: boolean;
        hasCodeBlocks: boolean;
        hasLists: boolean;
        hasTables: boolean;
        paragraphCount: number;
        averageParagraphLength: number;
        recommendedStrategy: 'paragraph' | 'sentence' | 'fixed' | 'heading' | 'sliding-window' | 'full-document';
    } {
        const lines = text.split('\n');
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

        const hasHeadings = /^#{1,6}\s+/m.test(text);
        const hasCodeBlocks = text.includes('```') || /^(\s{4}|\t)/m.test(text);
        const hasLists = /^[\s]*[-*+]\s+|^[\s]*\d+\.\s+/m.test(text);
        const hasTables = /\|.*\|/m.test(text);

        const paragraphCount = paragraphs.length;
        const averageParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphCount;

        let recommendedStrategy: 'paragraph' | 'sentence' | 'fixed' | 'heading' | 'sliding-window' | 'full-document' = 'paragraph';

        if (hasHeadings && paragraphCount > 10) {
            recommendedStrategy = 'heading';
        } else if (hasCodeBlocks) {
            recommendedStrategy = 'paragraph'; // Better for preserving code structure
        } else if (averageParagraphLength > 2000) {
            recommendedStrategy = 'sentence';
        } else if (paragraphCount < 3) {
            recommendedStrategy = 'fixed';
        }

        return {
            hasHeadings,
            hasCodeBlocks,
            hasLists,
            hasTables,
            paragraphCount,
            averageParagraphLength,
            recommendedStrategy
        };
    }

    /**
     * Check if text is a code block
     */
    isCodeBlock(text: string): boolean {
        const trimmed = text.trim();
        return trimmed.startsWith('```') || 
               text.split('\n').every(line => line.startsWith('    ') || line.startsWith('\t') || !line.trim());
    }

    /**
     * Check if text is a list
     */
    isList(text: string): boolean {
        const listItemRegex = /^[\s]*[-*+][\s]+|^[\s]*\d+\.[\s]+/;
        const lines = text.split('\n');
        return lines.some(line => listItemRegex.test(line));
    }

    /**
     * Get list item regex pattern
     */
    getListItemRegex(): RegExp {
        return /^[\s]*[-*+][\s]+|^[\s]*\d+\.[\s]+/;
    }

    /**
     * Split text into paragraphs
     */
    splitIntoParagraphs(text: string): string[] {
        return text.split(/\n\s*\n/).filter(p => p.trim());
    }

    /**
     * Split text into sentences
     */
    splitIntoSentences(text: string): string[] {
        return text.match(/[^.!?]+[.!?]+/g) || [text];
    }

    /**
     * Split text into lines
     */
    splitIntoLines(text: string): string[] {
        return text.split('\n');
    }

    /**
     * Get overlap text from the end of a chunk
     */
    getOverlapText(text: string, tokenOverlap: number): string {
        // Approximate characters needed for the overlap
        const charOverlap = tokenOverlap * 4;
        
        if (text.length <= charOverlap) {
            return text;
        }
        
        return text.substring(text.length - charOverlap);
    }

    /**
     * Validate text content for chunking
     */
    validateContent(text: string): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!text) {
            errors.push('Text content is required');
        }

        if (typeof text !== 'string') {
            errors.push('Text content must be a string');
        }

        if (text && text.trim().length === 0) {
            warnings.push('Text content is empty');
        }

        if (text && text.length > 1000000) {
            warnings.push('Text content is very large (>1MB) - processing may be slow');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get content statistics
     */
    getContentStatistics(text: string): {
        totalCharacters: number;
        totalLines: number;
        totalParagraphs: number;
        totalSentences: number;
        hasSpecialContent: {
            codeBlocks: boolean;
            lists: boolean;
            headings: boolean;
            tables: boolean;
        };
    } {
        const lines = this.splitIntoLines(text);
        const paragraphs = this.splitIntoParagraphs(text);
        const sentences = this.splitIntoSentences(text);

        return {
            totalCharacters: text.length,
            totalLines: lines.length,
            totalParagraphs: paragraphs.length,
            totalSentences: sentences.length,
            hasSpecialContent: {
                codeBlocks: this.isCodeBlock(text),
                lists: this.isList(text),
                headings: /^#{1,6}\s+/m.test(text),
                tables: /\|.*\|/m.test(text)
            }
        };
    }

    /**
     * Create chunk metadata
     */
    createChunkMetadata(
        content: string,
        chunkIndex: number,
        totalChunks: number,
        tokenCount: number,
        startPosition?: number,
        endPosition?: number
    ): TextChunk['metadata'] {
        return {
            chunkIndex,
            totalChunks,
            startPosition,
            endPosition,
            tokenCount,
            contentHash: this.generateChunkHash(content),
            semanticBoundary: this.detectSemanticBoundary(content)
        };
    }

    /**
     * Analyze chunk quality
     */
    analyzeChunkQuality(chunk: TextChunk): {
        score: number;
        issues: string[];
        recommendations: string[];
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];
        let score = 100;

        // Check for very small chunks
        if (chunk.content.length < 50) {
            issues.push('Chunk is very small');
            score -= 20;
            recommendations.push('Consider increasing chunk size or merging with adjacent chunks');
        }

        // Check for very large chunks
        if (chunk.metadata.tokenCount > 8000) {
            issues.push('Chunk exceeds recommended token limit');
            score -= 30;
            recommendations.push('Consider splitting this chunk further');
        }

        // Check for incomplete sentences
        if (chunk.metadata.semanticBoundary === 'unknown') {
            issues.push('Chunk has unclear semantic boundaries');
            score -= 15;
            recommendations.push('Consider adjusting chunking strategy');
        }

        // Check for code blocks
        if (chunk.metadata.semanticBoundary === 'code-block') {
            score += 10; // Code blocks are generally good chunks
        }

        return {
            score: Math.max(0, score),
            issues,
            recommendations
        };
    }
}