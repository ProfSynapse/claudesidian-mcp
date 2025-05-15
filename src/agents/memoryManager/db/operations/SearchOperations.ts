import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../../types';
import { IEmbeddingStore, ISearchOperations, IGraphOperations, IVectorMath } from '../interfaces';
import { DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_SEARCH_LIMIT } from '../constants';
import { VectorMath } from '../utils/VectorMath';
import { GraphOperations } from './GraphOperations';

/**
 * Handles vector search operations
 */
export class SearchOperations implements ISearchOperations {
    private vectorMath: IVectorMath;
    private graphOps: IGraphOperations;
    
    /**
     * Create a new SearchOperations instance
     * @param embeddingStore The embedding store for retrieving embeddings
     * @param vectorMath Optional vector math utilities
     * @param graphOps Optional graph operations
     */
    constructor(
        private embeddingStore: IEmbeddingStore,
        vectorMath?: IVectorMath,
        graphOps?: IGraphOperations
    ) {
        this.vectorMath = vectorMath || new VectorMath();
        this.graphOps = graphOps || new GraphOperations();
    }
    
    /**
     * Find records similar to the given embedding
     * @param queryEmbedding Query embedding to compare against
     * @param params Query parameters
     */
    async findSimilar(
        queryEmbedding: number[],
        params: MemoryQueryParams
    ): Promise<MemoryQueryResult> {
        try {
            // Apply default values
            const limit = params.limit || DEFAULT_SEARCH_LIMIT;
            const threshold = params.threshold || DEFAULT_SIMILARITY_THRESHOLD;
            
            // Get all embeddings
            const allEmbeddings = await this.embeddingStore.getAllEmbeddings();
            
            // Filter out embeddings based on filters
            let filteredEmbeddings = allEmbeddings;
            
            // Calculate similarity scores
            const scoredEmbeddings = filteredEmbeddings.map(record => ({
                record,
                similarity: this.vectorMath.cosineSimilarity(queryEmbedding, record.embedding)
            }));
            
            // Filter by threshold
            let resultEmbeddings = scoredEmbeddings.filter(item => 
                item.similarity >= threshold
            );
            
            // Apply graph boost if enabled
            if (params.graphOptions && params.graphOptions.useGraphBoost) {
                resultEmbeddings = this.graphOps.applyGraphBoost(resultEmbeddings, params.graphOptions);
            }
            
            // Sort by similarity (highest first)
            resultEmbeddings.sort((a, b) => b.similarity - a.similarity);
            
            // Limit results
            resultEmbeddings = resultEmbeddings.slice(0, limit);
            
            // Format results
            return {
                matches: resultEmbeddings.map(item => ({
                    similarity: item.similarity,
                    content: item.record.content,
                    filePath: item.record.filePath,
                    lineStart: item.record.lineStart,
                    lineEnd: item.record.lineEnd,
                    metadata: item.record.metadata
                }))
            };
        } catch (error: any) {
            console.error('Failed to find similar embeddings:', error);
            throw new Error(`Failed to find similar embeddings: ${error.message}`);
        }
    }
}