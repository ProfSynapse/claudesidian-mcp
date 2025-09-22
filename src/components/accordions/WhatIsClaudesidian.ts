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
            text: 'Claudesidian MCP transforms your Obsidian vault into a natural language programming environment that enables powerful AI-assisted note-taking and knowledge management by connecting the Claude Desktop App to your vault, and giving it tools to take actions.'
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
            text: 'Search and retrieve information from your vault using natural language queries'
        });
        nlpList.createEl('li', {
            text: 'Track projects and research progress'
        });
        nlpList.createEl('li', {
            text: 'Build connections between your notes'
        });
        nlpList.createEl('li', {
            text: 'And anything else you can dream up by leveraging the below agents!'
        });

        // Agents section within intro
        const agentsSection = content.createEl('div', { cls: 'mcp-section' });
        agentsSection.createEl('h4', { text: 'Available Agents' });
        const agentsContainer = agentsSection.createEl('div', { cls: 'mcp-agents-container' });

        // Add all agents
        this.createAgentDescription(
            agentsContainer,
            'Content Manager',
            'Manages note content with read, create, append, prepend, replace, delete, find-replace, and batch operations. Combines functionality of the previous Note Reader and Note Editor agents into a single unified interface for all content operations.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Command Manager',
            'Executes Obsidian commands on your behalf using the command palette (Control+P/Cmd+P). Can list available commands and execute them, enabling access to any functionality in the command palette, automating tasks, and triggering plugin features.'
        );
        
        
        this.createAgentDescription(
            agentsContainer,
            'Vault Manager',
            'Manages vault organization with operations for listing files/folders, creating/editing/deleting folders, moving notes, and duplicating notes. Provides comprehensive file system management for your vault structure.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Vault Librarian',
            'Searches and navigates your vault with advanced content, tag, property, and text search capabilities. Includes batch operations for complex search patterns and content matching.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Memory Manager',
            'Manages workspace sessions, state snapshots, and persistent memory across conversations. Provides operations for creating, listing, editing, and deleting sessions and snapshot states.'
        );
        
        this.createAgentDescription(
            agentsContainer,
            'Agent Manager',
            'Manages agent configurations, custom prompts, and agent-specific settings. Provides operations for creating, editing, and managing custom agent prompts and behaviors.'
        );
        

        // Example Interactions section within intro
        const examplesSection = content.createEl('div', { cls: 'mcp-section' });
        examplesSection.createEl('h4', { text: 'Example Interactions' });
        
        const examplesList = examplesSection.createEl('ul');
        examplesList.createEl('li', { 
            text: '"Create a literature note for this paper using our template" - Claude follows template structure and updates MOCs'
        });
        examplesList.createEl('li', { 
            text: '"Analyze these research notes and update our map of contents" - Claude identifies connections and updates maps'
        });
        examplesList.createEl('li', { 
            text: '"Start new project: Research Database" - Claude sets up project structure and tracking'
        });
    }
}
