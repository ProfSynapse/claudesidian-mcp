/**
 * TokenEstimator - Handles token estimation for text content
 * Follows Single Responsibility Principle by focusing only on token counting
 */

/**
 * Service responsible for estimating token counts in text
 * Follows SRP by focusing only on token estimation operations
 */
export class TokenEstimator {
    /**
     * Estimate the number of tokens in a string
     * This is a simple approximation based on GPT tokenization patterns
     */
    estimateTokenCount(text: string): number {
        if (!text) return 0;
        // Approximate: 1 token ~= 4 characters for English text
        return Math.ceil(text.length / 4);
    }

    /**
     * Estimate tokens needed for overlap text
     */
    estimateOverlapTokens(text: string, tokenOverlap: number): number {
        const charOverlap = tokenOverlap * 4;
        if (text.length <= charOverlap) {
            return this.estimateTokenCount(text);
        }
        return tokenOverlap;
    }

    /**
     * Get character count for approximate token count
     */
    getCharacterCountForTokens(tokens: number): number {
        return tokens * 4;
    }

    /**
     * Validate token limits
     */
    validateTokenLimits(maxTokens: number, overlap: number): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (maxTokens <= 0) {
            errors.push('Maximum tokens must be positive');
        }

        if (overlap < 0) {
            errors.push('Overlap cannot be negative');
        }

        if (overlap >= maxTokens) {
            errors.push('Overlap must be less than maximum tokens');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get token statistics for text
     */
    getTokenStatistics(text: string): {
        totalTokens: number;
        averageTokensPerLine: number;
        averageTokensPerParagraph: number;
        lineCount: number;
        paragraphCount: number;
    } {
        const totalTokens = this.estimateTokenCount(text);
        const lines = text.split('\n');
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

        return {
            totalTokens,
            averageTokensPerLine: lines.length > 0 ? totalTokens / lines.length : 0,
            averageTokensPerParagraph: paragraphs.length > 0 ? totalTokens / paragraphs.length : 0,
            lineCount: lines.length,
            paragraphCount: paragraphs.length
        };
    }

    /**
     * Calculate optimal chunk size for text
     */
    calculateOptimalChunkSize(text: string, maxTokens: number): {
        recommendedChunkSize: number;
        estimatedChunks: number;
        efficiency: number;
    } {
        const totalTokens = this.estimateTokenCount(text);
        const estimatedChunks = Math.ceil(totalTokens / maxTokens);
        const recommendedChunkSize = Math.min(maxTokens, Math.ceil(totalTokens / estimatedChunks));
        const efficiency = (recommendedChunkSize / maxTokens) * 100;

        return {
            recommendedChunkSize,
            estimatedChunks,
            efficiency
        };
    }

    /**
     * Estimate processing time for chunking
     */
    estimateProcessingTime(text: string, strategy: string): {
        estimatedMs: number;
        complexity: 'low' | 'medium' | 'high';
    } {
        const textLength = text.length;
        const baseTime = textLength * 0.001; // 1ms per 1000 characters

        let multiplier = 1;
        let complexity: 'low' | 'medium' | 'high' = 'low';

        switch (strategy) {
            case 'fixed':
                multiplier = 1;
                complexity = 'low';
                break;
            case 'sentence':
                multiplier = 1.5;
                complexity = 'medium';
                break;
            case 'paragraph':
                multiplier = 2;
                complexity = 'medium';
                break;
            case 'heading':
                multiplier = 2.5;
                complexity = 'high';
                break;
            default:
                multiplier = 1.5;
                complexity = 'medium';
        }

        return {
            estimatedMs: Math.ceil(baseTime * multiplier),
            complexity
        };
    }

    /**
     * Get token distribution across text segments
     */
    getTokenDistribution(text: string): {
        byLine: number[];
        byParagraph: number[];
        statistics: {
            mean: number;
            median: number;
            standardDeviation: number;
            min: number;
            max: number;
        };
    } {
        const lines = text.split('\n');
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

        const byLine = lines.map(line => this.estimateTokenCount(line));
        const byParagraph = paragraphs.map(para => this.estimateTokenCount(para));

        const allTokens = [...byLine, ...byParagraph];
        const mean = allTokens.reduce((sum, count) => sum + count, 0) / allTokens.length;
        const sortedTokens = allTokens.sort((a, b) => a - b);
        const median = sortedTokens[Math.floor(sortedTokens.length / 2)];
        const variance = allTokens.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / allTokens.length;
        const standardDeviation = Math.sqrt(variance);

        return {
            byLine,
            byParagraph,
            statistics: {
                mean,
                median,
                standardDeviation,
                min: Math.min(...allTokens),
                max: Math.max(...allTokens)
            }
        };
    }
}