import { VaultManager } from './VaultManager';
import { EventManager, EventTypes, MemoryEvent, ReasoningEvent } from './EventManager';
import { BridgeMCPSettings } from '../settings';

interface IndexEntry {
    title: string;
    description: string;
    section: string;
}

export class IndexManager {
    constructor(
        private vaultManager: VaultManager,
        private eventManager: EventManager,
        private settings: BridgeMCPSettings
    ) {
        this.subscribeToEvents();
    }

    private subscribeToEvents() {
        this.eventManager.on(EventTypes.MEMORY_CREATED, this.handleMemoryUpdate.bind(this));
        this.eventManager.on(EventTypes.REASONING_CREATED, this.handleReasoningUpdate.bind(this));
    }

    private async handleMemoryUpdate(event: MemoryEvent) {
        await this.addToIndex({
            title: event.title,
            description: event.path,
            section: 'Memories'
        });
    }

    private async handleReasoningUpdate(event: ReasoningEvent) {
        await this.addToIndex({
            title: event.title,
            description: event.path,
            section: 'Reasoning'
        });
    }

    async addToIndex(entry: IndexEntry): Promise<void> {
        try {
            const indexPath = `${this.settings.rootPath}/index.md`;
            let indexContent = '';
            
            // Check if index file exists and read it
            const exists = await this.vaultManager.fileExists(indexPath);
            if (exists) {
                indexContent = await this.vaultManager.readNote(indexPath);
            }

            const sections = this.parseIndexSections(indexContent);

            if (!sections[entry.section]) {
                sections[entry.section] = [];
            }

            // Create index entry with wikilink
            const newEntry = `- [[${entry.title}]] - ${entry.description}`;
            if (!sections[entry.section].includes(newEntry)) {
                sections[entry.section].push(newEntry);
                sections[entry.section].sort();
            }

            const newContent = this.formatUnifiedIndex(sections);
            
            // Use appropriate method based on existence
            if (exists) {
                await this.vaultManager.updateNote(indexPath, newContent);
            } else {
                await this.vaultManager.createNote(indexPath, newContent, { createFolders: true });
            }
            // Remove or comment out the following to prevent Dataview error:
            // await this.vaultManager.refreshIndex();
        } catch (error) {
            console.error('Error updating index:', error);
        }
    }

    private parseIndexSections(content: string): Record<string, string[]> {
        const sections: Record<string, string[]> = {};
        let currentSection = '';
        
        content.split('\n').forEach(line => {
            if (line.startsWith('## ')) {
                currentSection = line.substring(3);
                sections[currentSection] = [];
            } else if (currentSection && line.trim().startsWith('-')) {
                sections[currentSection].push(line.trim());
            }
        });
        
        return sections;
    }

    private formatUnifiedIndex(sections: Record<string, string[]>): string {
        const lines: string[] = ['# Index\n'];
        
        const orderedSections = [
            'Core Memories',
            'Episodic Memories',
            'Semantic Memories',
            'Procedural Memories',
            'Emotional Memories',
            'Contextual Memories',
            'Search Results',
            'Reasoning Sessions'
        ];

        orderedSections.forEach(section => {
            if (sections[section] && sections[section].length > 0) {
                lines.push(`## ${section}`);
                sections[section].sort();
                lines.push(...sections[section]);
                lines.push(''); // Empty line between sections
            }
        });

        return lines.join('\n');
    }
}
