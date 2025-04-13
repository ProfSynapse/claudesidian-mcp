import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';

/**
 * Command for inserting content into notes
 */
export class InsertContentCommand extends BaseNoteCommand {
    /**
     * Finds a heading in the content and returns its position
     * @param content The note content
     * @param heading The heading to find
     * @returns The line number of the heading, or -1 if not found
     */
    private findHeadingPosition(content: string, heading: string): { lineIndex: number, line: string } | null {
        console.debug(`InsertContentCommand: Searching for heading: "${heading}"`);
        
        // Split content into lines
        const lines = content.split('\n');
        
        // Normalize the heading for comparison (trim whitespace)
        const normalizedHeading = heading.trim();
        
        // Search for the heading line by line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Simple exact match
            if (line.trim() === normalizedHeading) {
                console.debug(`InsertContentCommand: Found exact match at line ${i}: "${line}"`);
                return { lineIndex: i, line: line };
            }
        }
        
        // Heading not found, try a more flexible approach
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if this is a heading line (starts with #)
            if (line.startsWith('#')) {
                // Compare without considering wiki-link brackets
                const headingWithoutBrackets = normalizedHeading.replace(/\[\[|\]\]/g, '');
                const lineWithoutBrackets = line.replace(/\[\[|\]\]/g, '');
                
                if (lineWithoutBrackets === headingWithoutBrackets) {
                    console.debug(`InsertContentCommand: Found flexible match at line ${i}: "${line}" matches "${headingWithoutBrackets}"`);
                    return { lineIndex: i, line: lines[i] };
                }
            }
        }
        
        // Heading not found
        console.debug(`InsertContentCommand: No match found for heading "${heading}"`);
        return null;
    }
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { path: rawPath, content, mode, heading } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath, context);
        const currentContent = await context.vault.readNote(finalPath);
        let newContent: string;

        switch (mode) {
            case 'prepend':
                newContent = `${content}\n\n${currentContent}`;
                break;

            case 'append':
                newContent = `${currentContent}\n\n${content}`;
                break;
case 'underHeading':
    if (!heading) {
        throw new McpError(
            ErrorCode.InvalidParams,
            'Heading is required for underHeading mode'
        );
    }
    
    // Use the helper function to find the heading position
    const headingInfo = this.findHeadingPosition(currentContent, heading);
    
    if (!headingInfo) {
        // Get a snippet of the document to help diagnose the issue
        const contentSnippet = currentContent.length > 300
            ? currentContent.substring(0, 300) + '...'
            : currentContent;
        
        throw new McpError(
            ErrorCode.InvalidParams,
            `Heading "${heading}" not found in note. Please check that:
1. The heading exists exactly as specified (including any ## markers)
2. The heading has the correct level (number of # symbols)
3. The heading includes any [[wiki-links]] if present in the original

Note content snippet (first 300 chars):
${contentSnippet}

Debug info:
- Heading searched for: "${heading}"
- Note length: ${currentContent.length} characters`
        );
    }
    
    // Split content into lines for easier manipulation
    const lines = currentContent.split('\n');
    
    // Insert the new content after the heading
    lines.splice(headingInfo.lineIndex + 1, 0, content);
    
    // Join the lines back together
    newContent = lines.join('\n');
                break;

            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unknown insertion mode: ${mode}`
                );
        }

        await context.vault.updateNote(finalPath, newContent);
        return { oldContent: currentContent };
    }

    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        if (previousResult?.oldContent) {
            const finalPath = this.preparePath(args.path, context);
            await context.vault.updateNote(finalPath, previousResult.oldContent);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to insert content into"
                },
                content: {
                    type: "string",
                    description: "Content to insert"
                },
                mode: {
                    type: "string",
                    enum: ["prepend", "append", "underHeading"],
                    description: "Where to insert the content: at the beginning (prepend), at the end (append), or under a specific heading (underHeading)"
                },
                heading: {
                    type: "string",
                    description: "Target heading for underHeading mode. Must include the exact heading text including ## markers and any [[wiki-links]] if present (e.g., '## Section Title' or '## [[05. Interlude I]]'). The heading must exist in the note, even if it has no content after it."
                }
            },
            required: ["path", "content", "mode"],
            examples: [
                {
                    path: "Notes/MyNote.md",
                    mode: "append",
                    content: "Content to append at the end of the note"
                },
                {
                    path: "Notes/MyNote.md",
                    mode: "prepend",
                    content: "Content to add at the beginning of the note"
                },
                {
                    path: "Notes/MyNote.md",
                    mode: "underHeading",
                    heading: "## My Section Heading",
                    content: "Content to add under the specified heading"
                },
                {
                    path: "Notes/MyNote.md",
                    mode: "underHeading",
                    heading: "## [[05. Interlude I]]",
                    content: "Content to add under a heading with wiki-links"
                }
            ]
        };
    }
}
