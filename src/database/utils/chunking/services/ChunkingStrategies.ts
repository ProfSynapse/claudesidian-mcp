/**
 * ChunkingStrategies - Handles different text chunking strategies
 * Follows Single Responsibility Principle by focusing only on chunking logic
 */

import { TextChunk } from '../types';
import { ContentAnalyzer } from './ContentAnalyzer';
import { TokenEstimator } from './TokenEstimator';

/**
 * Service responsible for implementing different chunking strategies
 * Follows SRP by focusing only on chunking strategy implementations
 */
export class ChunkingStrategies {
    constructor(
        private contentAnalyzer: ContentAnalyzer,
        private tokenEstimator: TokenEstimator
    ) {}

    /**
     * Split text into chunks by semantic boundaries (paragraphs, headings, lists, code blocks)
     * Respects natural document structure without arbitrary token limits
     */
    chunkByParagraph(text: string, maxTokens: number, overlap: number): TextChunk[] {
        // First, handle special content types that need different treatment
        return this.chunkBySemanticBoundaries(text);
    }

    /**
     * Chunk text by semantic boundaries, preserving document structure
     */
    private chunkBySemanticBoundaries(text: string): TextChunk[] {
        const chunks: TextChunk[] = [];
        let chunkIndex = 0;

        // Split into sections by double newlines, but also detect headings
        const sections = this.splitIntoSemanticSections(text);
        
        for (const section of sections) {
            if (!section.trim()) {
                continue;
            }

            const tokenCount = this.tokenEstimator.estimateTokenCount(section);
            chunks.push({
                content: section.trim(),
                metadata: this.contentAnalyzer.createChunkMetadata(
                    section.trim(),
                    chunkIndex++,
                    0, // Will update later
                    tokenCount
                )
            });
        }
        
        return this.updateTotalChunks(chunks);
    }

    /**
     * Split text into semantic sections respecting markdown structure
     * Headings are grouped WITH their immediate content until the next paragraph break
     */
    private splitIntoSemanticSections(text: string): string[] {
        const lines = text.split('\n');
        const sections: string[] = [];
        let currentSection: string[] = [];
        let inCodeBlock = false;
        let codeBlockFence = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Track code block boundaries
            if (trimmedLine.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeBlockFence = trimmedLine;
                } else if (trimmedLine === '```' || trimmedLine === codeBlockFence) {
                    inCodeBlock = false;
                    codeBlockFence = '';
                    currentSection.push(line);
                    continue;
                }
            }

            // Inside code blocks, just add lines without splitting
            if (inCodeBlock) {
                currentSection.push(line);
                continue;
            }

            // Check for markdown headings - these start new sections
            if (/^#{1,6}\s+/.test(trimmedLine)) {
                // If we have existing content, save it as a section
                if (currentSection.length > 0) {
                    sections.push(currentSection.join('\n'));
                }
                // Start new section with this heading
                currentSection = [line];
                continue;
            }

            // Check for empty lines (paragraph breaks)
            if (trimmedLine === '') {
                // Look ahead to see if this is a paragraph break (consecutive empty lines or line followed by content)
                let nextNonEmptyIndex = i + 1;
                while (nextNonEmptyIndex < lines.length && lines[nextNonEmptyIndex].trim() === '') {
                    nextNonEmptyIndex++;
                }
                
                // If there's content after the empty line(s), this is a paragraph break
                if (nextNonEmptyIndex < lines.length) {
                    const nextLine = lines[nextNonEmptyIndex].trim();
                    
                    // Don't split if the next line is a heading (headings start their own sections)
                    if (!/^#{1,6}\s+/.test(nextLine)) {
                        // This is a paragraph break - end current section
                        if (currentSection.length > 0) {
                            sections.push(currentSection.join('\n'));
                            currentSection = [];
                        }
                        // Skip empty lines between sections
                        continue;
                    }
                }
                
                // If we're here, it's either an empty line within a section or before a heading
                currentSection.push(line);
                continue;
            }

            // Regular content line - add to current section
            currentSection.push(line);
        }

        // Add remaining content
        if (currentSection.length > 0) {
            sections.push(currentSection.join('\n'));
        }

        return sections.filter(section => section.trim().length > 0);
    }

    /**
     * Split text into chunks by sentence boundaries
     */
    chunkBySentence(text: string, maxTokens: number, overlap: number): TextChunk[] {
        const sentences = this.contentAnalyzer.splitIntoSentences(text);
        const chunks: TextChunk[] = [];
        
        let currentChunk = '';
        let currentTokens = 0;
        let chunkIndex = 0;
        
        for (const sentence of sentences) {
            const sentenceTokens = this.tokenEstimator.estimateTokenCount(sentence);
            
            // If a single sentence exceeds the token limit, split it by fixed size
            if (sentenceTokens > maxTokens) {
                // If we have content in the current chunk, add it first
                if (currentTokens > 0) {
                    chunks.push({
                        content: currentChunk,
                        metadata: this.contentAnalyzer.createChunkMetadata(
                            currentChunk,
                            chunkIndex++,
                            0, // Will update later
                            currentTokens
                        )
                    });
                    currentChunk = '';
                    currentTokens = 0;
                }
                
                // Split the large sentence by fixed size
                const fixedChunks = this.chunkByFixedSize(sentence, Math.floor(maxTokens * 4), overlap * 4);
                chunks.push(...fixedChunks);
                continue;
            }
            
            // Check if adding this sentence would exceed the limit
            if (currentTokens + sentenceTokens > maxTokens) {
                // Add the current chunk to the result and start a new one
                chunks.push({
                    content: currentChunk,
                    metadata: this.contentAnalyzer.createChunkMetadata(
                        currentChunk,
                        chunkIndex++,
                        0, // Will update later
                        currentTokens
                    )
                });
                
                // Start new chunk with overlap from the previous chunk
                if (overlap > 0 && currentChunk.length > 0) {
                    const overlapText = this.contentAnalyzer.getOverlapText(currentChunk, overlap);
                    currentChunk = overlapText + ' ' + sentence;
                    currentTokens = this.tokenEstimator.estimateTokenCount(currentChunk);
                } else {
                    currentChunk = sentence;
                    currentTokens = sentenceTokens;
                }
            } else {
                // Add to the current chunk
                if (currentChunk.length > 0) {
                    currentChunk += ' ' + sentence;
                } else {
                    currentChunk = sentence;
                }
                currentTokens += sentenceTokens;
            }
        }
        
        // Add the last chunk if it has content
        if (currentChunk.length > 0) {
            chunks.push({
                content: currentChunk,
                metadata: this.contentAnalyzer.createChunkMetadata(
                    currentChunk,
                    chunkIndex++,
                    0, // Will update later
                    currentTokens
                )
            });
        }
        
        // Update total chunks
        return this.updateTotalChunks(chunks);
    }

    /**
     * Split text into fixed-size chunks
     */
    chunkByFixedSize(text: string, chunkSize: number, overlap: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        
        if (text.length <= chunkSize) {
            return [{
                content: text,
                metadata: this.contentAnalyzer.createChunkMetadata(
                    text,
                    0,
                    1,
                    this.tokenEstimator.estimateTokenCount(text)
                )
            }];
        }
        
        let position = 0;
        let chunkIndex = 0;
        
        while (position < text.length) {
            const end = Math.min(position + chunkSize, text.length);
            const chunk = text.substring(position, end);
            
            chunks.push({
                content: chunk,
                metadata: this.contentAnalyzer.createChunkMetadata(
                    chunk,
                    chunkIndex++,
                    0, // Will update later
                    this.tokenEstimator.estimateTokenCount(chunk)
                )
            });
            
            // Move position for next chunk, accounting for overlap
            position = end - overlap;
            
            // Ensure we make forward progress
            if (position <= 0 || position >= text.length - 10) {
                break;
            }
        }
        
        // Update total chunks
        return this.updateTotalChunks(chunks);
    }

    /**
     * Create a single chunk for full document strategy
     */
    chunkAsFullDocument(text: string): TextChunk[] {
        const tokenCount = this.tokenEstimator.estimateTokenCount(text);
        
        return [{
            content: text,
            metadata: this.contentAnalyzer.createChunkMetadata(
                text,
                0,
                1,
                tokenCount,
                0,
                text.length
            )
        }];
    }

    /**
     * Split a large paragraph using different strategies based on content type
     */
    private splitLargeParagraph(paragraph: string, maxTokens: number, overlap: number, startIndex: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        let chunkIndex = startIndex;

        // Check content type and use appropriate strategy
        if (this.contentAnalyzer.isCodeBlock(paragraph)) {
            // For code blocks, try to split at logical boundaries
            const codeChunks = this.splitCodeBlock(paragraph, maxTokens, overlap);
            return codeChunks.map(chunk => ({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    chunkIndex: chunkIndex++,
                    semanticBoundary: 'code-block'
                }
            }));
        } else if (this.contentAnalyzer.isList(paragraph)) {
            // For lists, try to keep list items together
            const listChunks = this.splitListContent(paragraph, maxTokens, overlap);
            return listChunks.map(chunk => ({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    chunkIndex: chunkIndex++,
                    semanticBoundary: 'list'
                }
            }));
        } else {
            // For regular long paragraphs, fall back to sentence splitting
            const sentenceChunks = this.chunkBySentence(paragraph, maxTokens, overlap);
            return sentenceChunks.map(chunk => ({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    chunkIndex: chunkIndex++
                }
            }));
        }
    }

    /**
     * Split code blocks preserving structure
     */
    private splitCodeBlock(codeBlock: string, maxTokens: number, overlap: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        const codeLines = this.contentAnalyzer.splitIntoLines(codeBlock);
        let currentCodeChunk: string[] = [];
        let currentCodeTokens = 0;
        let chunkIndex = 0;
        
        for (const line of codeLines) {
            const lineTokens = this.tokenEstimator.estimateTokenCount(line + '\n');
            
            if (currentCodeTokens + lineTokens > maxTokens && currentCodeChunk.length > 0) {
                // Save current chunk
                const chunkContent = currentCodeChunk.join('\n');
                chunks.push({
                    content: chunkContent,
                    metadata: this.contentAnalyzer.createChunkMetadata(
                        chunkContent,
                        chunkIndex++,
                        0, // Will update later
                        currentCodeTokens
                    )
                });
                
                // Start new chunk with overlap if specified
                if (overlap > 0 && currentCodeChunk.length > 0) {
                    const overlapLines = Math.ceil(overlap / 10); // Rough estimate
                    currentCodeChunk = currentCodeChunk.slice(-overlapLines);
                    currentCodeChunk.push(line);
                    currentCodeTokens = this.tokenEstimator.estimateTokenCount(currentCodeChunk.join('\n'));
                } else {
                    currentCodeChunk = [line];
                    currentCodeTokens = lineTokens;
                }
            } else {
                currentCodeChunk.push(line);
                currentCodeTokens += lineTokens;
            }
        }
        
        // Add remaining code
        if (currentCodeChunk.length > 0) {
            const chunkContent = currentCodeChunk.join('\n');
            chunks.push({
                content: chunkContent,
                metadata: this.contentAnalyzer.createChunkMetadata(
                    chunkContent,
                    chunkIndex++,
                    0,
                    currentCodeTokens
                )
            });
        }

        return this.updateTotalChunks(chunks);
    }

    /**
     * Split list content preserving list structure
     */
    private splitListContent(listContent: string, maxTokens: number, overlap: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        const lines = this.contentAnalyzer.splitIntoLines(listContent);
        const listItemRegex = this.contentAnalyzer.getListItemRegex();
        let currentListChunk: string[] = [];
        let currentListTokens = 0;
        let chunkIndex = 0;
        
        for (const line of lines) {
            const lineTokens = this.tokenEstimator.estimateTokenCount(line + '\n');
            const isListItem = listItemRegex.test(line);
            
            // If this is a list item and adding it would exceed the limit, create a chunk
            if (isListItem && currentListTokens + lineTokens > maxTokens && currentListChunk.length > 0) {
                const chunkContent = currentListChunk.join('\n');
                chunks.push({
                    content: chunkContent,
                    metadata: this.contentAnalyzer.createChunkMetadata(
                        chunkContent,
                        chunkIndex++,
                        0, // Will update later
                        currentListTokens
                    )
                });
                
                currentListChunk = [line];
                currentListTokens = lineTokens;
            } else {
                currentListChunk.push(line);
                currentListTokens += lineTokens;
            }
        }
        
        // Add remaining list items
        if (currentListChunk.length > 0) {
            const chunkContent = currentListChunk.join('\n');
            chunks.push({
                content: chunkContent,
                metadata: this.contentAnalyzer.createChunkMetadata(
                    chunkContent,
                    chunkIndex++,
                    0,
                    currentListTokens
                )
            });
        }

        return this.updateTotalChunks(chunks);
    }

    /**
     * Update total chunks count in all chunks
     */
    private updateTotalChunks(chunks: TextChunk[]): TextChunk[] {
        return chunks.map(chunk => ({
            ...chunk,
            metadata: {
                ...chunk.metadata,
                totalChunks: chunks.length
            }
        }));
    }

    /**
     * Get available chunking strategies
     */
    getAvailableStrategies(): string[] {
        return ['paragraph', 'sentence', 'fixed', 'heading', 'sliding-window', 'full-document'];
    }

    /**
     * Validate chunking strategy
     */
    validateStrategy(strategy: string): {
        isValid: boolean;
        error?: string;
    } {
        const availableStrategies = this.getAvailableStrategies();
        
        if (!availableStrategies.includes(strategy)) {
            return {
                isValid: false,
                error: `Invalid strategy '${strategy}'. Available strategies: ${availableStrategies.join(', ')}`
            };
        }

        return {
            isValid: true
        };
    }
}