/**
 * Approximates token count based on word count
 * 1 token is roughly 0.75 words for English text
 * @param text The text to count tokens for
 * @returns Approximate token count
 */
export function approximateTokenCount(text: string): number {
    // Simple approximation: 1 token is roughly 0.75 words
    // Or about 4 characters for English text
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / 0.75);
}
