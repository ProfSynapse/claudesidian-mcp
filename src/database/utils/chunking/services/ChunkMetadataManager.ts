/**
 * ChunkMetadataManager - Handles chunk metadata and positioning
 * Follows Single Responsibility Principle by focusing only on metadata operations
 */

import { TextChunk } from '../types';
import { TokenEstimator } from './TokenEstimator';

/**
 * Service responsible for managing chunk metadata and positioning
 * Follows SRP by focusing only on metadata management operations
 */
export class ChunkMetadataManager {
    constructor(private tokenEstimator: TokenEstimator) {}

    /**
     * Add position metadata to chunks
     */
    addPositionMetadata(chunks: TextChunk[], overlap: number): TextChunk[] {
        let approxPosition = 0;
        
        return chunks.map((chunk, index) => {
            const startPosition = approxPosition;
            const endPosition = startPosition + chunk.content.length;
            approxPosition = endPosition - (overlap * 4); // Approximate overlap in characters
            
            return {
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    chunkIndex: index,
                    totalChunks: chunks.length,
                    startPosition,
                    endPosition
                }
            };
        });
    }

    /**
     * Update chunk indices and total counts
     */
    updateChunkIndices(chunks: TextChunk[]): TextChunk[] {
        return chunks.map((chunk, index) => ({
            ...chunk,
            metadata: {
                ...chunk.metadata,
                chunkIndex: index,
                totalChunks: chunks.length
            }
        }));
    }

    /**
     * Validate chunk metadata
     */
    validateChunkMetadata(chunk: TextChunk): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        if (chunk.metadata.chunkIndex < 0) {
            errors.push('Chunk index must be non-negative');
        }

        if (chunk.metadata.totalChunks <= 0) {
            errors.push('Total chunks must be positive');
        }

        if (chunk.metadata.chunkIndex >= chunk.metadata.totalChunks) {
            errors.push('Chunk index must be less than total chunks');
        }

        if (chunk.metadata.tokenCount <= 0) {
            errors.push('Token count must be positive');
        }

        // Check positions if provided
        if (chunk.metadata.startPosition !== undefined && chunk.metadata.endPosition !== undefined) {
            if (chunk.metadata.startPosition < 0) {
                errors.push('Start position must be non-negative');
            }

            if (chunk.metadata.endPosition < chunk.metadata.startPosition) {
                errors.push('End position must be greater than start position');
            }

            const expectedLength = chunk.metadata.endPosition - chunk.metadata.startPosition;
            if (Math.abs(expectedLength - chunk.content.length) > 10) {
                warnings.push('Position metadata may be inaccurate');
            }
        }

        // Check token count accuracy
        const estimatedTokens = this.tokenEstimator.estimateTokenCount(chunk.content);
        if (Math.abs(estimatedTokens - chunk.metadata.tokenCount) > estimatedTokens * 0.1) {
            warnings.push('Token count may be inaccurate');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get chunk statistics
     */
    getChunkStatistics(chunks: TextChunk[]): {
        totalChunks: number;
        totalTokens: number;
        totalCharacters: number;
        averageTokensPerChunk: number;
        averageCharactersPerChunk: number;
        tokenDistribution: {
            min: number;
            max: number;
            mean: number;
            median: number;
            standardDeviation: number;
        };
        semanticBoundaryDistribution: Record<string, number>;
    } {
        const tokenCounts = chunks.map(chunk => chunk.metadata.tokenCount);
        const characterCounts = chunks.map(chunk => chunk.content.length);
        
        const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
        const totalCharacters = characterCounts.reduce((sum, count) => sum + count, 0);
        
        const sortedTokens = [...tokenCounts].sort((a, b) => a - b);
        const mean = totalTokens / chunks.length;
        const median = sortedTokens[Math.floor(sortedTokens.length / 2)];
        const variance = tokenCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / chunks.length;
        const standardDeviation = Math.sqrt(variance);

        const semanticBoundaryDistribution: Record<string, number> = {};
        chunks.forEach(chunk => {
            const boundary = chunk.metadata.semanticBoundary || 'unknown';
            semanticBoundaryDistribution[boundary] = (semanticBoundaryDistribution[boundary] || 0) + 1;
        });

        return {
            totalChunks: chunks.length,
            totalTokens,
            totalCharacters,
            averageTokensPerChunk: mean,
            averageCharactersPerChunk: totalCharacters / chunks.length,
            tokenDistribution: {
                min: Math.min(...tokenCounts),
                max: Math.max(...tokenCounts),
                mean,
                median,
                standardDeviation
            },
            semanticBoundaryDistribution
        };
    }

    /**
     * Find chunks by token range
     */
    findChunksByTokenRange(chunks: TextChunk[], minTokens: number, maxTokens: number): TextChunk[] {
        return chunks.filter(chunk => 
            chunk.metadata.tokenCount >= minTokens && 
            chunk.metadata.tokenCount <= maxTokens
        );
    }

    /**
     * Find chunks by semantic boundary
     */
    findChunksBySemanticBoundary(chunks: TextChunk[], boundary: string): TextChunk[] {
        return chunks.filter(chunk => chunk.metadata.semanticBoundary === boundary);
    }

    /**
     * Get chunk quality metrics
     */
    getChunkQualityMetrics(chunks: TextChunk[]): {
        overallQuality: number;
        issues: string[];
        recommendations: string[];
        qualityBreakdown: {
            excellent: number;
            good: number;
            fair: number;
            poor: number;
        };
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];
        const qualityBreakdown = { excellent: 0, good: 0, fair: 0, poor: 0 };

        let totalScore = 0;
        let verySmallChunks = 0;
        let veryLargeChunks = 0;
        let unknownBoundaries = 0;

        chunks.forEach(chunk => {
            const validation = this.validateChunkMetadata(chunk);
            if (!validation.isValid) {
                issues.push(...validation.errors);
            }

            // Calculate quality score
            let score = 100;
            
            if (chunk.content.length < 50) {
                score -= 20;
                verySmallChunks++;
            }
            
            if (chunk.metadata.tokenCount > 8000) {
                score -= 30;
                veryLargeChunks++;
            }
            
            if (chunk.metadata.semanticBoundary === 'unknown') {
                score -= 15;
                unknownBoundaries++;
            }

            totalScore += score;

            // Categorize quality
            if (score >= 90) qualityBreakdown.excellent++;
            else if (score >= 70) qualityBreakdown.good++;
            else if (score >= 50) qualityBreakdown.fair++;
            else qualityBreakdown.poor++;
        });

        // Generate recommendations
        if (verySmallChunks > chunks.length * 0.2) {
            recommendations.push('Consider increasing chunk size or merging small chunks');
        }

        if (veryLargeChunks > 0) {
            recommendations.push('Consider splitting very large chunks');
        }

        if (unknownBoundaries > chunks.length * 0.3) {
            recommendations.push('Consider adjusting chunking strategy for better semantic boundaries');
        }

        return {
            overallQuality: totalScore / chunks.length,
            issues,
            recommendations,
            qualityBreakdown
        };
    }

    /**
     * Sort chunks by various criteria
     */
    sortChunks(chunks: TextChunk[], criteria: 'index' | 'tokenCount' | 'length' | 'position'): TextChunk[] {
        return [...chunks].sort((a, b) => {
            switch (criteria) {
                case 'index':
                    return a.metadata.chunkIndex - b.metadata.chunkIndex;
                case 'tokenCount':
                    return b.metadata.tokenCount - a.metadata.tokenCount;
                case 'length':
                    return b.content.length - a.content.length;
                case 'position':
                    return (a.metadata.startPosition || 0) - (b.metadata.startPosition || 0);
                default:
                    return 0;
            }
        });
    }

    /**
     * Merge consecutive chunks
     */
    mergeConsecutiveChunks(chunks: TextChunk[], maxTokens: number): TextChunk[] {
        if (chunks.length <= 1) return chunks;

        const merged: TextChunk[] = [];
        let currentChunk = chunks[0];

        for (let i = 1; i < chunks.length; i++) {
            const nextChunk = chunks[i];
            const combinedTokens = currentChunk.metadata.tokenCount + nextChunk.metadata.tokenCount;

            if (combinedTokens <= maxTokens) {
                // Merge chunks
                currentChunk = {
                    content: currentChunk.content + '\n' + nextChunk.content,
                    metadata: {
                        ...currentChunk.metadata,
                        tokenCount: combinedTokens,
                        endPosition: nextChunk.metadata.endPosition,
                        contentHash: undefined // Will be regenerated
                    }
                };
            } else {
                // Cannot merge, add current chunk and start new one
                merged.push(currentChunk);
                currentChunk = nextChunk;
            }
        }

        // Add the last chunk
        merged.push(currentChunk);

        // Update indices
        return this.updateChunkIndices(merged);
    }

    /**
     * Export chunk metadata to JSON
     */
    exportMetadata(chunks: TextChunk[]): string {
        const metadata = chunks.map(chunk => ({
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks,
            tokenCount: chunk.metadata.tokenCount,
            startPosition: chunk.metadata.startPosition,
            endPosition: chunk.metadata.endPosition,
            contentHash: chunk.metadata.contentHash,
            semanticBoundary: chunk.metadata.semanticBoundary,
            contentLength: chunk.content.length,
            contentPreview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : '')
        }));

        return JSON.stringify(metadata, null, 2);
    }
}