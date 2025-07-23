# Example of How Semantic Chunking Works

This heading and its immediate content until the paragraph break is **Chunk 1**.

This content after the paragraph break becomes **Chunk 2** since it's separated from the heading above.

## Headings Group with Immediate Content

This heading groups with content that immediately follows it until a paragraph break. So this text is part of the same chunk as the heading above.

But this paragraph, after the break, becomes **Chunk 3** - a separate chunk from the heading above.

## Lists and Code Examples  

When a heading is followed immediately by a list:
- The list stays with the heading
- No paragraph break means they're together
- This is all **Chunk 4**

This paragraph after the break is **Chunk 5**.

## Code Blocks Work Similarly

```javascript
function example() {
    // This code block is immediately under the heading
    return "Part of Chunk 6 with the heading";
}
```

This text after the paragraph break is **Chunk 7**.

**Key insight**: Headings group with content until the next paragraph break (double newline), creating semantically coherent chunks that respect document structure.

## Benefits

- **Semantic coherence**: Related content stays together
- **Structural integrity**: Headings, lists, and code blocks are preserved
- **No arbitrary splits**: No more sentences cut in half due to token limits
- **Markdown-aware**: Understands the structure of your notes