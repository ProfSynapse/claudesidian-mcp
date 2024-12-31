import { BaseTool, IToolContext } from '../BaseTool';
import { TFile, prepareFuzzySearch } from 'obsidian';

export class SearchTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'search',
            description: 'Find a note in the vault using fuzzy search. Use this for general note operations (edit, insert, move). ' + 
                        'For memory-related operations like retrieving past context or learned information, use searchMemory instead.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<string | null> {
        const { query } = args;
        const files = this.context.app.vault.getFiles()
            .filter(file => file.extension === 'md');

        const fuzzySearch = prepareFuzzySearch(query);
        let bestMatch: { score: number; file: TFile } | null = null;

        for (const file of files) {
            const match = fuzzySearch(file.basename);
            if (match && (!bestMatch || match.score > bestMatch.score)) {
                bestMatch = { score: match.score, file };
            }
        }

        return bestMatch ? bestMatch.file.path : null;
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to find a note for editing, inserting, or other note operations"
                }
            },
            required: ["query"]
        };
    }
}
