import { VaultManager } from './VaultManager';
import { EventManager, EventTypes, MemoryEvent, ReasoningEvent } from './EventManager';
import { BridgeMCPSettings } from '../settings';

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
        await this.updateIndex('Memories', {
            title: event.title,
            path: event.path,
            type: event.type
        });
    }

    private async handleReasoningUpdate(event: ReasoningEvent) {
        await this.updateIndex('Reasoning', {
            title: event.title,
            path: event.path
        });
    }

    private async updateIndex(section: string, entry: { title: string, path: string, type?: string }) {
        const indexPath = `${this.settings.rootPath}/index.md`;
        let content: string;

        try {
            content = await this.vaultManager.readNote(indexPath);
        } catch {
            content = '# Index\n\n## Memories\n\n## Reasoning\n';
        }

        const lines = content.split('\n');
        const sectionIndex = lines.findIndex(line => line.trim() === `## ${section}`);
        
        if (sectionIndex === -1) {
            lines.push(`\n## ${section}\n`);
        }

        const newEntry = entry.type 
            ? `- [[${entry.path}|${entry.title}]] (${entry.type})`
            : `- [[${entry.path}|${entry.title}]]`;

        lines.splice(sectionIndex + 2, 0, newEntry);

        await this.vaultManager.createNote(indexPath, lines.join('\n'), { createFolders: true });
    }
}
