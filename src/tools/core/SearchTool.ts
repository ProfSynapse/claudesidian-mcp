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

        const files = this.context.app.vault.getMarkdownFiles();
        console.log(`Found ${files.length} markdown files to search`);

        // Break query into individual words and remove common articles
        const stopWords = new Set(['the', 'a', 'an']);
        const queryWords = query.toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !stopWords.has(word) && word.length > 1);
        
        console.log('Search words:', queryWords);

        const matches = files.map(file => {
            const pathLower = file.path.toLowerCase();
            let score = 0;
            let debugMatches: string[] = [];

            // Score each word separately
            for (const word of queryWords) {
                const fuzzyMatch = prepareFuzzySearch(word)(pathLower);
                if (fuzzyMatch && fuzzyMatch.score > 0) {
                    score += fuzzyMatch.score;
                    debugMatches.push(`"${word}": ${fuzzyMatch.score.toFixed(2)}`);
                }
            }

            // Boost score if path contains the exact words
            queryWords.forEach((word: string) => {
                if (pathLower.includes(word)) {
                    score += 1;
                    debugMatches.push(`exact "${word}"`);
                }
            });

            return { file, score, debugMatches };
        })
        .filter(match => match.score > 0)
        .sort((a, b) => b.score - a.score);

        // Log results with match details
        console.log("\nTop matches:");
        matches.slice(0, 10).forEach((match, i) => {
            console.log(`${i + 1}. [${match.score.toFixed(2)}] ${match.file.path}`);
            console.log(`   Matches: ${match.debugMatches.join(', ')}`);
        });

        if (!matches.length) {
            console.log("No matches found");
            return null;
        }

        // For saving new files, use the claudesidian folder
        if (saveAsDistinct) {
            const distinctPath = `${this.context.settings.rootPath}/${this.createDistinctFilename(query)}`;
            console.log(`Using distinct path: ${distinctPath}`);
            return distinctPath;
        }

        // Return the best match
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
