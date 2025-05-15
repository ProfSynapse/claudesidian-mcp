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
