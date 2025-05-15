import { BaseMode } from '../../baseMode';
import { MemoryManager } from '../memoryManager';
import { BatchIndexParams, BatchIndexResult } from '../types';
import { schema } from '../config';

/**
 * Mode for batch indexing multiple files in the memory storage
 * Processes multiple file contents and creates embeddings in a single operation
 */
export class BatchIndexMode extends BaseMode<BatchIndexParams, BatchIndexResult> {
    constructor(private memoryManager: MemoryManager) {
        super('batch-index', 'Batch Index', 'Indexes multiple files in the memory system', '1.0.0');
    }

    /**
     * Execute the batch index mode
     * 
     * @param params Batch index parameters
     * @returns Batch index result
     */
    async execute(params: BatchIndexParams): Promise<BatchIndexResult> {
        try {
            // Validate file paths aren't empty
            if (!params.filePaths || params.filePaths.length === 0) {
                throw new Error('File paths cannot be empty');
            }
            
            const results = [];
            const force = params.force || false;
            
            // Process each file in the batch
            for (const filePath of params.filePaths) {
                const result = await this.memoryManager.indexFile(filePath, force);
                results.push({
                    filePath,
                    success: result.success,
                    chunks: result.chunks,
                    error: result.error
                });
            }
            
            // Determine overall success
            const failedCount = results.filter(r => !r.success).length;
            
            return {
                success: failedCount === 0,
                totalProcessed: params.filePaths.length,
                successCount: params.filePaths.length - failedCount,
                failedCount,
                results
            };
        } catch (error) {
            console.error('Error batch indexing files:', error);
            return {
                success: false,
                totalProcessed: 0,
                successCount: 0,
                failedCount: 0,
                error: error.message,
                results: []
            };
        }
    }

    /**
     * Get parameter JSON schema
     */
    getParameterSchema(): Record<string, any> {
        return schema.batchIndexParams;
    }

    /**
     * Get result JSON schema
     */
    getResultSchema(): Record<string, any> {
        return schema.batchIndexResults;
    }
}