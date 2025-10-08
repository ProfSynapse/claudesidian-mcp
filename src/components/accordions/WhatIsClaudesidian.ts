import { Accordion } from '../Accordion';

export class WhatIsNexusAccordion {
    constructor(container: HTMLElement) {
        const accordion = new Accordion(container, 'What is Nexus?', false);
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
            text: 'Nexus is an AI chat assistant integrated directly into Obsidian, transforming your vault into an intelligent workspace. Chat with powerful AI models to manage notes, search content, and organize your knowledge—all without leaving Obsidian.'
        });

        // Core Features
        const featuresInfo = content.createEl('div', { cls: 'mcp-section' });
        featuresInfo.createEl('h4', { text: 'Core Features' });
        featuresInfo.createEl('p', {
            text: 'Nexus provides a seamless chat interface with AI-powered tools to help you:'
        });

        const featuresList = featuresInfo.createEl('ul');
        featuresList.createEl('li', {
            text: 'Chat with AI models directly in Obsidian'
        });
        featuresList.createEl('li', {
            text: 'Create, edit, and organize notes through conversation'
        });
        featuresList.createEl('li', {
            text: 'Search your vault using natural language'
        });
        featuresList.createEl('li', {
            text: 'Manage workspaces and track conversation context'
        });
        featuresList.createEl('li', {
            text: 'Execute Obsidian commands through AI'
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
            text: '"Create a project note for my new research" - Nexus creates the note with appropriate structure'
        });
        examplesList.createEl('li', {
            text: '"Search for all notes about machine learning" - Nexus finds and summarizes relevant content'
        });
        examplesList.createEl('li', {
            text: '"Organize my daily notes from last week" - Nexus helps restructure and tag your notes'
        });
    }
}
