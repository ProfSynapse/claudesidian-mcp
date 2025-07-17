/**
 * TextChunker - Main orchestrator for text chunking operations
 * Follows Single Responsibility Principle by delegating specialized tasks to services
 */

import { ChunkOptions, TextChunk } from './types';
import { 
    TokenEstimator, 
    ContentAnalyzer, 
    ChunkingStrategies, 
    ChunkMetadataManager 
} from './services';

/**
 * Main orchestrator for text chunking workflow
 * Delegates specialized tasks to focused services following SOLID principles
 */
export class TextChunker {
    private tokenEstimator: TokenEstimator;
    private contentAnalyzer: ContentAnalyzer;
    private chunkingStrategies: ChunkingStrategies;
    private metadataManager: ChunkMetadataManager;

    constructor() {
        this.tokenEstimator = new TokenEstimator();
        this.contentAnalyzer = new ContentAnalyzer();
        this.chunkingStrategies = new ChunkingStrategies(this.contentAnalyzer, this.tokenEstimator);
        this.metadataManager = new ChunkMetadataManager(this.tokenEstimator);
    }

    /**
     * Split text into chunks that respect token limits
     */
    chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
        // Default options
        const maxTokens = options.maxTokens ?? 8000;
        const overlap = options.overlap ?? 200;
        const strategy = options.strategy ?? 'paragraph';
        const chunkSize = options.chunkSize ?? 4000;
        const includeMetadata = options.includeMetadata ?? true;

        // Validate input
        const contentValidation = this.contentAnalyzer.validateContent(text);
        if (!contentValidation.isValid) {
            throw new Error(contentValidation.errors.join(', '));
        }

        if (!text || text.trim().length === 0) {
            return [];
        }

        // Validate token limits
        const tokenValidation = this.tokenEstimator.validateTokenLimits(maxTokens, overlap);
        if (!tokenValidation.isValid) {
            throw new Error(tokenValidation.errors.join(', '));
        }

        // Validate strategy
        const strategyValidation = this.chunkingStrategies.validateStrategy(strategy);
        if (!strategyValidation.isValid) {
            throw new Error(strategyValidation.error!);
        }

        // Estimate token count of full text
        const estimatedTokens = this.tokenEstimator.estimateTokenCount(text);

        // For full-document strategy, always return the whole document
        if (strategy === 'full-document') {
            return this.chunkingStrategies.chunkAsFullDocument(text);
        }

        // For fixed-size strategy, if the text is already within limits, return it as a single chunk
        if (strategy === 'fixed' && estimatedTokens <= maxTokens) {
            return this.chunkingStrategies.chunkAsFullDocument(text);
        }

        // Choose chunking strategy based on options
        let chunks: TextChunk[] = [];

        switch (strategy) {
            case 'paragraph':
                chunks = this.chunkingStrategies.chunkByParagraph(text, maxTokens, overlap);
                break;
            case 'sentence':
                chunks = this.chunkingStrategies.chunkBySentence(text, maxTokens, overlap);
                break;
            case 'fixed':
                chunks = this.chunkingStrategies.chunkByFixedSize(text, chunkSize, overlap);
                break;
            case 'heading':
                // TODO: Implement heading-based chunking
                // For now, fallback to paragraph chunking
                chunks = this.chunkingStrategies.chunkByParagraph(text, maxTokens, overlap);
                break;
            case 'sliding-window':
                // Sliding window is similar to fixed size with overlap
                chunks = this.chunkingStrategies.chunkByFixedSize(text, chunkSize, overlap);
                break;
            default:
                chunks = this.chunkingStrategies.chunkByParagraph(text, maxTokens, overlap);
        }

        // Add position metadata if requested
        if (includeMetadata) {
            chunks = this.metadataManager.addPositionMetadata(chunks, overlap);
        }

        return chunks;
    }

    /**
     * Get token estimation service
     */
    getTokenEstimator(): TokenEstimator {
        return this.tokenEstimator;
    }

    /**
     * Get content analysis service
     */
    getContentAnalyzer(): ContentAnalyzer {
        return this.contentAnalyzer;
    }

    /**
     * Get chunking strategies service
     */
    getChunkingStrategies(): ChunkingStrategies {
        return this.chunkingStrategies;
    }

    /**
     * Get metadata manager service
     */
    getMetadataManager(): ChunkMetadataManager {
        return this.metadataManager;
    }

    /**
     * Analyze text and recommend optimal chunking strategy
     */
    recommendChunkingStrategy(text: string, maxTokens: number = 8000): {
        recommendedStrategy: string;
        reason: string;
        analysis: any;
    } {
        const analysis = this.contentAnalyzer.analyzeTextStructure(text);
        
        let recommendedStrategy = analysis.recommendedStrategy;
        let reason = 'Based on text structure analysis';

        // Additional logic based on token count
        const tokenCount = this.tokenEstimator.estimateTokenCount(text);
        
        if (tokenCount <= maxTokens) {
            recommendedStrategy = 'full-document';
            reason = 'Text fits within token limit, no chunking needed';
        } else if (tokenCount <= maxTokens * 2 && analysis.paragraphCount <= 3) {
            recommendedStrategy = 'fixed';
            reason = 'Short text with few paragraphs, fixed chunking is efficient';
        }

        return {
            recommendedStrategy,
            reason,
            analysis
        };
    }

    /**
     * Validate chunk quality
     */
    validateChunks(chunks: TextChunk[]): {
        isValid: boolean;
        quality: number;
        issues: string[];
        recommendations: string[];
    } {
        const qualityMetrics = this.metadataManager.getChunkQualityMetrics(chunks);
        
        return {
            isValid: qualityMetrics.issues.length === 0,
            quality: qualityMetrics.overallQuality,
            issues: qualityMetrics.issues,
            recommendations: qualityMetrics.recommendations
        };
    }
}