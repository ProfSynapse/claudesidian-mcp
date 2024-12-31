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

    private createDistinctFilename(query: string): string {
        const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace(/[T.]/g, '_')
            .slice(0, 15); // Get YYYYMMDD_HHMMSS
        
        const sanitizedQuery = query.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 30); // Limit length
        
        return `search_${timestamp}_${sanitizedQuery}`;
    }

    async execute(args: any): Promise<string | null> {
        const { query, saveAsDistinct } = args;
        console.log(`Searching for: "${query}"`);
        
        const files = this.context.app.vault.getFiles()
            .filter(file => file.extension === 'md');
        console.log(`Found ${files.length} markdown files`);

        const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
        let matches: Array<{ score: number; file: TFile }> = [];

        console.log('\nSearching through files:');
        for (const file of files) {
            const result = fuzzySearch(file.path.toLowerCase());
            if (result) {
                // Use raw score - higher is better (whether positive or negative)
                console.log(`Match: "${file.path}" (score: ${result.score})`);
                matches.push({ score: result.score, file });
            }
        }

        // Sort by raw score (higher numbers first)
        matches.sort((a, b) => b.score - a.score);
        
        console.log("\nTop matches:");
        matches.slice(0, 10).forEach((match, i) => {
            console.log(`${i + 1}. [${match.score.toFixed(2)}] ${match.file.path}`);
        });

        if (!matches.length) return null;

        // If saveAsDistinct is true or there are similarly named files, use distinct name
        if (saveAsDistinct || this.hasSimilarFiles(matches[0].file.path, files)) {
            const distinctPath = `${this.context.settings.rootPath}/${this.createDistinctFilename(query)}`;
            console.log(`Using distinct path: ${distinctPath}`);
            return distinctPath;
        }

        return matches[0].file.path;
    }

    private hasSimilarFiles(path: string, files: TFile[]): boolean {
        const basename = path.split('/').pop()?.replace('.md', '') || '';
        const similarCount = files.filter(f => 
            f.path.toLowerCase().includes(basename.toLowerCase())
        ).length;
        return similarCount > 1;
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
