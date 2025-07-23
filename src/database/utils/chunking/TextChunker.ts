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
     * Split text into chunks using semantic paragraph boundaries
     * Respects document structure (headings, lists, code blocks, paragraphs)
     */
    chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
        // Semantic chunking - respects document structure without arbitrary limits
        const includeMetadata = options.includeMetadata ?? true;

        // Validate input
        const contentValidation = this.contentAnalyzer.validateContent(text);
        if (!contentValidation.isValid) {
            throw new Error(contentValidation.errors.join(', '));
        }

        if (!text || text.trim().length === 0) {
            return [];
        }

        // Always use semantic paragraph chunking
        let chunks: TextChunk[] = [];
        chunks = this.chunkingStrategies.chunkByParagraph(text, 0, 0); // Parameters ignored in new implementation

        // Add position metadata if requested
        if (includeMetadata) {
            chunks = this.metadataManager.addPositionMetadata(chunks, 0);
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
     * Analyze text structure (semantic chunking always uses paragraph boundaries)
     */
    analyzeTextStructure(text: string): {
        strategy: string;
        reason: string;
        analysis: any;
    } {
        const analysis = this.contentAnalyzer.analyzeTextStructure(text);
        
        return {
            strategy: 'semantic-paragraph',
            reason: 'Uses semantic paragraph boundaries with respect for markdown structure',
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