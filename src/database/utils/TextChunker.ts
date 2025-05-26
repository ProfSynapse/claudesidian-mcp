/**
 * Text chunking utility for large files
 * Handles splitting text content into chunks that fit within embedding token limits
 */

import * as crypto from 'crypto';

export interface ChunkOptions {
  /**
   * Maximum number of tokens per chunk
   * Default: 8000 (just under OpenAI's 8192 limit)
   */
  maxTokens?: number;
  
  /**
   * Number of tokens to overlap between chunks for context preservation
   * Default: 200
   */
  overlap?: number;
  
  /**
   * Strategy for chunking
   * Default: paragraph
   */
  strategy?: 'paragraph' | 'sentence' | 'fixed' | 'heading' | 'sliding-window' | 'full-document';
  
  /**
   * When using fixed strategy, the number of characters per chunk
   * Default: 4000 characters (about 1000 tokens)
   */
  chunkSize?: number;
  
  /**
   * Whether to include metadata about the chunk's position in the original document
   * Default: true
   */
  includeMetadata?: boolean;
}

export interface TextChunk {
  /**
   * The chunked text content
   */
  content: string;
  
  /**
   * Metadata about the chunk
   */
  metadata: {
    /**
     * Index of the chunk in the sequence (0-based)
     */
    chunkIndex: number;
    
    /**
     * Total number of chunks in the document
     */
    totalChunks: number;
    
    /**
     * Approximate start position in the original text
     */
    startPosition?: number;
    
    /**
     * Approximate end position in the original text
     */
    endPosition?: number;
    
    /**
     * Estimated token count in this chunk
     */
    tokenCount: number;
    
    /**
     * Content hash for identifying this chunk
     */
    contentHash?: string;
    
    /**
     * Semantic boundary type (paragraph, heading, code-block, list)
     */
    semanticBoundary?: 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown';
  };
}

/**
 * Generate a content hash for a chunk
 * @param content The chunk content
 * @returns MD5 hash of the content
 */
export function generateChunkHash(content: string): string {
  return crypto.createHash('md5').update(content.trim()).digest('hex');
}

/**
 * Detect the semantic boundary type of a text chunk
 * @param content The chunk content
 * @returns The detected boundary type
 */
export function detectSemanticBoundary(content: string): 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown' {
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
 * Estimate the number of tokens in a string
 * This is a simple approximation based on GPT tokenization patterns
 * @param text Text to estimate
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Approximate: 1 token ~= 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks that respect token limits
 * @param text Text to split into chunks
 * @param options Chunking options
 * @returns Array of text chunks with metadata
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  // Default options
  const maxTokens = options.maxTokens ?? 8000; // Just under the 8192 limit
  const overlap = options.overlap ?? 200;
  const strategy = options.strategy ?? 'paragraph';
  const chunkSize = options.chunkSize ?? 4000; // ~1000 tokens
  const includeMetadata = options.includeMetadata ?? true;
  
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  // Estimate token count of full text
  const estimatedTokens = estimateTokenCount(text);
  
  // For full-document strategy, always return the whole document
  if (strategy === 'full-document') {
    return [{
      content: text,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        startPosition: 0,
        endPosition: text.length,
        tokenCount: estimatedTokens,
        contentHash: generateChunkHash(text),
        semanticBoundary: detectSemanticBoundary(text)
      }
    }];
  }
  
  // For fixed-size strategy, if the text is already within limits, return it as a single chunk
  if (strategy === 'fixed' && estimatedTokens <= maxTokens) {
    return [{
      content: text,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        startPosition: 0,
        endPosition: text.length,
        tokenCount: estimatedTokens,
        contentHash: generateChunkHash(text),
        semanticBoundary: detectSemanticBoundary(text)
      }
    }];
  }
  
  let chunks: TextChunk[] = [];
  
  // Choose chunking strategy based on options
  switch (strategy as string) {
    case 'paragraph':
      chunks = chunkByParagraph(text, maxTokens, overlap);
      break;
    case 'sentence':
      chunks = chunkBySentence(text, maxTokens, overlap);
      break;
    case 'fixed':
      chunks = chunkByFixedSize(text, chunkSize, overlap);
      break;
    case 'fixed-size':
      chunks = chunkByFixedSize(text, chunkSize, overlap);
      break;
    case 'heading':
      // TODO: Implement heading-based chunking
      // For now, fallback to paragraph chunking
      chunks = chunkByParagraph(text, maxTokens, overlap);
      break;
    case 'sliding-window':
      // Sliding window is similar to fixed size with overlap
      chunks = chunkByFixedSize(text, chunkSize, overlap);
      break;
    case 'full-document':
      // This case should have been handled above
      chunks = [{
        content: text,
        metadata: {
          chunkIndex: 0,
          totalChunks: 1,
          tokenCount: estimatedTokens,
          contentHash: generateChunkHash(text),
          semanticBoundary: detectSemanticBoundary(text)
        }
      }];
      break;
    default:
      chunks = chunkByParagraph(text, maxTokens, overlap);
  }
  
  // Add position metadata if requested
  if (includeMetadata) {
    let approxPosition = 0;
    chunks = chunks.map((chunk, index) => {
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
  
  return chunks;
}

/**
 * Split text into chunks by paragraph boundaries
 * Each paragraph becomes its own chunk, unless it exceeds the token limit
 * @param text Text to split
 * @param maxTokens Maximum tokens per chunk
 * @param overlap Token overlap between chunks (only used when splitting large paragraphs)
 * @returns Array of text chunks
 */
function chunkByParagraph(text: string, maxTokens: number, overlap: number): TextChunk[] {
  // Split by paragraphs (double newlines, but preserve single newlines within paragraphs)
  // This regex handles various paragraph separators while preserving list items
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    // Skip empty paragraphs
    if (!paragraph.trim()) {
      continue;
    }
    
    const paragraphTokens = estimateTokenCount(paragraph);
    
    // If a single paragraph exceeds the token limit, we need to split it
    if (paragraphTokens > maxTokens) {
      // For very long paragraphs (like code blocks), try different strategies:
      
      // 1. First, check if this is a code block (starts with ``` or has consistent indentation)
      const isCodeBlock = paragraph.trim().startsWith('```') || 
                         paragraph.split('\n').every(line => line.startsWith('    ') || line.startsWith('\t') || !line.trim());
      
      // 2. Check if this is a list (lines start with -, *, +, or numbers)
      const listItemRegex = /^[\s]*[-*+][\s]+|^[\s]*\d+\.[\s]+/;
      const lines = paragraph.split('\n');
      const isList = lines.some(line => listItemRegex.test(line));
      
      if (isCodeBlock) {
        // For code blocks, try to split at logical boundaries (empty lines within the code)
        const codeLines = paragraph.split('\n');
        let currentCodeChunk: string[] = [];
        let currentCodeTokens = 0;
        
        for (const line of codeLines) {
          const lineTokens = estimateTokenCount(line + '\n');
          
          if (currentCodeTokens + lineTokens > maxTokens && currentCodeChunk.length > 0) {
            // Save current chunk
            const chunkContent = currentCodeChunk.join('\n');
            chunks.push({
              content: chunkContent,
              metadata: {
                chunkIndex: chunkIndex++,
                totalChunks: 0, // Will update later
                tokenCount: currentCodeTokens,
                contentHash: generateChunkHash(chunkContent),
                semanticBoundary: 'code-block'
              }
            });
            
            // Start new chunk with overlap if specified
            if (overlap > 0 && currentCodeChunk.length > 0) {
              // Take last few lines as overlap
              const overlapLines = Math.ceil(overlap / 10); // Rough estimate
              currentCodeChunk = currentCodeChunk.slice(-overlapLines);
              currentCodeChunk.push(line);
              currentCodeTokens = estimateTokenCount(currentCodeChunk.join('\n'));
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
            metadata: {
              chunkIndex: chunkIndex++,
              totalChunks: 0,
              tokenCount: currentCodeTokens,
              contentHash: generateChunkHash(chunkContent),
              semanticBoundary: 'code-block'
            }
          });
        }
      } else if (isList) {
        // For lists, try to keep list items together
        let currentListChunk: string[] = [];
        let currentListTokens = 0;
        
        for (const line of lines) {
          const lineTokens = estimateTokenCount(line + '\n');
          const isListItem = listItemRegex.test(line);
          
          // If this is a list item and adding it would exceed the limit, create a chunk
          if (isListItem && currentListTokens + lineTokens > maxTokens && currentListChunk.length > 0) {
            const chunkContent = currentListChunk.join('\n');
            chunks.push({
              content: chunkContent,
              metadata: {
                chunkIndex: chunkIndex++,
                totalChunks: 0,
                tokenCount: currentListTokens,
                contentHash: generateChunkHash(chunkContent),
                semanticBoundary: 'list'
              }
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
            metadata: {
              chunkIndex: chunkIndex++,
              totalChunks: 0,
              tokenCount: currentListTokens,
              contentHash: generateChunkHash(chunkContent),
              semanticBoundary: 'list'
            }
          });
        }
      } else {
        // For regular long paragraphs, fall back to sentence splitting
        const sentenceChunks = chunkBySentence(paragraph, maxTokens, overlap);
        // Update the chunk indices for the sentence chunks
        for (const sentenceChunk of sentenceChunks) {
          chunks.push({
            ...sentenceChunk,
            metadata: {
              ...sentenceChunk.metadata,
              chunkIndex: chunkIndex++
            }
          });
        }
      }
    } else {
      // Normal paragraph that fits within the token limit - add it as its own chunk
      chunks.push({
        content: paragraph,
        metadata: {
          chunkIndex: chunkIndex++,
          totalChunks: 0, // Will update later
          tokenCount: paragraphTokens,
          contentHash: generateChunkHash(paragraph),
          semanticBoundary: 'paragraph'
        }
      });
    }
  }
  
  // Update total chunks count
  return chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length
    }
  }));
}

/**
 * Split text into chunks by sentence boundaries
 * @param text Text to split
 * @param maxTokens Maximum tokens per chunk
 * @param overlap Token overlap between chunks
 * @returns Array of text chunks
 */
function chunkBySentence(text: string, maxTokens: number, overlap: number): TextChunk[] {
  // Split by sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: TextChunk[] = [];
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);
    
    // If a single sentence exceeds the token limit, split it by fixed size
    if (sentenceTokens > maxTokens) {
      // If we have content in the current chunk, add it first
      if (currentTokens > 0) {
        chunks.push({
          content: currentChunk,
          metadata: {
            chunkIndex: chunkIndex++,
            totalChunks: 0, // Will update later
            tokenCount: currentTokens,
            contentHash: generateChunkHash(currentChunk),
            semanticBoundary: detectSemanticBoundary(currentChunk)
          }
        });
        currentChunk = '';
        currentTokens = 0;
      }
      
      // Split the large sentence by fixed size
      const fixedChunks = chunkByFixedSize(sentence, Math.floor(maxTokens * 4), overlap * 4);
      chunks.push(...fixedChunks);
      continue;
    }
    
    // Check if adding this sentence would exceed the limit
    if (currentTokens + sentenceTokens > maxTokens) {
      // Add the current chunk to the result and start a new one
      chunks.push({
        content: currentChunk,
        metadata: {
          chunkIndex: chunkIndex++,
          totalChunks: 0, // Will update later
          tokenCount: currentTokens,
          contentHash: generateChunkHash(currentChunk),
          semanticBoundary: detectSemanticBoundary(currentChunk)
        }
      });
      
      // Start new chunk with overlap from the previous chunk
      if (overlap > 0 && currentChunk.length > 0) {
        // Get the last ~200 tokens (overlap) from the previous chunk
        const overlapText = getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + ' ' + sentence;
        currentTokens = estimateTokenCount(currentChunk);
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
      metadata: {
        chunkIndex: chunkIndex++,
        totalChunks: 0, // Will update later
        tokenCount: currentTokens,
        contentHash: generateChunkHash(currentChunk),
        semanticBoundary: detectSemanticBoundary(currentChunk)
      }
    });
  }
  
  // Update total chunks
  return chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length
    }
  }));
}

/**
 * Split text into fixed-size chunks
 * @param text Text to split
 * @param chunkSize Character size for each chunk
 * @param overlap Character overlap between chunks
 * @returns Array of text chunks
 */
function chunkByFixedSize(text: string, chunkSize: number, overlap: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  
  if (text.length <= chunkSize) {
    return [{
      content: text,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        tokenCount: estimateTokenCount(text),
        contentHash: generateChunkHash(text),
        semanticBoundary: detectSemanticBoundary(text)
      }
    }];
  }
  
  let position = 0;
  let chunkIndex = 0;
  
  while (position < text.length) {
    const end = Math.min(position + chunkSize, text.length);
    const chunk = text.substring(position, end);
    
    chunks.push({
      content: chunk,
      metadata: {
        chunkIndex: chunkIndex++,
        totalChunks: 0, // Will update later
        tokenCount: estimateTokenCount(chunk),
        contentHash: generateChunkHash(chunk),
        semanticBoundary: detectSemanticBoundary(chunk)
      }
    });
    
    // Move position for next chunk, accounting for overlap
    position = end - overlap;
    
    // Ensure we make forward progress
    if (position <= 0 || position >= text.length - 10) {
      break;
    }
  }
  
  // Update total chunks
  return chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length
    }
  }));
}

/**
 * Get overlap text from the end of a chunk
 * @param text Text to get overlap from
 * @param tokenOverlap Approximate token overlap
 * @returns Text for overlap
 */
function getOverlapText(text: string, tokenOverlap: number): string {
  // Approximate characters needed for the overlap
  const charOverlap = tokenOverlap * 4;
  
  if (text.length <= charOverlap) {
    return text;
  }
  
  return text.substring(text.length - charOverlap);
}