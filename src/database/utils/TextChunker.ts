/**
 * Text chunking utility for large files
 * Handles splitting text content into chunks that fit within embedding token limits
 */

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
   * Strategy for chunking: paragraph, sentence, or fixed
   * Default: paragraph
   */
  strategy?: 'paragraph' | 'sentence' | 'fixed';
  
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
  };
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
  
  // If the text is already within limits, return it as a single chunk
  if (estimatedTokens <= maxTokens) {
    return [{
      content: text,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        startPosition: 0,
        endPosition: text.length,
        tokenCount: estimatedTokens
      }
    }];
  }
  
  let chunks: TextChunk[] = [];
  
  // Choose chunking strategy based on options
  switch (strategy) {
    case 'paragraph':
      chunks = chunkByParagraph(text, maxTokens, overlap);
      break;
    case 'sentence':
      chunks = chunkBySentence(text, maxTokens, overlap);
      break;
    case 'fixed':
      chunks = chunkByFixedSize(text, chunkSize, overlap);
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
 * @param text Text to split
 * @param maxTokens Maximum tokens per chunk
 * @param overlap Token overlap between chunks
 * @returns Array of text chunks
 */
function chunkByParagraph(text: string, maxTokens: number, overlap: number): TextChunk[] {
  // Split by paragraphs (double newlines)
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokenCount(paragraph);
    
    // If a single paragraph exceeds the token limit, split it further
    if (paragraphTokens > maxTokens) {
      // If we have content in the current chunk, add it first
      if (currentTokens > 0) {
        chunks.push({
          content: currentChunk,
          metadata: {
            chunkIndex: chunkIndex++,
            totalChunks: 0, // Will update later
            tokenCount: currentTokens
          }
        });
        currentChunk = '';
        currentTokens = 0;
      }
      
      // Split the large paragraph by sentences
      const sentenceChunks = chunkBySentence(paragraph, maxTokens, overlap);
      chunks.push(...sentenceChunks);
      continue;
    }
    
    // Check if adding this paragraph would exceed the limit
    if (currentTokens + paragraphTokens > maxTokens) {
      // Add the current chunk to the result and start a new one
      chunks.push({
        content: currentChunk,
        metadata: {
          chunkIndex: chunkIndex++,
          totalChunks: 0, // Will update later
          tokenCount: currentTokens
        }
      });
      
      // Start new chunk with overlap from the previous chunk
      if (overlap > 0 && currentChunk.length > 0) {
        // Get the last ~200 tokens (overlap) from the previous chunk
        const overlapText = getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + '\n\n' + paragraph;
        currentTokens = estimateTokenCount(currentChunk);
      } else {
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
      }
    } else {
      // Add to the current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      currentTokens += paragraphTokens;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk,
      metadata: {
        chunkIndex: chunkIndex++,
        totalChunks: 0, // Will update after
        tokenCount: currentTokens
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
            tokenCount: currentTokens
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
          tokenCount: currentTokens
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
        tokenCount: currentTokens
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
        tokenCount: estimateTokenCount(text)
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
        tokenCount: estimateTokenCount(chunk)
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