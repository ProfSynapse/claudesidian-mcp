import { BaseMode } from '../../baseMode';
import { MemoryManager } from '../memoryManager';
import { IndexFileParams, IndexFileResult } from '../types';
import { schema } from '../config';

/**
 * Mode for indexing a file in the memory storage
 * Processes file content and creates embeddings
 */
export class IndexFileMode extends BaseMode<IndexFileParams, IndexFileResult> {
    constructor(private memoryManager: MemoryManager) {
        super('index-file', 'Index File', 'Indexes a file in the memory system', '1.0.0');
    }

    /**
     * Execute the index file mode
     * 
     * @param params Index parameters
     * @returns Index result
     */
    async execute(params: IndexFileParams): Promise<IndexFileResult> {
        try {
            // Validate file path isn't empty
            if (!params.filePath || params.filePath.trim() === '') {
                throw new Error('File path cannot be empty');
            }
            
            // Index the file
            const result = await this.memoryManager.indexFile(
                params.filePath,
                params.force || false
            );
            
            return {
                success: result.success,
                chunks: result.chunks,
                filePath: params.filePath,
                error: result.error
            };
        } catch (error) {
            console.error('Error indexing file:', error);
            return {
                success: false,
                filePath: params.filePath,
                error: error.message
            };
        }
    }

    /**
     * Get parameter JSON schema
     */
    getParameterSchema(): Record<string, any> {
        return schema.indexParams;
    }

    /**
     * Get result JSON schema
     */
    getResultSchema(): Record<string, any> {
        return schema.indexResults;
    }
}