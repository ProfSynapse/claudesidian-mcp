import { Accordion } from '../Accordion';
import { Setting } from 'obsidian';
import { ConfigModal } from '../ConfigModal';

export class SetupInstructionsAccordion {
    constructor(container: HTMLElement) {
        const accordion = new Accordion(container, 'Setup Instructions', false);
        const content = accordion.getContentEl();
        this.createContent(content);
    }

    private createContent(content: HTMLElement): void {
        // Prerequisites
        const prerequisites = content.createEl('div', { cls: 'mcp-section' });
        prerequisites.createEl('h4', { text: 'Prerequisites' });
        const prereqList = prerequisites.createEl('ul');
        
        const nodejsItem = prereqList.createEl('li');
        const nodejsLink = nodejsItem.createEl('a', {
            text: 'Node.js',
            href: 'https://nodejs.org/en/download'
        });
        nodejsLink.setAttr('target', '_blank');
        nodejsItem.appendChild(document.createTextNode(' installed on your system'));

        const claudeItem = prereqList.createEl('li');
        const claudeLink = claudeItem.createEl('a', {
            text: 'Claude Desktop App',
            href: 'https://claude.ai/download'
        });
        claudeLink.setAttr('target', '_blank');
        claudeItem.appendChild(document.createTextNode(' installed'));

        // Setup steps
        content.createEl('h4', { text: 'Installation Steps' });
        const setupSteps = content.createEl('ol');
        setupSteps.createEl('li', {
            text: 'Close Claude completely (ensure it\'s not running in background)'
        });
        setupSteps.createEl('li', {
            text: 'Click the "Open Configuration" button below'
        });
        setupSteps.createEl('li', {
            text: 'Copy the appropriate configuration based on your setup'
        });
        setupSteps.createEl('li', {
            text: 'Open the configuration file using the provided link'
        });
        setupSteps.createEl('li', {
            text: 'Paste the copied text (replacing everything if no existing MCPs, or adding to the servers array if you have them)'
        });
        setupSteps.createEl('li', {
            text: 'Open Claude Desktop App'
        });
        setupSteps.createEl('li', {
            text: 'Look for the hammer icon with a number at the bottom of the chatbox'
        });
        
        // Memory Manager Setup
        content.createEl('h4', { text: 'Memory Manager Setup (Optional)' });
        const memorySteps = content.createEl('ol');
        memorySteps.createEl('li', {
            text: 'Go to the Memory Management accordion in Settings'
        });
        memorySteps.createEl('li', {
            text: 'Configure your embedding provider (e.g., OpenAI API key)'
        });
        memorySteps.createEl('li', {
            text: 'Enable Memory Manager using the toggle switch if it does not automatically enable'
        });
        memorySteps.createEl('li', {
            text: 'Adjust embedding model and chunking settings as needed'
        });
        memorySteps.createEl('li', {
            text: 'Click "Start Initial Embedding" to create initial embeddings'
        });
        
        // Add a note about what the Memory Manager does
        const memoryNote = content.createEl('div', { cls: 'mcp-setup-instructions' });
        memoryNote.createEl('p', { text: 'The Memory Manager enables semantic search across your vault, allowing Claude to find information based on meaning rather than just keywords. Once configured, Claude can use the queryMemory mode to search for relevant content.' });

        // Configuration button
        new Setting(content)
            .setName('MCP Configuration')
            .setDesc('Configure MCP agents and tools')
            .addButton(button => button
                .setButtonText('Open Configuration')
                .onClick(() => {
                    // @ts-ignore - App is available in Obsidian context
                    const app = window.app;
                    new ConfigModal(app).open();
                }));
    }
}
