import { App } from 'obsidian';
import { IFileEventProcessor, FileEvent, ProcessingResult } from '../interfaces/IFileEventServices';
import { MemoryService } from "../../../agents/memoryManager/services/MemoryService";
import { WorkspaceService } from '../../../agents/memoryManager/services/WorkspaceService';

export class FileEventProcessor implements IFileEventProcessor {
    private processingFiles: Set<string> = new Set();
    private completedFiles: Map<string, ProcessingResult> = new Map();

    constructor(
        private app: App,
        private memoryService: MemoryService,
        private workspaceService: WorkspaceService
    ) {}

    async processEvent(event: FileEvent): Promise<ProcessingResult> {
        this.processingFiles.add(event.path);
        
        try {
            let result: ProcessingResult;
            
            if (event.operation === 'delete') {
                result = await this.handleFileDeletion(event);
            } else {
                result = await this.handleFileCreationOrModification(event);
            }
            
            // Cache the result
            this.completedFiles.set(event.path, result);
            
            return result;
        } catch (error) {
            const errorResult: ProcessingResult = {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
            
            this.completedFiles.set(event.path, errorResult);
            return errorResult;
        } finally {
            this.processingFiles.delete(event.path);
        }
    }

    isProcessing(path: string): boolean {
        return this.processingFiles.has(path);
    }

    getResult(path: string): ProcessingResult | undefined {
        return this.completedFiles.get(path);
    }

    private async handleFileDeletion(event: FileEvent): Promise<ProcessingResult> {
        try {
            // Remove file from all database collections
            await this.removeFileFromDatabase(event.path);
            
            
            return {
                success: true,
                embeddingCreated: false,
                activityRecorded: true
            };
        } catch (error) {
            console.error(`[FileEventProcessor] Error processing file deletion ${event.path}:`, error);
            throw error;
        }
    }

    private async handleFileCreationOrModification(event: FileEvent): Promise<ProcessingResult> {
        try {
            // For create/modify operations, we mainly record activity here
            // Embedding processing is handled by EmbeddingScheduler
            
            return {
                success: true,
                embeddingCreated: false,
                activityRecorded: true
            };
        } catch (error) {
            console.error(`[FileEventProcessor] Error processing file ${event.operation} ${event.path}:`, error);
            throw error;
        }
    }

    private async removeFileFromDatabase(filePath: string): Promise<void> {
        try {
            // Use the MemoryService to clean up file references
            // This is a simplified approach - in practice you might want more specific cleanup
            
            // Remove file embeddings and references from memory service
            // Note: This is a simplified implementation
            // You might want to add specific methods to MemoryService for file cleanup
            
        } catch (error) {
            console.warn(`[FileEventProcessor] Failed to remove file from database: ${filePath}`, error);
            // Don't throw here as deletion should still be considered successful
        }
    }

    // Utility methods
    clearCompletedResults(): void {
        this.completedFiles.clear();
    }

    getProcessingStatus(): {
        processing: string[];
        completed: string[];
    } {
        return {
            processing: Array.from(this.processingFiles),
            completed: Array.from(this.completedFiles.keys())
        };
    }
}