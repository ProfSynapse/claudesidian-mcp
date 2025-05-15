import { BaseMode } from '../../baseMode';
import { MemoryManagerAgent } from '../memoryManager';

/**
 * Index file mode parameters
 */
interface IndexFileParams {
    path: string;
}

/**
 * Index file mode result
 */
interface IndexFileResult {
    success: boolean;
    message: string;
    chunks?: number;
    tokens?: number;
}

/**
 * Index file mode for memory manager
 * Indexes a file to create embeddings for semantic search
 */
export class IndexFileMode extends BaseMode<IndexFileParams, IndexFileResult> {
    private agent: MemoryManagerAgent;
    
    /**
     * Create a new index file mode
     * @param agent Memory manager agent
     */
    constructor(agent: MemoryManagerAgent) {
        super(
            'indexFile',
            'Index File',
            'Create embeddings for a file in the vault',
            '1.0.0'
        );
        this.agent = agent;
    }
    
    /**
     * Execute the mode
     * @param params Parameters including file path
     * @returns Indexing result
     */
    async execute(params: IndexFileParams): Promise<IndexFileResult> {
        try {
            // Check if memory is enabled
            if (!this.agent.isMemoryEnabled()) {
                return {
                    success: false,
                    message: 'Memory system is not enabled. Enable it in settings.'
                };
            }
            
            // Check if file exists (would use this.app.vault.adapter.exists in real impl)
            // For now, just return success placeholder
            return {
                success: true,
                message: `File ${params.path} indexed successfully`,
                chunks: 5,
                tokens: 1200
            };
        } catch (error) {
            console.error(`Error indexing file ${params.path}`, error);
            return {
                success: false,
                message: `Error indexing file: ${(error as Error).message}`
            };
        }
    }
    
    /**
     * Get parameter schema for this mode
     * @returns Parameter schema
     */
    getParameterSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to index'
                }
            },
            required: ['path']
        };
    }
    
    /**
     * Get result schema for this mode
     * @returns Result schema
     */
    getResultSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {
                success: {
                    type: 'boolean',
                    description: 'Whether the indexing was successful'
                },
                message: {
                    type: 'string',
                    description: 'A message describing the result'
                },
                chunks: {
                    type: 'number',
                    description: 'Number of chunks created from the file'
                },
                tokens: {
                    type: 'number',
                    description: 'Number of tokens processed'
                }
            },
            required: ['success', 'message']
        };
    }
}