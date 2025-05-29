import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Interface for token counting implementations
 */
export interface ITokenCounter {
    getTokenCount(text: string): number;
    getMaxTokenLimit(): number;
}

/**
 * Base class for managing text tokenization and splitting
 */
export abstract class TokenManager implements ITokenCounter {
    protected readonly maxTokenLimit: number;

    constructor(maxTokenLimit: number) {
        this.maxTokenLimit = maxTokenLimit;
    }

    /**
     * Get the maximum token limit
     */
    getMaxTokenLimit(): number {
        return this.maxTokenLimit;
    }

    /**
     * Get token count for text - must be implemented by subclasses
     */
    abstract getTokenCount(text: string): number;

    /**
     * Check if text exceeds the token limit
     */
    exceedsTokenLimit(text: string): boolean {
        const tokenCount = this.getTokenCount(text);
        return tokenCount > this.maxTokenLimit;
    }

    /**
     * Split text into chunks that fit within token limits
     */
    splitTextByTokenLimit(text: string, maxTokens: number = this.maxTokenLimit): string[] {
        if (!this.exceedsTokenLimit(text)) {
            return [text];
        }

        const chunks: string[] = [];
        
        // Try splitting by paragraphs first
        const paragraphs = text.split(/\n\s*\n/);
        
        let currentChunk = "";
        let currentChunkTokens = 0;
        
        for (const paragraph of paragraphs) {
            const paragraphTokens = this.getTokenCount(paragraph);
            
            // If a single paragraph exceeds the limit, split it further
            if (paragraphTokens > maxTokens) {
                if (currentChunkTokens > 0) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                    currentChunkTokens = 0;
                }
                
                const sentenceChunks = this.splitLargeParagraph(paragraph, maxTokens);
                chunks.push(...sentenceChunks);
                continue;
            }
            
            // Check if adding this paragraph would exceed the limit
            if (currentChunkTokens + paragraphTokens + 1 > maxTokens) {
                chunks.push(currentChunk);
                currentChunk = paragraph;
                currentChunkTokens = paragraphTokens;
            } else {
                if (currentChunk.length > 0) {
                    currentChunk += "\n\n" + paragraph;
                    currentChunkTokens += paragraphTokens + 2;
                } else {
                    currentChunk = paragraph;
                    currentChunkTokens = paragraphTokens;
                }
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    /**
     * Split a large paragraph into smaller chunks by sentences
     */
    private splitLargeParagraph(paragraph: string, maxTokens: number): string[] {
        const chunks: string[] = [];
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        
        let currentChunk = "";
        let currentChunkTokens = 0;
        
        for (const sentence of sentences) {
            const sentenceTokens = this.getTokenCount(sentence);
            
            // If a single sentence exceeds the limit, split by words
            if (sentenceTokens > maxTokens) {
                if (currentChunkTokens > 0) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                    currentChunkTokens = 0;
                }
                
                const wordChunks = this.splitByWords(sentence, maxTokens);
                chunks.push(...wordChunks);
                continue;
            }
            
            if (currentChunkTokens + sentenceTokens + 1 > maxTokens) {
                chunks.push(currentChunk);
                currentChunk = sentence;
                currentChunkTokens = sentenceTokens;
            } else {
                if (currentChunk.length > 0) {
                    currentChunk += " " + sentence;
                    currentChunkTokens += sentenceTokens + 1;
                } else {
                    currentChunk = sentence;
                    currentChunkTokens = sentenceTokens;
                }
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    /**
     * Split text by words when sentences are too long
     */
    private splitByWords(text: string, maxTokens: number): string[] {
        const chunks: string[] = [];
        const words = text.split(/\s+/);
        
        let currentChunk = "";
        let currentChunkTokens = 0;
        
        for (const word of words) {
            const wordTokens = this.getTokenCount(word);
            
            if (currentChunkTokens + wordTokens + 1 > maxTokens) {
                chunks.push(currentChunk);
                currentChunk = word;
                currentChunkTokens = wordTokens;
            } else {
                if (currentChunk.length > 0) {
                    currentChunk += " " + word;
                    currentChunkTokens += wordTokens + 1;
                } else {
                    currentChunk = word;
                    currentChunkTokens = wordTokens;
                }
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }
}

/**
 * OpenAI-specific token manager using gpt-tokenizer
 */
export class OpenAITokenManager extends TokenManager {
    private gptTokenizer: any;

    constructor() {
        super(8192); // OpenAI's text-embedding-3 models have an 8192 token limit
        this.initializeTokenizer();
    }

    private async initializeTokenizer() {
        try {
            // Dynamic import to handle module loading
            this.gptTokenizer = await import('gpt-tokenizer');
        } catch (error) {
            console.warn('Failed to load gpt-tokenizer:', error);
        }
    }

    getTokenCount(text: string): number {
        try {
            if (this.gptTokenizer) {
                return this.gptTokenizer.encode(text, { allowedSpecial: 'all' }).length;
            }
        } catch (error) {
            console.warn('Error using gpt-tokenizer, falling back to regex approximation', error);
        }
        
        // Fallback to regex approximation
        const tokenRegex = /(['"].*?['"]|\S+)/g;
        const matches = text.match(tokenRegex);
        return matches ? matches.length : 0;
    }
}

/**
 * Generic token manager using simple word-based approximation
 */
export class SimpleTokenManager extends TokenManager {
    constructor(maxTokenLimit: number = 4096) {
        super(maxTokenLimit);
    }

    getTokenCount(text: string): number {
        // Simple approximation: ~0.75 tokens per word
        const words = text.split(/\s+/).filter(w => w.length > 0);
        return Math.ceil(words.length * 0.75);
    }
}