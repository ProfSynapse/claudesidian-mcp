import { Accordion } from '../Accordion';
import { Setting } from 'obsidian';
import { templateFiles } from '../../templates';

export class BestPracticesAccordion {
    constructor(container: HTMLElement, createTemplatePack: () => Promise<void>) {
        const accordion = new Accordion(container, 'Best Practices', false);
        const content = accordion.getContentEl();
        this.createContent(content, createTemplatePack);
    }

    private createContent(content: HTMLElement, createTemplatePack: () => Promise<void>): void {
        // Vault structure
        const vaultSection = content.createEl('div', { cls: 'mcp-section' });
        vaultSection.createEl('h4', { text: 'Recommended Vault Structure' });
        vaultSection.createEl('p', {
            text: 'Create a dedicated Claudesidian workspace with this structure:'
        });
        
        const structureCode = vaultSection.createEl('pre', { cls: 'language-markdown' });
        structureCode.createEl('code', {
            text: 
`Claudesidian/
├── VaultMOC.md     # Master index of your workspace
├── Inbox/          # Temporary storage for WIP items
├── Templates/      # Your template library
├── Memories/       # Conversation records
├── MOCs/          # Topic/project maps
└── Projects/      # Active project files`
        });

        // Auto-setup section
        vaultSection.createEl('h4', { text: 'Automatic Setup' });
        vaultSection.createEl('p', {
            text: 'Click the button below to copy a setup prompt. Paste it into Claude Desktop to automatically create your workspace structure:'
        });

        // Copy button
        const copyButton = vaultSection.createEl('button', {
            text: 'Copy Setup Prompt',
            cls: 'mod-cta'
        });
        
        copyButton.onclick = () => {
            const setupPrompt = 
`I'd like you to help set up my Claudesidian vault structure. Please create a folder structure with:
/Claudesidian
├── VaultMOC.md     # Master index
├── Inbox/          # WIP storage
├── Templates/      # Template library
├── Memories/       # Conversation records
├── MOCs/          # Topic/project maps
└── Projects/      # Active projects

Please work through this systematically, creating the structure and initializing VaultMOC.md as a central navigation hub.`;

            navigator.clipboard.writeText(setupPrompt);
            copyButton.setText('Copied!');
            setTimeout(() => copyButton.setText('Copy Setup Prompt'), 2000);
        };

        // Template System section
        const templateSection = content.createEl('div', { cls: 'mcp-section' });
        templateSection.createEl('h4', { text: 'Template System' });
        templateSection.createEl('p', {
            text: 'Install the template pack to get started with pre-filled templates for:'
        });
        
        const templateList = templateSection.createEl('ul');
        Object.values(templateFiles).forEach(template => {
            let description = '';
            switch (template.name) {
                case 'meeting-notes.md':
                    description = 'Structured format for meeting summaries, action items, and decisions';
                    break;
                case 'project-plan.md':
                    description = 'Project organization with milestones, tasks, and tracking';
                    break;
                case 'map-of-contents.md':
                    description = 'Knowledge map template for organizing related content';
                    break;
                case 'memory.md':
                    description = 'Conversation record with context and key points';
                    break;
                case 'prompts.md':
                    description = 'Structured prompt format for consistent interactions';
                    break;
            }
            templateList.createEl('li', {
                text: `${template.name} - ${description}`
            });
        });

        // Template Pack Installation
        new Setting(templateSection)
            .setName('Install Template Pack')
            .setDesc('Create pre-filled templates. After installation, move them to your Claudesidian/Templates folder (you can ask Claude to help with this).')
            .addButton(button => button
                .setButtonText('Install Templates')
                .onClick(createTemplatePack)
            );

        // MOCs section
        const mocsSection = content.createEl('div', { cls: 'mcp-section' });
        mocsSection.createEl('h4', { text: 'Maps of Contents (MOCs)' });
        mocsSection.createEl('p', {
            text: 'MOCs help Claude understand and navigate your knowledge structure:'
        });
        
        const mocsList = mocsSection.createEl('ol');
        mocsList.createEl('li', {
            text: 'Start with VaultMOC in root: Your master index'
        });
        mocsList.createEl('li', {
            text: 'Create topic/project MOCs to organize related content'
        });
        mocsList.createEl('li', {
            text: 'Keep MOCs updated as you add new content'
        });

        // Quick Commands section
        const commandsSection = content.createEl('div', { cls: 'mcp-section' });
        commandsSection.createEl('h4', { text: 'System Prompt Commands' });
        commandsSection.createEl('p', {
            text: 'Add these commands to your system prompt for quick actions:'
        });
        
        const commandsList = commandsSection.createEl('ul');
        commandsList.createEl('li', {
            text: '/save - "Save this conversation to memories/[date].md"'
        });
        commandsList.createEl('li', {
            text: '/moc - "Update relevant Maps of Contents"'
        });
        commandsList.createEl('li', {
            text: '/status - "Read MOCs and provide status"'
        });
        commandsList.createEl('li', {
            text: '/plan - "Create new project plan using template"'
        });
        commandsList.createEl('li', {
            text: '/search - "Search vault content using VaultLibrarian"'
        });
        commandsList.createEl('li', {
            text: '/vector - "Perform semantic search with VectorManager"'
        });
    }
}
