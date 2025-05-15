import { App, TFile, Events } from 'obsidian';
import { VectorStore } from '../db/memory-db';
import { BaseEmbeddingProvider } from '../providers/embeddings-provider';
import { ChunkingOptions, chunkMarkdownText } from './text-chunker';
import { EmbeddingRecord, MemorySettings, MemoryUsageStats } from '../../../types';
import { DatabaseOperations } from './DatabaseOperations';
import { FilePathOperations } from './FilePathOperations';
import { UsageStatsOperations } from './UsageStatsOperations';

/**
 * Utility class for indexing operations related to memory management
 * Centralizes logic for handling file indexing, batch indexing, etc.
 */
export class IndexingOperations {
    /**
     * Index a single file from the vault
     * 
     * @param app Obsidian app instance
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param filePath Path to the file to index
     * @param settings Memory settings
     * @param usageStats Usage statistics to update
     * @param force Whether to force re-indexing even if the file hasn't changed
     * @returns Result object with success flag, chunks count, and error message if any
     */
    static async indexFile(
        app: App,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        filePath: string,
        settings: MemorySettings,
        usageStats: MemoryUsageStats,
        force: boolean = false
    ): Promise<{
        success: boolean;
        chunks?: number;
        error?: string;
        filePath: string;
    }> {
        if (!settings.enabled || !db || !provider) {
            return { 
                success: false, 
                error: 'Memory Manager is not enabled or initialized',
                filePath
            };
        }
        
        try {
            // Skip if file is excluded
            if (FilePathOperations.isFileExcluded(filePath, settings.excludePaths, settings.includePaths)) {
                return { 
                    success: false, 
                    error: 'File is excluded by settings',
                    filePath
                };
            }
            
            // Get the file
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                return { 
                    success: false, 
                    error: 'File not found',
                    filePath
                };
            }
            
            // Skip if not a markdown file
            if (!FilePathOperations.isMarkdownFile(file)) {
                return { 
                    success: false, 
                    error: 'Only markdown files can be indexed',
                    filePath
                };
            }
            
            // Check if we've already indexed this file and it hasn't changed
            if (!force) {
                const shouldReindex = await DatabaseOperations.shouldReindexFile(db, filePath, file);
                if (!shouldReindex) {
                    const existingEmbeddings = await db.getEmbeddingsForFile(filePath);
                    return { 
                        success: true, 
                        chunks: existingEmbeddings.length,
                        error: 'File already indexed and not modified',
                        filePath
                    };
                }
            }
            
            // Read the file content
            const content = await app.vault.read(file);
            
            // Delete existing embeddings for this file
            await DatabaseOperations.deleteEmbeddingsForFile(db, filePath);
            
            // Create chunking options
            const chunkingOptions: ChunkingOptions = {
                strategy: settings.chunkStrategy,
                maxTokens: settings.chunkSize,
                overlap: settings.chunkOverlap,
                includeFrontmatter: settings.includeFrontmatter,
                minLength: settings.minContentLength
            };
            
            // Chunk the content
            const chunks = chunkMarkdownText(content, chunkingOptions);
            
            // Skip if no chunks were created
            if (chunks.length === 0) {
                return { 
                    success: false, 
                    error: 'No valid chunks created from file',
                    filePath
                };
            }
            
            // Track total tokens
            let totalTokens = 0;
            
            // Create embeddings for each chunk
            const embeddings: EmbeddingRecord[] = [];
            for (const chunk of chunks) {
                try {
                    // Get token count for this chunk
                    const tokenCount = provider.getTokenCount(chunk.content);
                    totalTokens += tokenCount;
                    
                    // Skip if too large
                    if (tokenCount > 8100) { // Slightly below the 8191 token limit
                        console.warn(`Skipping chunk with ${tokenCount} tokens (exceeds limit)`);
                        continue;
                    }
                    
                    // Generate embedding
                    const embedding = await provider.getEmbedding(chunk.content);
                    
                    // Create record
                    const now = Date.now();
                    const record: EmbeddingRecord = {
                        id: `${filePath}-${chunk.startLine}-${chunk.endLine}`,
                        filePath: filePath,
                        lineStart: chunk.startLine,
                        lineEnd: chunk.endLine,
                        content: chunk.content,
                        embedding: embedding,
                        createdAt: now,
                        updatedAt: now,
                        metadata: {
                            frontmatter: chunk.frontmatter || {},
                            tags: chunk.tags || [],
                            createdDate: file.stat.ctime.toString(),
                            modifiedDate: file.stat.mtime.toString(),
                            links: {
                                outgoing: [], // Would be populated with link data
                                incoming: []  // Would be populated with backlinks
                            }
                        }
                    };
                    
                    embeddings.push(record);
                } catch (error) {
                    console.error(`Error embedding chunk from ${filePath}:`, error);
                    // Continue with other chunks
                }
            }
            
            // Add embeddings to database
            await DatabaseOperations.addEmbeddings(db, embeddings);
            
            // Update usage stats
            UsageStatsOperations.updateTokenUsage(usageStats, totalTokens);
            
            // Update last indexed time
            UsageStatsOperations.updateLastIndexedTime(usageStats);
            
            return { 
                success: true, 
                chunks: embeddings.length,
                filePath
            };
        } catch (error: any) {
            console.error(`Error indexing file ${filePath}:`, error);
            return { 
                success: false, 
                error: error.message,
                filePath
            };
        }
    }
    
    /**
     * Reindex all files in the vault
     * 
     * @param app Obsidian app instance
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param settings Memory settings
     * @param usageStats Usage statistics to update
     * @param events Events manager for progress reporting
     * @returns Result object with success flag, processed count, failed count, and error message if any
     */
    static async reindexAll(
        app: App,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        settings: MemorySettings,
        usageStats: MemoryUsageStats,
        events: Events
    ): Promise<{
        success: boolean;
        processed: number;
        failed: number;
        error?: string;
    }> {
        if (!settings.enabled || !db || !provider) {
            return {
                success: false,
                processed: 0,
                failed: 0,
                error: 'Memory Manager is not enabled or initialized'
            };
        }
        
        // Set indexing flag
        UsageStatsOperations.setIndexingInProgress(usageStats, true);
        
        try {
            // First, clean up orphaned embeddings
            await DatabaseOperations.cleanOrphanedEmbeddings(app, db, usageStats);
            
            // Get all markdown files that match the inclusion/exclusion criteria
            const files = FilePathOperations.getEligibleMarkdownFiles(
                app,
                settings.includePaths,
                settings.excludePaths
            );
            
            let processed = 0;
            let failed = 0;
            
            // Process files in batches
            for (let i = 0; i < files.length; i += settings.batchSize) {
                const batch = files.slice(i, i + settings.batchSize);
                
                // Create promises for each file in the batch
                const promises = batch.map(async (file: TFile) => {
                    try {
                        const result = await IndexingOperations.indexFile(
                            app,
                            db,
                            provider,
                            file.path,
                            settings,
                            usageStats,
                            true // Force reindex
                        );
                        
                        if (result.success) {
                            processed++;
                        } else {
                            failed++;
                        }
                    } catch (error) {
                        console.error(`Error indexing ${file.path}:`, error);
                        failed++;
                    }
                });
                
                // Wait for batch to complete
                await Promise.all(promises);
                
                // Emit progress event
                events.trigger('memory-indexing-progress', {
                    total: files.length,
                    processed: processed + failed,
                    remaining: files.length - (processed + failed)
                });
            }
            
            // Update last indexed time
            UsageStatsOperations.updateLastIndexedTime(usageStats);
            
            // Get updated stats
            await DatabaseOperations.updateDatabaseStats(db, usageStats);
            
            return {
                success: true,
                processed,
                failed
            };
        } catch (error: any) {
            console.error('Error reindexing all files:', error);
            return {
                success: false,
                processed: 0,
                failed: 0,
                error: error.message
            };
        } finally {
            // Clear indexing flag
            UsageStatsOperations.setIndexingInProgress(usageStats, false);
        }
    }
}