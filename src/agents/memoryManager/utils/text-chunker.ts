import { approximateChunkTokenCount } from './tokenCounter';

/**
 * Configuration options for text chunking
 */
export interface ChunkingOptions {
    // Strategy to use for chunking
    strategy: 'paragraph' | 'heading' | 'fixed-size' | 'sliding-window';
    
    // Maximum number of tokens per chunk
    maxTokens: number;
    
    // Number of tokens to overlap between chunks
    overlap: number;
    
    // Whether to include frontmatter in chunks
    includeFrontmatter: boolean;
    
    // Minimum content length to create a chunk (in characters)
    minLength: number;
}

/**
 * A text chunk with metadata
 */
export interface TextChunk {
    content: string;
    startLine: number;
    endLine: number;
    headingPath?: string[];
    tags: string[];
    frontmatter?: Record<string, any>;
}

/**
 * Default chunking options
 */
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
    strategy: 'paragraph',
    maxTokens: 512,
    overlap: 50,
    includeFrontmatter: true,
    minLength: 50
};

/**
 * Split markdown text into chunks according to the specified strategy
 * 
 * @param text The markdown text to chunk
 * @param options Chunking options
 * @returns Array of text chunks
 */
export function chunkMarkdownText(
    text: string,
    options: Partial<ChunkingOptions> = {}
): TextChunk[] {
    // Merge options with defaults
    const opts: ChunkingOptions = {
        ...DEFAULT_CHUNKING_OPTIONS,
        ...options
    };
    
    // Extract frontmatter if present
    const { frontmatter, content } = extractFrontmatter(text);
    
    // Extract tags from content and frontmatter
    const tags = extractTags(content, frontmatter);
    
    // Choose chunking strategy based on options
    switch (opts.strategy) {
        case 'paragraph':
            return chunkByParagraph(content, frontmatter, tags, opts);
        case 'heading':
            return chunkByHeading(content, frontmatter, tags, opts);
        case 'fixed-size':
            return chunkByFixedSize(content, frontmatter, tags, opts);
        case 'sliding-window':
            return chunkBySlidingWindow(content, frontmatter, tags, opts);
        default:
            // Default to paragraph chunking
            return chunkByParagraph(content, frontmatter, tags, opts);
    }
}

/**
 * Extract frontmatter from markdown text
 * 
 * @param text The markdown text
 * @returns Object containing frontmatter and content
 */
function extractFrontmatter(text: string): { 
    frontmatter: Record<string, any> | undefined;
    content: string;
} {
    // Look for YAML frontmatter between --- markers
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = text.match(frontmatterRegex);
    
    if (!match) {
        return { frontmatter: undefined, content: text };
    }
    
    const [_, frontmatterYaml, content] = match;
    
    try {
        // Parse the YAML frontmatter
        const frontmatter = parseYaml(frontmatterYaml);
        return { frontmatter, content };
    } catch (error) {
        console.error('Error parsing frontmatter:', error);
        return { frontmatter: undefined, content: text };
    }
}

/**
 * Simple YAML parser for frontmatter
 * This is a very basic implementation for common frontmatter formats
 * In a real implementation, you would use a proper YAML library
 * 
 * @param yaml The YAML string to parse
 * @returns Parsed object
 */
function parseYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    
    // Process each line
    const lines = yaml.split('\n');
    for (const line of lines) {
        // Skip empty lines and comments
        if (!line.trim() || line.trim().startsWith('#')) {
            continue;
        }
        
        // Look for key-value pairs (key: value)
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
            const [_, key, value] = match;
            
            // Try to parse values (numbers, booleans, arrays)
            if (value.trim() === 'true') {
                result[key.trim()] = true;
            } else if (value.trim() === 'false') {
                result[key.trim()] = false;
            } else if (!isNaN(Number(value.trim()))) {
                result[key.trim()] = Number(value.trim());
            } else if (value.trim().startsWith('[') && value.trim().endsWith(']')) {
                // Parse simple arrays [item1, item2, ...]
                const items = value.trim().substring(1, value.trim().length - 1).split(',');
                result[key.trim()] = items.map(item => item.trim());
            } else {
                result[key.trim()] = value.trim();
            }
        }
    }
    
    return result;
}

/**
 * Extract tags from content and frontmatter
 * 
 * @param content The markdown content
 * @param frontmatter Optional frontmatter object
 * @returns Array of tags
 */
function extractTags(
    content: string,
    frontmatter?: Record<string, any>
): string[] {
    const tags: Set<string> = new Set();
    
    // Extract tags from frontmatter
    if (frontmatter && frontmatter.tags) {
        const frontmatterTags = Array.isArray(frontmatter.tags)
            ? frontmatter.tags
            : [frontmatter.tags];
            
        frontmatterTags.forEach(tag => tags.add(String(tag).trim()));
    }
    
    // Extract inline tags from content
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
        tags.add(match[1]);
    }
    
    return Array.from(tags);
}

/**
 * Chunk text by paragraphs (separated by blank lines)
 */
function chunkByParagraph(
    content: string,
    frontmatter: Record<string, any> | undefined,
    tags: string[],
    options: ChunkingOptions
): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = content.split(/\n\s*\n/);
    
    let currentChunk = '';
    let currentTokenCount = 0;
    let startLine = 0;
    let currentLine = 0;
    let headingPath: string[] = [];
    
    // Process each paragraph
    for (const paragraph of paragraphs) {
        // Track line numbers
        const lineCount = (paragraph.match(/\n/g) || []).length + 1;
        const paragraphStartLine = currentLine;
        currentLine += lineCount;
        
        // Check if this is a heading
        const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const [_, hashes, title] = headingMatch;
            const level = hashes.length;
            
            // Update heading path based on level
            headingPath = headingPath.slice(0, level - 1);
            headingPath.push(title.trim());
        }
        
        // Skip if paragraph is too short
        if (paragraph.trim().length < options.minLength) {
            continue;
        }
        
        // Get token count for this paragraph
        const paragraphTokenCount = approximateChunkTokenCount(paragraph);
        
        // If adding this paragraph would exceed the limit, store the current chunk and start a new one
        if (currentChunk && currentTokenCount + paragraphTokenCount > options.maxTokens) {
            chunks.push({
                content: currentChunk,
                startLine: startLine,
                endLine: paragraphStartLine - 1,
                headingPath: [...headingPath],
                tags,
                frontmatter: options.includeFrontmatter ? frontmatter : undefined
            });
            
            // Start a new chunk, possibly with overlap
            currentChunk = paragraph;
            currentTokenCount = paragraphTokenCount;
            startLine = paragraphStartLine;
        } else {
            // Add to the current chunk
            currentChunk = currentChunk
                ? `${currentChunk}\n\n${paragraph}`
                : paragraph;
            currentTokenCount += paragraphTokenCount;
            
            // Update start line if this is the first paragraph in the chunk
            if (!currentChunk) {
                startLine = paragraphStartLine;
            }
        }
    }
    
    // Add the final chunk if there's anything left
    if (currentChunk) {
        chunks.push({
            content: currentChunk,
            startLine: startLine,
            endLine: currentLine - 1,
            headingPath: [...headingPath],
            tags,
            frontmatter: options.includeFrontmatter ? frontmatter : undefined
        });
    }
    
    return chunks;
}

/**
 * Chunk text by headings (each heading starts a new chunk)
 */
function chunkByHeading(
    content: string,
    frontmatter: Record<string, any> | undefined,
    tags: string[],
    options: ChunkingOptions
): TextChunk[] {
    const chunks: TextChunk[] = [];
    // Split by headings (lines starting with one or more # followed by space)
    const sections = content.split(/^(#{1,6}\s+.+)\n/m);
    
    let currentChunk = '';
    let currentTokenCount = 0;
    let startLine = 0;
    let currentLine = 0;
    let headingPath: string[] = [];
    let currentHeading = '';
    
    // Process each section (alternating between headings and content)
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section) continue;
        
        // Track line numbers
        const lineCount = (section.match(/\n/g) || []).length + 1;
        const sectionStartLine = currentLine;
        currentLine += lineCount;
        
        // Check if this is a heading (odd indices in the split)
        const headingMatch = section.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const [_, hashes, title] = headingMatch;
            const level = hashes.length;
            
            // Update heading path based on level
            headingPath = headingPath.slice(0, level - 1);
            headingPath.push(title.trim());
            
            // Store the current heading for the next section
            currentHeading = section;
            continue;
        }
        
        // This is a content section
        const sectionContent = currentHeading + (currentHeading ? '\n' : '') + section;
        const sectionTokenCount = approximateChunkTokenCount(sectionContent);
        
        // If this section would exceed the limit, split it further
        if (sectionTokenCount > options.maxTokens) {
            // Use paragraph chunking for this section
            const subChunks = chunkByParagraph(
                sectionContent,
                frontmatter,
                tags,
                options
            );
            
            // Adjust line numbers and add heading path
            for (const subChunk of subChunks) {
                subChunk.startLine += sectionStartLine;
                subChunk.endLine += sectionStartLine;
                subChunk.headingPath = [...headingPath];
                chunks.push(subChunk);
            }
        } else {
            // Add as a single chunk
            chunks.push({
                content: sectionContent,
                startLine: sectionStartLine,
                endLine: currentLine - 1,
                headingPath: [...headingPath],
                tags,
                frontmatter: options.includeFrontmatter ? frontmatter : undefined
            });
        }
        
        // Reset for the next section
        currentHeading = '';
    }
    
    return chunks;
}

/**
 * Chunk text by fixed size (split into chunks of maxTokens)
 */
function chunkByFixedSize(
    content: string,
    frontmatter: Record<string, any> | undefined,
    tags: string[],
    options: ChunkingOptions
): TextChunk[] {
    const chunks: TextChunk[] = [];
    
    // Split text into lines
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentTokenCount = 0;
    let headingPath: string[] = [];
    let startLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const [_, hashes, title] = headingMatch;
            const level = hashes.length;
            
            // Update heading path based on level
            headingPath = headingPath.slice(0, level - 1);
            headingPath.push(title.trim());
        }
        
        // Get token count for this line
        const lineTokenCount = approximateChunkTokenCount(line);
        
        // If adding this line would exceed the limit, store the current chunk and start a new one
        if (currentTokenCount + lineTokenCount > options.maxTokens && currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.join('\n'),
                startLine: startLine,
                endLine: i - 1,
                headingPath: [...headingPath],
                tags,
                frontmatter: options.includeFrontmatter ? frontmatter : undefined
            });
            
            // Calculate overlap
            const overlapLines = getOverlapLines(currentChunk, options.overlap);
            
            // Start a new chunk with overlap
            currentChunk = [...overlapLines, line];
            currentTokenCount = approximateChunkTokenCount(currentChunk.join('\n'));
            startLine = i - overlapLines.length;
        } else {
            // Add to the current chunk
            currentChunk.push(line);
            currentTokenCount += lineTokenCount;
            
            // Update start line if this is the first line in the chunk
            if (currentChunk.length === 1) {
                startLine = i;
            }
        }
    }
    
    // Add the final chunk if there's anything left
    if (currentChunk.length > 0) {
        chunks.push({
            content: currentChunk.join('\n'),
            startLine: startLine,
            endLine: lines.length - 1,
            headingPath: [...headingPath],
            tags,
            frontmatter: options.includeFrontmatter ? frontmatter : undefined
        });
    }
    
    return chunks;
}

/**
 * Chunk text using a sliding window approach
 * Creates overlapping chunks by sliding through the text
 */
function chunkBySlidingWindow(
    content: string,
    frontmatter: Record<string, any> | undefined,
    tags: string[],
    options: ChunkingOptions
): TextChunk[] {
    const chunks: TextChunk[] = [];
    
    // Split text into lines
    const lines = content.split('\n');
    let headingPath: string[] = [];
    
    // Calculate the window size and stride in lines
    // This is an approximation based on average line length
    const avgCharsPerLine = content.length / lines.length;
    const avgTokensPerLine = avgCharsPerLine / 4; // ~4 chars per token
    const windowSize = Math.ceil(options.maxTokens / avgTokensPerLine);
    const stride = Math.ceil((options.maxTokens - options.overlap) / avgTokensPerLine);
    
    // Slide through the text with overlap
    for (let start = 0; start < lines.length; start += stride) {
        const end = Math.min(start + windowSize, lines.length);
        
        // Get the window of lines
        const windowLines = lines.slice(start, end);
        
        // Update heading path based on the first heading in the window
        let localHeadingPath = [...headingPath];
        for (const line of windowLines) {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                const [_, hashes, title] = headingMatch;
                const level = hashes.length;
                
                // Update heading path based on level
                localHeadingPath = localHeadingPath.slice(0, level - 1);
                localHeadingPath.push(title.trim());
            }
        }
        
        const windowContent = windowLines.join('\n');
        
        // Skip if window is too short
        if (windowContent.trim().length < options.minLength) {
            continue;
        }
        
        chunks.push({
            content: windowContent,
            startLine: start,
            endLine: end - 1,
            headingPath: localHeadingPath,
            tags,
            frontmatter: options.includeFrontmatter ? frontmatter : undefined
        });
        
        // If we've reached the end of the text, stop
        if (end === lines.length) {
            break;
        }
    }
    
    return chunks;
}

/**
 * Get lines for overlap based on token count
 * 
 * @param lines Array of lines to get overlap from
 * @param overlapTokens Number of tokens to overlap
 * @returns Array of lines for overlap
 */
function getOverlapLines(lines: string[], overlapTokens: number): string[] {
    const overlapLines: string[] = [];
    let tokenCount = 0;
    
    // Start from the end and work backwards
    for (let i = lines.length - 1; i >= 0; i--) {
        const lineTokenCount = approximateChunkTokenCount(lines[i]);
        
        if (tokenCount + lineTokenCount > overlapTokens) {
            break;
        }
        
        overlapLines.unshift(lines[i]);
        tokenCount += lineTokenCount;
    }
    
    return overlapLines;
}