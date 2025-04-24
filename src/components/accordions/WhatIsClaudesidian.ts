import { Accordion } from '../Accordion';

export class WhatIsClaudesidianAccordion {
    constructor(container: HTMLElement) {
        const accordion = new Accordion(container, 'What is Claudesidian?', false);
        const content = accordion.getContentEl();
        this.createContent(content);
    }

    private createAgentDescription(container: HTMLElement, name: string, description: string): void {
        const agentEl = container.createEl('div', { cls: 'mcp-agent' });
        agentEl.createEl('h4', { text: name, cls: 'mcp-agent-name' });
        agentEl.createEl('p', { text: description, cls: 'mcp-agent-description' });
    }

    private createContent(content: HTMLElement): void {
        content.createEl('p', {
            text: 'Claudesidian MCP transforms your Obsidian vault into a natural language programming environment that enables powerful AI-assisted note-taking and knowledge management.'
        });

        // Natural Language Programming explanation
        const nlpInfo = content.createEl('div', { cls: 'mcp-section' });
        nlpInfo.createEl('h4', { text: 'Natural Language Programming' });
        nlpInfo.createEl('p', {
            text: 'Work with your notes using natural language commands and structured templates. Claudesidian understands your vault organization and can help you:'
        });
        
        const nlpList = nlpInfo.createEl('ul');
        nlpList.createEl('li', {
            text: 'Create and organize notes using consistent patterns'
        });
        nlpList.createEl('li', {
            text: 'Maintain maps of content (MOCs) for better knowledge navigation'
        });
        nlpList.createEl('li', {
            text: 'Track projects and research progress'
        });
        nlpList.createEl('li', {
            text: 'Build connections between your notes'
        });

        // Agents section within intro
        const agentsSection = content.createEl('div', { cls: 'mcp-section' });
        agentsSection.createEl('h4', { text: 'Available Agents' });
        const agentsContainer = agentsSection.createEl('div', { cls: 'mcp-agents-container' });

        // Add all agents
        this.createAgentDescription(
            agentsContainer,
            'Note Reader',
            'Reads notes from your vault and provides information based on their content. Can analyze multiple notes simultaneously, extract key information, summarize content, and answer questions about your notes with detailed context awareness.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Note Editor',
            'Edits notes in your vault, helping you refine content. Can append, prepend, or replace text precisely in any of your notes. Can do single or multiple notes or sections at a time.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Vault Librarian',
            'Searches and navigates your vault to find relevant notes and information. Can perform advanced searches using keywords, tags, or content patterns, identify connections between notes, and help find information in your vault.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Palette Commander',
            'Executes Obsidian commands on your behalf using the command palette (Control+P/Cmd+P). Can access any functionality available in the command palette, automate repetitive tasks, apply formatting, manage workspaces, and trigger plugins without manual intervention.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Project Manager',
            'Manages projects in Claude, helping you organize and track progress in a chat session. Used to help keep Claude on track and checking in with you as a project progresses.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Vault Manager',
            'Manages files and folders in your vault by creating, moving or deleting them.'
        );

        // Example Interactions section within intro
        const examplesSection = content.createEl('div', { cls: 'mcp-section' });
        examplesSection.createEl('h4', { text: 'Example Interactions' });
        
        const examplesList = examplesSection.createEl('ul');
        examplesList.createEl('li', { 
            text: '"Create a literature note for this paper using our template" - Claude follows template structure and updates MOCs'
        });
        examplesList.createEl('li', { 
            text: '"Analyze these research notes and update our knowledge map" - Claude identifies connections and updates maps'
        });
        examplesList.createEl('li', { 
            text: '"Start new project: Research Database" - Claude sets up project structure and tracking'
        });
    }
}
