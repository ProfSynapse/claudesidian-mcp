import { BaseTool, IToolContext } from '../BaseTool';
import { MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile, prepareFuzzySearch } from 'obsidian';

interface SearchMemoryResult {
    file: {
        path: string;
        basename: string;
    };
    title: string;
    type: MemoryType;
    description: string;
    relationships: string[];
    strength: number;
    score: number;
    content: string;
}

export class SearchMemoryTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'searchMemory',
            description: 'Search and retrieve memories with relationship awareness. If the user uses the hotkey `/m?` use the search memory tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    private getSearchScore(searchTerms: string, data: {
        content: string,
        tags?: string[],
        basename: string
    }): { score: number, matchType: string[] } {
        const matches: string[] = [];
        let score = 0;

        // Content match (weight: 0.4)
        if (data.content.toLowerCase().includes(searchTerms)) {
            score += 0.4;
            matches.push('content');
        }

        // Tag match (weight: 0.4)
        if (data.tags?.some(tag => {
            const normalizedTag = tag.toLowerCase().replace(/-/g, ' ');
            const normalizedSearch = searchTerms.toLowerCase();
            return normalizedTag.includes(normalizedSearch) || 
                   normalizedSearch.includes(normalizedTag);
        })) {
            score += 0.4;
            matches.push('tags');
        }

        // Filename match (weight: 0.2)
        const fuzzyResult = prepareFuzzySearch(searchTerms)(data.basename.toLowerCase());
        if (fuzzyResult) {
            score += 0.2 * fuzzyResult.score;
            matches.push('filename');
        }

        return { score, matchType: matches };
    }

    async execute(args: {
        keywords?: string[];
        limit?: number;
    }): Promise<SearchMemoryResult[]> {
        console.log('🔎 Searching memory notes:', args);

        // Ensure we have a valid memory type
        let memoryType: MemoryType = 'episodic'; // Default
        if (args.keywords) {
            const typeKeyword = args.keywords.find(kw => MemoryTypes.includes(kw as MemoryType));
            if (typeKeyword && MemoryTypes.includes(typeKeyword as MemoryType)) {
                memoryType = typeKeyword as MemoryType;
            }
        }

        const memoryPath = `${this.context.settings.rootPath}/memory`;
        const files = this.context.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(memoryPath));

        // Prepare search query without the memory type
        const searchTerms = (args.keywords || [])
            .filter(kw => !MemoryTypes.includes(kw as MemoryType))
            .join(' ')
            .toLowerCase();

        let matches: Array<{ 
            score: number; 
            file: TFile; 
            matchType: string[];
            content: string;
        }> = [];

        for (const file of files) {
            try {
                const content = await this.readNoteContent(file);
                const metadata = await this.context.vault.getNoteMetadata(file.path);

                if (metadata?.category && memoryType && metadata.category !== memoryType) {
                    continue;
                }

                const searchResult = this.getSearchScore(searchTerms, {
                    content,
                    tags: metadata?.tags,
                    basename: file.basename
                });

                if (searchResult.score > 0) {
                    matches.push({ 
                        score: searchResult.score, 
                        file,
                        matchType: searchResult.matchType,
                        content
                    });
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
            }
        }

        matches.sort((a, b) => b.score - a.score);
        const topMatches = matches.slice(0, args.limit || 5);

        return topMatches.map(match => ({
            file: {
                path: match.file.path,
                basename: match.file.basename
            },
            title: match.file.basename,
            type: memoryType,
            description: '',
            relationships: [],
            strength: 0,
            score: match.score,
            content: match.content
        }));
    }

    private async readNoteContent(file: TFile): Promise<string> {
        return await this.context.vault.readNote(file.path);
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                keywords: {
                    type: "array",
                    items: { type: "string" },
                    description: "Keywords for fuzzy searching. One item MUST be a valid MemoryType (e.g. 'episodic')."
                },
                limit: {
                    type: "number",
                    description: "Number of results to return",
                    default: 5
                }
            },
            required: ["keywords"]
        };
    }
}
