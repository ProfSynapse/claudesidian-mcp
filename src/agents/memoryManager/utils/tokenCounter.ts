/**
 * Token counter utility for OpenAI embeddings
 * Uses approximation method for token counting
 */

/**
 * Approximates token count based on character count
 * This is a simple approximation method that works well for English text
 * For more accurate counting, consider using a proper tokenizer library
 * 
 * @param text The text to count tokens for
 * @returns Approximate token count
 */
export function approximateTokenCount(text: string): number {
    // Simple approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
}

/**
 * Approximates token count for a chunk of text, with a safety margin
 * Adds a 5% safety margin to the count to account for tokenization differences
 * 
 * @param text The text to count tokens for
 * @returns Approximate token count with safety margin
 */
export function approximateChunkTokenCount(text: string): number {
    const baseCount = approximateTokenCount(text);
    // Add 5% safety margin to account for tokenization differences
    return Math.ceil(baseCount * 1.05);
}

/**
 * Checks if a text is within the token limit
 * 
 * @param text The text to check
 * @param limit The token limit (default: 8191 for embedding models)
 * @returns Boolean indicating if text is within the limit
 */
export function isWithinTokenLimit(text: string, limit: number = 8191): boolean {
    return approximateTokenCount(text) <= limit;
}

/**
 * Splits a text into chunks that fit within the token limit
 * Uses a simple character-based approach for splitting
 * 
 * @param text The text to split
 * @param chunkSize The maximum token size per chunk (default: 8000)
 * @param overlap The number of tokens to overlap between chunks (default: 200)
 * @returns Array of text chunks
 */
export function splitTextToTokenChunks(
    text: string, 
    chunkSize: number = 8000,
    overlap: number = 200
): string[] {
    // Convert token sizes to approximate character counts
    const charChunkSize = chunkSize * 4;
    const charOverlap = overlap * 4;
    const chunks: string[] = [];
    
    let startIndex = 0;
    while (startIndex < text.length) {
        // Calculate end index for this chunk
        const endIndex = Math.min(startIndex + charChunkSize, text.length);
        chunks.push(text.substring(startIndex, endIndex));
        
        // Move to next chunk with overlap
        startIndex = endIndex - charOverlap;
        
        // Prevent infinite loop if overlap >= chunk size
        if (startIndex <= 0 || charOverlap >= charChunkSize) {
            startIndex = endIndex;
        }
    }
    
    return chunks;
}