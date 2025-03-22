import { App, TFile } from 'obsidian';
import { TextOperationType } from '../tools/core/editor/TextOperationProcessor';

/**
 * Example usage of the NoteEditorTool
 */
export async function noteEditorToolExample(app: App) {
    // Get the tool registry
    const toolRegistry = (app as any).plugins.plugins['claudesidian-mcp'].toolRegistry;
    
    // Example 1: Insert content under a heading with wiki-links
    const example1 = async () => {
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## [[05. Interlude I]]',
                    content: 'In the hidden underground city of Vareth\'Nal, young Ar\'Ivani awakens from a terrifying nightmare...'
                }
            ]
        });
        
        console.log('Example 1 result:', result);
    };
    
    // Example 2: Replace all occurrences of text
    const example2 = async () => {
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.ReplaceAllText,
                    search: 'old text',
                    replace: 'new text'
                }
            ]
        });
        
        console.log('Example 2 result:', result);
    };
    
    // Example 3: Multiple operations in a single call
    const example3 = async () => {
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## Section 1',
                    content: 'Content under Section 1'
                },
                {
                    type: TextOperationType.ReplaceText,
                    search: 'old text',
                    replace: 'new text'
                },
                {
                    type: TextOperationType.ReplaceAllText,
                    search: 'repeated text',
                    replace: 'new repeated text'
                },
                {
                    type: TextOperationType.AppendToFile,
                    content: 'Content at the end of the file'
                }
            ]
        });
        
        console.log('Example 3 result:', result);
    };
    
    // Example 4: Insert at a specific position
    const example4 = async () => {
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.InsertAtPosition,
                    position: { line: 10, ch: 0 },
                    content: 'Content inserted at line 10'
                }
            ]
        });
        
        console.log('Example 4 result:', result);
    };
    
    // Run the examples
    try {
        await example1();
        await example2();
        await example3();
        await example4();
    } catch (error) {
        console.error('Error running examples:', error);
    }
}

/**
 * Example of how to handle errors when using the NoteEditorTool
 */
export async function noteEditorToolErrorHandling(app: App) {
    // Get the tool registry
    const toolRegistry = (app as any).plugins.plugins['claudesidian-mcp'].toolRegistry;
    
    try {
        // Try to insert under a non-existent heading
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## Non-existent Heading',
                    content: 'This should fail'
                }
            ]
        });
    } catch (error) {
        console.error('Error inserting under non-existent heading:', error);
        // Handle the error appropriately
    }
    
    try {
        // Try to replace text that doesn't exist
        const result = await toolRegistry.executeTool('noteEditor', {
            path: 'Notes/Example.md',
            operations: [
                {
                    type: TextOperationType.ReplaceText,
                    search: 'text that does not exist',
                    replace: 'replacement text'
                }
            ]
        });
    } catch (error) {
        console.error('Error replacing non-existent text:', error);
        // Handle the error appropriately
    }
}