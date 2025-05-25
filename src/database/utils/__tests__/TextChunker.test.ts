import { chunkText, estimateTokenCount } from '../TextChunker';

describe('TextChunker', () => {
  describe('chunkText with paragraph strategy', () => {
    it('should create one chunk per paragraph', () => {
      const text = `First paragraph with some content.

Second paragraph with different content.

Third paragraph with more content.`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 8000, // High limit to ensure no splitting due to size
        overlap: 0
      });

      // Should create exactly 3 chunks, one for each paragraph
      expect(chunks.length).toBe(3);
      expect(chunks[0].content).toBe('First paragraph with some content.');
      expect(chunks[1].content).toBe('Second paragraph with different content.');
      expect(chunks[2].content).toBe('Third paragraph with more content.');
    });

    it('should handle lists as single paragraphs', () => {
      const text = `Introduction paragraph.

- First list item
- Second list item
- Third list item

Conclusion paragraph.`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 8000,
        overlap: 0
      });

      // Should create 3 chunks: intro, list (as one paragraph), conclusion
      expect(chunks.length).toBe(3);
      expect(chunks[0].content).toBe('Introduction paragraph.');
      expect(chunks[1].content).toContain('- First list item');
      expect(chunks[1].content).toContain('- Third list item');
      expect(chunks[2].content).toBe('Conclusion paragraph.');
    });

    it('should split long paragraphs that exceed token limit', () => {
      // Create a very long paragraph
      const longContent = 'This is a very long sentence. '.repeat(200); // ~1000 tokens
      const text = `Short paragraph.

${longContent}

Another short paragraph.`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 500, // Force the long paragraph to split
        overlap: 0
      });

      // Should create more than 3 chunks due to the long paragraph being split
      expect(chunks.length).toBeGreaterThan(3);
      expect(chunks[0].content).toBe('Short paragraph.');
      expect(chunks[chunks.length - 1].content).toBe('Another short paragraph.');
    });

    it('should handle code blocks intelligently', () => {
      const text = `Here is some code:

\`\`\`javascript
function example() {
  console.log("Line 1");
  console.log("Line 2");
  console.log("Line 3");
}
\`\`\`

That was the code.`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 8000,
        overlap: 0
      });

      // Should create 3 chunks
      expect(chunks.length).toBe(3);
      expect(chunks[1].content).toContain('```javascript');
      expect(chunks[1].content).toContain('function example()');
    });

    it('should split very long code blocks at line boundaries', () => {
      const longCode = Array(100).fill(0).map((_, i) => `  console.log("Line ${i}");`).join('\n');
      const text = `Code example:

\`\`\`javascript
${longCode}
\`\`\``;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 200, // Very low to force splitting
        overlap: 10
      });

      // Should split the code block into multiple chunks
      expect(chunks.length).toBeGreaterThan(2);
      
      // Check that code was split into multiple chunks
      const codeChunks = chunks.filter(chunk => 
        chunk.content.includes('console.log') || chunk.content.includes('```')
      );
      expect(codeChunks.length).toBeGreaterThanOrEqual(2);
      
      // Verify that the code content is preserved across chunks
      const allContent = chunks.map(c => c.content).join('\n');
      expect(allContent).toContain('```javascript');
      expect(allContent).toContain('console.log("Line 0");');
      expect(allContent).toContain('console.log("Line 99");');
    });

    it('should handle lists that exceed token limit', () => {
      const longListItem = '- This is an extremely long list item ' + 'with lots of text '.repeat(50);
      const text = `A list:

- Short item 1
- Short item 2
${longListItem}
- Short item 3`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 100, // Low limit to force splitting
        overlap: 0
      });

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(2);
      
      // First chunk should be the intro
      expect(chunks[0].content).toBe('A list:');
      
      // List items should be preserved where possible
      const allContent = chunks.map(c => c.content).join('\n\n');
      expect(allContent).toContain('- Short item 1');
      expect(allContent).toContain('- Short item 3');
    });

    it('should handle empty paragraphs correctly', () => {
      const text = `First paragraph.



Second paragraph after multiple blank lines.`;

      const chunks = chunkText(text, {
        strategy: 'paragraph',
        maxTokens: 8000,
        overlap: 0
      });

      // Should only create 2 chunks, ignoring empty paragraphs
      expect(chunks.length).toBe(2);
      expect(chunks[0].content).toBe('First paragraph.');
      expect(chunks[1].content).toBe('Second paragraph after multiple blank lines.');
    });
  });

  describe('chunkText with full-document strategy', () => {
    it('should always return full document as single chunk', () => {
      const text = `First paragraph.

Second paragraph.

Third paragraph.`;

      const chunks = chunkText(text, {
        strategy: 'full-document',
        maxTokens: 10 // Even with very low limit
      });

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].metadata.totalChunks).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only newlines', () => {
      const text = '\n\n\n\n';
      const chunks = chunkText(text, { strategy: 'paragraph' });
      expect(chunks.length).toBe(0);
    });

    it('should handle empty text', () => {
      const chunks = chunkText('', { strategy: 'paragraph' });
      expect(chunks.length).toBe(0);
    });

    it('should handle text with mixed line endings', () => {
      const text = 'First paragraph.\r\n\r\nSecond paragraph.\n\nThird paragraph.';
      const chunks = chunkText(text, { strategy: 'paragraph' });
      expect(chunks.length).toBe(3);
    });
  });
});