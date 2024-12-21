import { TFile } from 'obsidian';
import { VaultManager } from './VaultManager';
import { injectable } from 'inversify';

export interface Reasoning {
    title: string;
    description: string;
    query: string;
    persona: {
        attributes: string[];
        expertise: {
            domain: string;
            specialization: string;
        };
        preferences: string[];
    };
    workingMemory: {
        goal: string;
        subgoal: string;
        context: string;
        state: string;
        progress: {
            step: string;
            status: string;
            nextSteps: string[];
        };
    };
    knowledgeGraph: Array<{
        subject: string;
        predicate: string;
        object: string;
    }>;
    reasoning: {
        propositions: {
            methodology: string;
            neurosymbolic: string;
            translation: string;
            steps: {
                description: string;
                requires_tool: boolean;
                tool?: string;
            };
        };
        critiques: string[];
        reflections: string[];
    };
}

/**
 * Manages reasoning schemas and processes
 */
@injectable()
export class ReasoningManager {
    private readonly reasoningFolder = 'claudesidian/reasoning';
    private readonly indexFile = 'claudesidian/index.md';

    constructor(
        private vaultManager: VaultManager
    ) {}

    /**
     * Create a new reasoning document
     */
    async createReasoning(reasoning: Reasoning): Promise<TFile> {
        try {
            // Generate filename with timestamp for uniqueness
            const timestamp = Date.now();
            const filename = `${timestamp}_${this.sanitizeTitle(reasoning.title)}`;
            const path = `${this.reasoningFolder}/${filename}.md`;

            // Create content from reasoning schema
            const content = this.formatReasoningContent(reasoning);

            // Create note with metadata
            const file = await this.vaultManager.createNote(
                path,
                content,
                {
                    frontmatter: {
                        title: reasoning.title,
                        description: reasoning.description,
                        query: reasoning.query,
                        date: new Date().toISOString()
                    },
                    createFolders: true
                }
            );

            // Update index
            await this.updateIndex(reasoning);

            return file;
        } catch (error) {
            throw this.handleError('createReasoning', error);
        }
    }

    /**
     * Get the most recent reasoning document
     */
    async getLastReasoning(): Promise<Reasoning | null> {
        try {
            const files = await this.vaultManager.listNotes(this.reasoningFolder);
            if (files.length === 0) return null;

            // Sort by ctime descending
            files.sort((a, b) => b.stat.ctime - a.stat.ctime);
            
            // Get content of most recent file
            const content = await this.vaultManager.readNote(files[0].path);
            const metadata = await this.vaultManager.getNoteMetadata(files[0].path);

            if (!content || !metadata) return null;

            // Parse the content back into a reasoning schema
            return this.parseReasoningContent(content, metadata);
        } catch (error) {
            console.error(`Error getting last reasoning: ${error.message}`);
            return null;
        }
    }

    /**
     * Format reasoning schema into markdown content
     */
    private formatReasoningContent(reasoning: Reasoning): string {
        const sections = [];

        // Query Section
        sections.push(
            '# Query',
            reasoning.query,
            ''
        );

        // Persona Section
        sections.push(
            '# Persona',
            '## Attributes',
            ...reasoning.persona.attributes.map(attr => `- ${attr}`),
            '',
            '## Expertise',
            `- Domain: ${reasoning.persona.expertise.domain}`,
            `- Specialization: ${reasoning.persona.expertise.specialization}`,
            '',
            '## Preferences',
            ...reasoning.persona.preferences.map(pref => `- ${pref}`),
            ''
        );

        // Working Memory Section
        sections.push(
            '# Working Memory',
            `**Goal**: ${reasoning.workingMemory.goal}`,
            `**Subgoal**: ${reasoning.workingMemory.subgoal}`,
            `**Context**: ${reasoning.workingMemory.context}`,
            `**State**: ${reasoning.workingMemory.state}`,
            '',
            '## Progress',
            `### ${reasoning.workingMemory.progress.step}`,
            `Status: ${reasoning.workingMemory.progress.status}`,
            'Next Steps:',
            ...reasoning.workingMemory.progress.nextSteps.map(step => `- ${step}`),
            ''
        );

        // Knowledge Graph Section
        sections.push(
            '# Knowledge Graph',
            ...reasoning.knowledgeGraph.map(node => 
                `- [[${node.subject}]] #${node.predicate} [[${node.object}]]`
            ),
            ''
        );

        // Reasoning Section
        sections.push(
            '# Reasoning Process',
            '## Propositions',
            `Methodology: ${reasoning.reasoning.propositions.methodology}`,
            `Neurosymbolic: ${reasoning.reasoning.propositions.neurosymbolic}`,
            `Translation: ${reasoning.reasoning.propositions.translation}`,
            '',
            '### Steps',
            `Description: ${reasoning.reasoning.propositions.steps.description}`,
            `Requires Tool: ${reasoning.reasoning.propositions.steps.requires_tool}`,
            reasoning.reasoning.propositions.steps.tool 
                ? `Tool: ${reasoning.reasoning.propositions.steps.tool}` 
                : '',
            '',
            '## Critiques',
            ...reasoning.reasoning.critiques.map(critique => `- ${critique}`),
            '',
            '## Reflections',
            ...reasoning.reasoning.reflections.map(reflection => `- ${reflection}`),
            ''
        );

        return sections.join('\n');
    }

    /**
     * Parse markdown content back into reasoning schema
     */
    private parseReasoningContent(content: string, metadata: any): Reasoning {
        // This is a simplified parser - you might want to make it more robust
        const getSection = (name: string): string[] => {
            const regex = new RegExp(`# ${name}\\n([\\s\\S]*?)(?=\\n# |$)`);
            const match = content.match(regex);
            return match ? match[1].trim().split('\n') : [];
        };

        // Extract sections
        const query = getSection('Query')[0] || '';
        const personaSection = getSection('Persona');
        const workingMemorySection = getSection('Working Memory');
        const knowledgeGraphSection = getSection('Knowledge Graph');
        const reasoningSection = getSection('Reasoning Process');

        return {
            title: metadata.title,
            description: metadata.description,
            query,
            persona: this.parsePersonaSection(personaSection),
            workingMemory: this.parseWorkingMemorySection(workingMemorySection),
            knowledgeGraph: this.parseKnowledgeGraphSection(knowledgeGraphSection),
            reasoning: this.parseReasoningSection(reasoningSection)
        };
    }

    /**
     * Parse persona section from markdown content
     */
    private parsePersonaSection(lines: string[]): Reasoning['persona'] {
        const attributes = lines
            .filter(line => line.startsWith('- '))
            .map(line => line.replace('- ', ''));

        return {
            attributes,
            expertise: {
                domain: lines.find(l => l.includes('Domain:'))?.split(':')[1].trim() || '',
                specialization: lines.find(l => l.includes('Specialization:'))?.split(':')[1].trim() || ''
            },
            preferences: lines
                .filter(line => line.startsWith('- '))
                .map(line => line.replace('- ', ''))
        };
    }

    /**
     * Parse working memory section from markdown content
     */
    private parseWorkingMemorySection(lines: string[]): Reasoning['workingMemory'] {
        return {
            goal: lines.find(l => l.includes('**Goal**:'))?.split(':')[1].trim() || '',
            subgoal: lines.find(l => l.includes('**Subgoal**:'))?.split(':')[1].trim() || '',
            context: lines.find(l => l.includes('**Context**:'))?.split(':')[1].trim() || '',
            state: lines.find(l => l.includes('**State**:'))?.split(':')[1].trim() || '',
            progress: {
                step: lines.find(l => l.startsWith('### '))?.replace('### ', '') || '',
                status: lines.find(l => l.includes('Status:'))?.split(':')[1].trim() || '',
                nextSteps: lines
                    .filter(l => l.startsWith('- '))
                    .map(l => l.replace('- ', ''))
            }
        };
    }

    /**
     * Parse knowledge graph section from markdown content
     */
    private parseKnowledgeGraphSection(lines: string[]): Reasoning['knowledgeGraph'] {
        return lines
            .filter(line => line.includes('[[') && line.includes(']]'))
            .map(line => {
                const matches = line.match(/\[\[(.*?)\]\] #(.*?) \[\[(.*?)\]\]/);
                if (!matches) return null;
                return {
                    subject: matches[1],
                    predicate: matches[2],
                    object: matches[3]
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
    }

    /**
     * Parse reasoning section from markdown content
     */
    private parseReasoningSection(lines: string[]): Reasoning['reasoning'] {
        return {
            propositions: {
                methodology: lines.find(l => l.includes('Methodology:'))?.split(':')[1].trim() || '',
                neurosymbolic: lines.find(l => l.includes('Neurosymbolic:'))?.split(':')[1].trim() || '',
                translation: lines.find(l => l.includes('Translation:'))?.split(':')[1].trim() || '',
                steps: {
                    description: lines.find(l => l.includes('Description:'))?.split(':')[1].trim() || '',
                    requires_tool: lines.find(l => l.includes('Requires Tool:'))?.includes('true') || false,
                    tool: lines.find(l => l.includes('Tool:'))?.split(':')[1].trim()
                }
            },
            critiques: lines
                .filter(l => l.startsWith('- '))
                .map(l => l.replace('- ', '')),
            reflections: lines
                .filter(l => l.startsWith('- '))
                .map(l => l.replace('- ', ''))
        };
    }

    /**
     * Update the index with new reasoning entry
     */
    private async updateIndex(reasoning: Reasoning): Promise<void> {
        try {
            const indexEntry = `- [[${reasoning.title}]] - ${reasoning.description}\n`;
            
            await this.vaultManager.updateNote(
                this.indexFile,
                indexEntry,
                {
                    createFolders: true
                }
            );
        } catch (error) {
            console.error(`Error updating index: ${error.message}`);
        }
    }

    /**
     * Sanitize title for filename
     */
    private sanitizeTitle(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    /**
     * Create a standardized error with context
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`ReasoningManager.${operation}: ${message}`);
    }

    /**
     * Process reasoning query
     */
    async process(query: string): Promise<any> {
        // Implement reasoning logic here, possibly integrating with an LLM
        // Placeholder implementation
        return `Processed reasoning for query: "${query}"`;
    }
}