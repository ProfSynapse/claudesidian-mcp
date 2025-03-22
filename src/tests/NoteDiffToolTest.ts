import { NoteDiffTool } from '../tools/core/NoteDiffTool';
import { TextOperationType } from '../tools/core/editor/TextOperationProcessor';
import { App, TFile, Vault } from 'obsidian';
import { EventManager } from '../services/EventManager';

/**
 * Mock implementation of IToolContext for testing
 */
class MockToolContext {
    app: App;
    plugin: any;
    vault: any;
    toolRegistry: any;
    settings: any;
    eventManager: EventManager;

    constructor() {
        this.app = {} as App;
        this.plugin = { settings: { rootPath: '' } };
        this.settings = { rootPath: '' };
        this.eventManager = {} as EventManager;
        
        // Mock vault implementation
        this.vault = {
            async readNote(path: string): Promise<string> {
                // Mock note content for testing
                if (path === 'test.md') {
                    return `# Test Note

## Section 1
Content in section 1

## [[05. Interlude I]]

## Section 2
Content in section 2
`;
                }
                return '';
            },
            
            async updateNote(path: string, content: string): Promise<void> {
                console.log(`Mock: Updated note ${path} with content length ${content.length}`);
                return;
            }
        };
        
        this.toolRegistry = {
            executeTool: async (name: string, args: any) => {
                console.log(`Mock: Executed tool ${name} with args:`, args);
                return {};
            }
        };
    }
}

/**
 * Test the NoteDiffTool
 */
async function testNoteDiffTool() {
    const context = new MockToolContext();
    const tool = new NoteDiffTool(context);
    
    console.log('Testing NoteDiffTool...');
    
    // Test 1: Insert at heading
    try {
        const result = await tool.execute({
            path: 'test.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## [[05. Interlude I]]',
                    content: 'Content under interlude'
                }
            ]
        });
        
        console.log('Test 1 (Insert at heading) - Success');
        console.log('New content:', result.newContent);
    } catch (error) {
        console.error('Test 1 (Insert at heading) - Failed:', error);
    }
    
    // Test 2: Multiple operations
    try {
        const result = await tool.execute({
            path: 'test.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## Section 1',
                    content: 'Additional content in section 1'
                },
                {
                    type: TextOperationType.ReplaceText,
                    search: 'Content in section 2',
                    replace: 'Updated content in section 2'
                },
                {
                    type: TextOperationType.AppendToFile,
                    content: 'Content at the end of the file'
                }
            ]
        });
        
        console.log('Test 2 (Multiple operations) - Success');
        console.log('New content:', result.newContent);
    } catch (error) {
        console.error('Test 2 (Multiple operations) - Failed:', error);
    }
    
    // Test 3: Error handling - Heading not found
    try {
        await tool.execute({
            path: 'test.md',
            operations: [
                {
                    type: TextOperationType.InsertAtHeading,
                    heading: '## Non-existent Heading',
                    content: 'This should fail'
                }
            ]
        });
        
        console.error('Test 3 (Error handling) - Failed: Expected error but got success');
    } catch (error) {
        console.log('Test 3 (Error handling) - Success: Caught expected error');
        console.log('Error message:', error.message);
    }
    
    console.log('NoteDiffTool tests completed');
}

// Run the tests
testNoteDiffTool().catch(error => {
    console.error('Error running tests:', error);
});