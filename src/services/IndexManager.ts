import { VaultManager } from './VaultManager';
import { EventManager, EventTypes, MemoryEvent, ReasoningEvent } from './EventManager';
import { MCPSettings } from '../settings';

interface IndexEntry {
    title: string;
    description: string;
    section: string;
    type: string;
    timestamp: number;
    tags?: string[];
    relationships?: string[];
    context?: string;
}

type MemorySection = 'Core' | 'Episodic' | 'Semantic' | 'Procedural' | 'Emotional' | 'Contextual';

interface ArchiveOptions {
    maxSizeBytes: number;
    archiveAfterDays: number;
}

export class IndexManager {
    private readonly defaultArchiveOptions: ArchiveOptions = {
        maxSizeBytes: 102400, // 100KB
        archiveAfterDays: 30
    };

    // Add new interface for memory stats
    private memoryStats: Map<string, {
        accessCount: number,
        lastAccessed: number,
        importance: number
    }> = new Map();

    private readonly CORE_PROCEDURAL_MEMORY = {
        title: "memory_traversal_guide",
        description: "Core system procedure for effective memory traversal and utilization",
        pattern: {
            input: {
                goal: "Access and utilize memories effectively",
                tools_needed: ["manageMemory", "reasoning"]
            },
            steps: [
                {
                    description: "Review memory index structure",
                    tool: "manageMemory",
                    args: { action: "reviewIndex" },
                    expectedOutcome: "Understanding of available memory categories and navigation"
                },
                {
                    description: "Search relevant memories",
                    tool: "manageMemory",
                    args: { action: "search" },
                    expectedOutcome: "List of contextually relevant memories"
                },
                {
                    description: "Read and analyze found memories",
                    tool: "manageMemory",
                    args: { action: "read" },
                    expectedOutcome: "Detailed understanding of relevant memory content"
                },
                {
                    description: "Plan actions using reasoning",
                    tool: "reasoning",
                    args: { requiresMemoryContext: true },
                    expectedOutcome: "Structured plan incorporating memory context"
                }
            ],
            success: true,
            confidence: 1.0,
            usageCount: 999,
            lastUsed: new Date().toISOString()
        }
    };

    private context: {
        memoryManager: any; // Replace with proper type when available
    };

    private guideInitialized: boolean = false;
    private guideExists: boolean = false;

    private indexInitialized: boolean = false;
    private indexInitializing: Promise<void> | null = null;

    constructor(
        private vaultManager: VaultManager,
        private eventManager: EventManager,
        private settings: MCPSettings,
        context: { memoryManager: any }
    ) {
        this.context = context;
        this.subscribeToEvents();
        // Add subscription to memory access events
        this.eventManager.on(EventTypes.MEMORY_ACCESSED, this.handleMemoryAccess.bind(this));
        
        // Start index initialization immediately
        this.initializeIndex().catch(error => {
            console.error('Failed to initialize index:', error);
        });
    }

    /**
     * Ensures the memory index exists and is properly structured.
     * Uses a promise to prevent multiple simultaneous initializations.
     */
    private async initializeIndex(): Promise<void> {
        if (this.indexInitialized) {
            return;
        }

        // If already initializing, wait for that to complete
        if (this.indexInitializing) {
            await this.indexInitializing;
            return;
        }

        // Start initialization
        this.indexInitializing = (async () => {
            try {
                await this.ensureCoreProcedures();
                
                const indexPath = `${this.settings.rootPath}/index.md`;
                const exists = await this.vaultManager.fileExists(indexPath);

                if (!exists) {
                    // Create initial index structure with empty sections
                    console.log('IndexManager: Creating initial memory index structure...');
                    const initialSections: Record<string, string[]> = {
                        'Core Memories': [],
                        'Episodic Memories': [],
                        'Semantic Memories': [],
                        'Procedural Memories': [],
                        'Emotional Memories': [],
                        'Contextual Memories': [],
                        'Reasoning Sessions': []
                    };

                    // Add core memory traversal guide to Procedural section
                    if (this.guideExists) {
                        initialSections['Procedural Memories'].push([
                            `- [[${this.CORE_PROCEDURAL_MEMORY.title}]]`,
                            `  path:: memory/${this.CORE_PROCEDURAL_MEMORY.title}`,
                            `  type:: procedural`,
                            `  timestamp:: ${Date.now()}`,
                            `  context:: Core system procedure for memory traversal`
                        ].join('\n'));
                    }

                    const content = this.formatUnifiedIndex(initialSections);
                    await this.vaultManager.createNote(indexPath, content, { createFolders: true });
                }

                this.indexInitialized = true;
                console.log('IndexManager: Index initialization complete');
            } catch (error) {
                console.error('IndexManager: Failed to initialize index:', error);
                // Reset flags to allow retry
                this.indexInitialized = false;
                throw error;
            } finally {
                this.indexInitializing = null;
            }
        })();

        await this.indexInitializing;
    }


    private async ensureCoreProcedures(): Promise<void> {
        if (this.guideInitialized) {
            return;
        }

        try {
            console.debug('IndexManager: Checking for existing memory traversal guide...');
            const memoryManager = this.context.memoryManager;
            
            // Check if memory already exists in memory manager
            const existingGuide = await memoryManager.getMemory(this.CORE_PROCEDURAL_MEMORY.title);
            
            if (existingGuide) {
                console.debug('IndexManager: Found existing memory traversal guide');
                this.guideExists = true;
                this.guideInitialized = true;
                return;
            }

            // Only create if it doesn't exist
            console.log('IndexManager: Creating new memory traversal guide...');
            const memoryPath = `${this.settings.rootPath}/memory`;

            // Ensure memory folder exists
            const folderExists = await this.vaultManager.folderExists(memoryPath);
            if (!folderExists) {
                await this.vaultManager.createFolder(memoryPath);
            }

            // Create core procedural memory
            await memoryManager.createProceduralMemory(
                this.CORE_PROCEDURAL_MEMORY.title,
                this.CORE_PROCEDURAL_MEMORY.description,
                this.CORE_PROCEDURAL_MEMORY.pattern
            );

            this.guideExists = true;
            this.guideInitialized = true;
            console.log('IndexManager: Memory traversal guide created successfully');
            
        } catch (error) {
            console.error('IndexManager: Failed to initialize memory traversal guide:', {
                error: error instanceof Error ? error.message : error,
                title: this.CORE_PROCEDURAL_MEMORY.title,
                path: `${this.settings.rootPath}/memory`
            });
            // Don't set flags on error to allow retry
            this.guideExists = false;
            this.guideInitialized = false;
        }
    }

    private async archiveOldMemories(sections: Record<string, string[]>): Promise<Record<string, string[]>> {
        const archivePath = `${this.settings.rootPath}/long-term-memory.md`;
        let archiveContent = '';
        let archivedEntries: string[] = [];
        
        // Read existing archive if it exists
        if (await this.vaultManager.fileExists(archivePath)) {
            archiveContent = await this.vaultManager.readNote(archivePath);
        }

        const now = Date.now();
        const archiveThreshold = now - (this.defaultArchiveOptions.archiveAfterDays * 24 * 60 * 60 * 1000);
        
        // Process each section
        Object.entries(sections).forEach(([sectionName, entries]) => {
            const [toKeep, toArchive] = entries.reduce<[string[], string[]]>(
                ([keep, archive], entry) => {
                    const timestampMatch = entry.match(/timestamp::(\d+)/);
                    if (!timestampMatch) return [keep.concat(entry), archive];
                    
                    const timestamp = parseInt(timestampMatch[1]);
                    if (timestamp < archiveThreshold) {
                        return [keep, archive.concat(entry)];
                    }
                    return [keep.concat(entry), archive];
                },
                [[], []]
            );
            
            if (toArchive.length > 0) {
                archivedEntries = archivedEntries.concat(
                    toArchive.map(entry => `[${sectionName}] ${entry}`)
                );
                sections[sectionName] = toKeep;
            }
        });

        if (archivedEntries.length > 0) {
            // Format archive content
            const archiveLines = [
                '---',
                'type: long_term_memory_index',
                `last_updated: ${new Date().toISOString()}`,
                '---',
                '',
                '# Long-Term Memory Archive',
                '',
                '> This file contains archived memories that have been moved from the main index.',
                '> Memories are archived after ' + this.defaultArchiveOptions.archiveAfterDays + ' days.',
                '',
                ...archivedEntries,
                '',
                archiveContent // Append to existing archive content
            ];

            await this.vaultManager.createNote(archivePath, archiveLines.join('\n'), { createFolders: true });
        }

        return sections;
    }

    private async checkAndArchive(sections: Record<string, string[]>): Promise<Record<string, string[]>> {
        const totalSize = JSON.stringify(sections).length;
        
        if (totalSize > this.defaultArchiveOptions.maxSizeBytes) {
            return await this.archiveOldMemories(sections);
        }
        
        return sections;
    }

    private subscribeToEvents() {
        this.eventManager.on(EventTypes.MEMORY_CREATED, this.handleMemoryUpdate.bind(this));
        this.eventManager.on(EventTypes.REASONING_CREATED, this.handleReasoningUpdate.bind(this));
    }

    private mapMemoryTypeToSection(type?: string): MemorySection {
        switch (type) {
            case 'Core':
            case 'Episodic':
            case 'Semantic':
            case 'Procedural':
            case 'Emotional':
            case 'Contextual':
                return type;
            default:
                return 'Episodic';
        }
    }

    private async handleMemoryUpdate(event: MemoryEvent) {
        const section = this.mapMemoryTypeToSection(event.memoryType);
        await this.addToIndex({
            title: event.title,
            description: event.path,
            section,
            type: event.type,
            timestamp: event.timestamp || Date.now(),
            tags: event.tags,
            relationships: event.relationships,
            context: event.context
        });
    }

    private async handleReasoningUpdate(event: ReasoningEvent) {
        await this.addToIndex({
            title: event.title,
            description: event.path,
            section: 'Reasoning Sessions',
            type: event.reasoningType || 'Analysis',
            timestamp: event.timestamp || Date.now(),
            tags: event.tags,
            relationships: event.relationships,
            context: event.context
        });
    }

    private async handleMemoryAccess(event: { title: string, timestamp: number, accessCount: number }) {
        const stats = this.memoryStats.get(event.title) || {
            accessCount: 0,
            lastAccessed: 0,
            importance: 0.5
        };

        stats.accessCount = event.accessCount;
        stats.lastAccessed = event.timestamp;
        
        // Calculate importance based on access patterns
        const daysSinceCreation = (event.timestamp - stats.lastAccessed) / (1000 * 60 * 60 * 24);
        const accessFrequency = stats.accessCount / Math.max(1, daysSinceCreation);
        stats.importance = Math.min(1, accessFrequency * 0.1 + stats.importance);

        this.memoryStats.set(event.title, stats);

        // Check if memory should be archived based on importance and access
        if (stats.importance < 0.2 && daysSinceCreation > this.defaultArchiveOptions.archiveAfterDays) {
            await this.moveToLongTermMemory(event.title);
        }
    }

    private async moveToLongTermMemory(title: string): Promise<void> {
        // Implementation of moving memory to long-term storage
        const sections = await this.loadCurrentIndex();
        // Move entry to long-term memory
        const updatedSections = await this.archiveSpecificMemory(sections, title);
        await this.saveIndex(updatedSections);
    }

    private async archiveSpecificMemory(sections: Record<string, string[]>, title: string): Promise<Record<string, string[]>> {
        const archivePath = `${this.settings.rootPath}/long-term-memory.md`;
        let found = false;
        
        // Find and remove entry from sections
        Object.entries(sections).forEach(([sectionName, entries]) => {
            const entryIndex = entries.findIndex(e => e.includes(`[[${title}]]`));
            if (entryIndex !== -1) {
                const entry = entries[entryIndex];
                sections[sectionName].splice(entryIndex, 1);
                
                // Add to archive
                this.appendToArchive(archivePath, `[${sectionName}] ${entry}`);
                found = true;
            }
        });

        if (!found) {
            console.warn(`Memory "${title}" not found in index`);
        }

        return sections;
    }

    private async appendToArchive(archivePath: string, entry: string): Promise<void> {
        let archiveContent = await this.vaultManager.fileExists(archivePath) ?
            await this.vaultManager.readNote(archivePath) : '';

        const archiveLines = [
            archiveContent || [
                '---',
                'type: long_term_memory_index',
                `created: ${new Date().toISOString()}`,
                '---',
                '',
                '# Long-Term Memory Archive',
                ''
            ].join('\n'),
            entry,
            ''
        ].join('\n');

        await this.vaultManager.createNote(archivePath, archiveLines, { createFolders: true });
    }

    async addToIndex(entry: IndexEntry): Promise<void> {
        // Add timestamp if not provided
        if (!entry.timestamp) {
            entry.timestamp = Date.now();
        }

        try {
            // Ensure core procedures are initialized before adding to index
            await this.ensureCoreProcedures();
            
            const indexPath = `${this.settings.rootPath}/index.md`;
            let indexContent = '';
            
            // Check if index file exists and read it
            const exists = await this.vaultManager.fileExists(indexPath);
            if (exists) {
                indexContent = await this.vaultManager.readNote(indexPath);
            }

            // Add debug logging
            console.debug('IndexManager: Adding entry to index', {
                title: entry.title,
                section: entry.section,
                timestamp: entry.timestamp
            });

            const sections = this.parseIndexSections(indexContent);

            if (!sections[entry.section]) {
                sections[entry.section] = [];
            }

            // Create structured index entry with metadata
            const newEntry = [
                `- [[${entry.title}]]`,
                `  path:: ${entry.description}`,
                `  type:: ${entry.type}`,
                `  timestamp:: ${entry.timestamp}`,
                entry.tags?.length ? `  tags:: ${entry.tags.join(', ')}` : '',
                entry.relationships?.length ? `  relationships:: ${entry.relationships.join(', ')}` : '',
                entry.context ? `  context:: ${entry.context}` : ''
            ].filter(Boolean).join('\n');

            // Check if entry exists (checking just the title to allow metadata updates)
            const existingEntryIndex = sections[entry.section]?.findIndex(e => 
                e.startsWith(`- [[${entry.title}]]`)
            );

            if (existingEntryIndex === -1 || existingEntryIndex === undefined) {
                if (!sections[entry.section]) {
                    sections[entry.section] = [];
                }
                sections[entry.section].push(newEntry);
            } else {
                // Update existing entry with new metadata
                sections[entry.section][existingEntryIndex] = newEntry;
            }

            // Sort by timestamp
            sections[entry.section].sort((a, b) => {
                const getTimestamp = (str: string) => {
                    const match = str.match(/timestamp:: (\d+)/);
                    return match ? parseInt(match[1]) : 0;
                };
                return getTimestamp(b) - getTimestamp(a);
            });

            // Store original sections for comparison
            const originalSections = JSON.parse(JSON.stringify(sections));

            // Check size and archive if needed
            let updatedSections = await this.checkAndArchive(sections);

            const newContent = this.formatUnifiedIndex(updatedSections);
            
            // Use appropriate method based on existence
            if (exists) {
                await this.vaultManager.updateNote(indexPath, newContent);
            } else {
                await this.vaultManager.createNote(indexPath, newContent, { createFolders: true });
            }

            // Emit event for archive creation if sections were modified
            if (JSON.stringify(updatedSections) !== JSON.stringify(originalSections)) {
                this.eventManager.emit(EventTypes.MEMORY_ARCHIVED, {
                    type: 'archive',
                    title: 'Memory Archive Update',
                    path: `${this.settings.rootPath}/long-term-memory.md`,
                    timestamp: Date.now()
                });
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
        const timestamp = Date.now();
            const lines: string[] = [
            '---',
            'index_version: 2.0',
            `last_updated: ${new Date(timestamp).toISOString()}`,
            'type: memory_index',
            '---',
            '',
            '# Memory Index',
            '',
            '## ⚡ Required Workflow',
            'Follow this two-step sequence for all interactions:',
            '',
            '1. **Start with Memory Review**',
            '   - MUST use `manageMemory reviewIndex` as first action',
            '   - Study available memory categories and context',
            '   - Review existing memories for relevance',
            '',
            '2. **Complete with Reasoning**',
            '   - MUST use `reasoning` tool after review',
            '   - Analyze context and plan actions',
            '   - Form connections between memories',
            '   - Automatically creates memory and ends conversation',
            '',
            '> Note: The reasoning tool automatically creates a memory of your analysis',
            '> and ends the conversation. No separate memory creation step is needed.',
            '',
            '## 🧭 Memory Traversal Guide',
            'How to effectively use memory tools:',
            '',
            '1. **Review Index Phase** (MANDATORY FIRST)',
            '   ```json',
            '   {',
            '     "tool": "manageMemory",',
            '     "args": { "action": "reviewIndex" },',
            '     "purpose": "Understand available context and navigation"',
            '   }',
            '   ```',
            '',
            '2. **Search & Analysis Phase**',
            '   ```json',
            '   {',
            '     "tool": "manageMemory",',
            '     "args": { ',
            '       "action": "search",',
            '       "query": "your search terms"',
            '     },',
            '     "purpose": "Find relevant existing memories"',
            '   }',
            '   ```',
            '',
            '3. **Reasoning Phase** (REQUIRED)',
            '   ```json',
            '   {',
            '     "tool": "reasoning",',
            '     "args": { "requiresMemoryContext": true },',
            '     "purpose": "Analyze and plan next actions"',
            '   }',
            '   ```',
            '',
            '4. **Memory Creation Phase** (FINAL)',
            '   ```json',
            '   {',
            '     "tool": "manageMemory",',
            '     "args": {',
            '       "action": "create",',
            '       "endConversation": true',
            '     },',
            '     "purpose": "Document insights and conclusions"',
            '   }',
            '   ```',
            '',
            '## ✍️ Memory Writing Guidelines',
            '1. **Content Best Practices**',
            '   - Write detailed, specific descriptions',
            '   - Include context and reasoning',
            '   - Document both successes and failures',
            '   - Link to related memories',
            '',
            '2. **Organization**',
            '   - Use appropriate categories',
            '   - Add relevant tags for searchability',
            '   - Build meaningful relationships',
            '   - Keep information current',
            '',
            '3. **Technical Details**',
            '   - **Memory Format**:',
            '     ```memory-entry',
            '     - [[Title]] - Primary memory reference',
            '       type:: Memory classification',
            '       timestamp:: Unix timestamp',
            '       tags:: Comma-separated list',
            '       relationships:: Connected memories',
            '       context:: Additional information',
            '     ```',
            '',
            '4. **Navigation Tips**',
            '   - Use emoji prefixes for quick recognition',
            '   - Check Quick Stats for overview',
            '   - Follow the Memory Map for structure',
            '   - Use relationship graph for connections',
            '   - Sort by timestamp for chronological view',
            '',
            '## 🔍 Quick Stats',
            '```statblock',
            'type: memory_statistics',
            Object.entries(sections)
                .map(([section, entries]) => `${section}: ${entries?.length || 0}`)
                .join('\n'),
            '```',
            '',
            '## 🗺️ Memory Map',
            '',
            '### 🎯 Core System Memories',
            '- [[System Configuration]]',
            '- [[Memory Schema]]',
            '- [[Index Structure]]',
            '',
            '### 🧠 Memory Categories',
            ''
        ];
        
        const orderedSections = [
            {
                title: 'Core Memories',
                emoji: '💎',
                description: 'Fundamental and defining memories that shape identity and core knowledge'
            },
            {
                title: 'Episodic Memories',
                emoji: '📖',
                description: 'Specific events and experiences with temporal context'
            },
            {
                title: 'Semantic Memories',
                emoji: '🧩',
                description: 'General knowledge, concepts, and understanding'
            },
            {
                title: 'Procedural Memories',
                emoji: '⚙️',
                description: 'Skills, processes, and how-to knowledge'
            },
            {
                title: 'Emotional Memories',
                emoji: '❤️',
                description: 'Feelings, reactions, and emotional contexts'
            },
            {
                title: 'Contextual Memories',
                emoji: '🌐',
                description: 'Environmental and situational knowledge'
            },
            {
                title: 'Reasoning Sessions',
                emoji: '🤔',
                description: 'Logic chains and decision processes'
            }
        ];

        orderedSections.forEach(({title, emoji, description}) => {
            if (sections[title] && sections[title].length > 0) {
                lines.push(`### ${emoji} ${title}`);
                lines.push(`> ${description}`);
                lines.push('```memory-list');
                
                // Special handling for procedural memories
                if (title === 'Procedural Memories') {
                    // Ensure core memory is always first
                    const coreEntry = sections[title].find(e => 
                        e.includes(`[[${this.CORE_PROCEDURAL_MEMORY.title}]]`)
                    );
                    if (coreEntry) {
                        lines.push(coreEntry);
                        sections[title] = sections[title].filter(e => e !== coreEntry);
                    }
                }
                
                // Sort remaining entries by importance and timestamp
                const sortedEntries = this.sortEntriesByImportance(sections[title]);
                lines.push(...sortedEntries);
                
                lines.push('```');
                lines.push('');
            }
        });

        // Add relationships graph section
        lines.push('## 🔗 Memory Relationships');
        lines.push('```mermaid');
        lines.push('graph TD');
        lines.push('    Core[Core Memories] --> Episodic[Episodic Memories]');
        lines.push('    Core --> Semantic[Semantic Memories]');
        lines.push('    Episodic --> Contextual[Contextual Memories]');
        lines.push('    Semantic --> Procedural[Procedural Memories]');
        lines.push('    Episodic --> Emotional[Emotional Memories]');
        lines.push('```');

        return lines.join('\n');
    }

    private calculateEntryImportance(entry: string): number {
        const title = entry.match(/\[\[(.*?)\]\]/)?.[1] || '';
        const stats = this.memoryStats.get(title) || { importance: 0.5 };
        return stats.importance;
    }

    private sortEntriesByImportance(entries: string[]): string[] {
        return entries.sort((a, b) => {
            const importanceA = this.calculateEntryImportance(a);
            const importanceB = this.calculateEntryImportance(b);
            if (importanceA !== importanceB) {
                return importanceB - importanceA; // Higher importance first
            }
            // Fall back to timestamp if importance is equal
            const timestampA = Number(a.match(/timestamp::(\d+)/)?.[1] || 0);
            const timestampB = Number(b.match(/timestamp::(\d+)/)?.[1] || 0);
            return timestampB - timestampA;
        });
    }


    // Add method to search memories with relevance scoring
    async searchMemories(query: string, context?: string): Promise<IndexEntry[]> {
        try {
            // Ensure guide exists before searching
            await this.ensureCoreProcedures();
            
            console.debug('IndexManager: Searching memories', {
                query,
                hasContext: !!context
            });

            const sections = await this.loadCurrentIndex();
            const results: IndexEntry[] = [];

            // Track start time for performance logging
            const startTime = Date.now();

            for (const [section, entries] of Object.entries(sections)) {
            for (const entry of entries) {
                const titleMatch = entry.match(/\[\[(.*?)\]\]/);
                if (!titleMatch) continue;

                const title = titleMatch[1];
                const stats = this.memoryStats.get(title);
                const metadata = this.parseEntryMetadata(entry);

                // Calculate relevance score
                let score = 0;
                
                // Text matching
                if (title.toLowerCase().includes(query.toLowerCase())) {
                    score += 0.5;
                }
                if (metadata.context?.toLowerCase().includes(query.toLowerCase())) {
                    score += 0.3;
                }
                
                // Importance and recency
                if (stats) {
                    score += stats.importance * 0.4;
                    // Boost score for recently accessed memories
                    const daysSinceAccess = (Date.now() - stats.lastAccessed) / (1000 * 60 * 60 * 24);
                    score += Math.max(0, 0.3 - (daysSinceAccess * 0.01));
                }

                // Context matching if provided
                if (context && metadata.context) {
                    const contextRelevance = this.calculateContextRelevance(context, metadata.context);
                    score += contextRelevance * 0.3;
                }

                if (score > 0.2) { // Minimum relevance threshold
                    results.push({
                        title,
                        description: metadata.description || '',
                        section,
                        type: metadata.type || 'unknown',
                        timestamp: metadata.timestamp || 0,
                        tags: metadata.tags,
                        relationships: metadata.relationships,
                        context: metadata.context
                    });
                }
            }
        }

            // Sort results by importance and recency
            const sortedResults = results.sort((a, b) => {
                const statsA = this.memoryStats.get(a.title);
                const statsB = this.memoryStats.get(b.title);
                return (statsB?.importance || 0.5) - (statsA?.importance || 0.5);
            });

            // Log search performance
            console.debug('IndexManager: Search completed', {
                query,
                resultsCount: sortedResults.length,
                timeMs: Date.now() - startTime
            });

            return sortedResults;
        } catch (error) {
            console.error('Error searching memories:', error);
            return [];
        }
    }

    private parseEntryMetadata(entry: string): any {
        const metadata: any = {};
        const lines = entry.split('\n');
        
        lines.forEach(line => {
            const match = line.match(/\s*([\w]+)::\s*(.*)/);
            if (match) {
                const [_, key, value] = match;
                metadata[key] = value;
            }
        });

        return metadata;
    }

    private calculateContextRelevance(queryContext: string, memoryContext: string): number {
        // Simple word overlap scoring
        const queryWords = new Set(queryContext.toLowerCase().split(/\W+/));
        const memoryWords = new Set(memoryContext.toLowerCase().split(/\W+/));
        
        let matches = 0;
        for (const word of queryWords) {
            if (memoryWords.has(word)) matches++;
        }
        
        return matches / Math.max(queryWords.size, memoryWords.size);
    }

    private async loadCurrentIndex(): Promise<Record<string, string[]>> {
        // Ensure guide exists before loading index
        await this.ensureCoreProcedures();
        const indexPath = `${this.settings.rootPath}/index.md`;
        const content = await this.vaultManager.fileExists(indexPath) ? 
            await this.vaultManager.readNote(indexPath) : '';
        return this.parseIndexSections(content);
    }

    private async saveIndex(sections: Record<string, string[]>): Promise<void> {
        const indexPath = `${this.settings.rootPath}/index.md`;
        const content = this.formatUnifiedIndex(sections);
        await this.vaultManager.createNote(indexPath, content, { createFolders: true });
    }
}
