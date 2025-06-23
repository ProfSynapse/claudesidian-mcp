import { IVectorStore } from '../../interfaces/IVectorStore';
import { UsageStats, CollectionStat } from '../UsageStatsService';
import { ICollectionStatsHandler } from './interfaces';

export class CollectionStatsHandler implements ICollectionStatsHandler {
    private readonly colors = [
        '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
        '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', // Flat UI colors
        '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', // More colors
        '#8E44AD', '#16A085', '#27AE60', '#E67E22', // Additional colors
        '#2980B9', '#F1C40F', '#7D3C98', '#2C3E50', // Even more colors
        '#1E8449', '#922B21', '#1F618D', '#F4D03F', // Deep colors
        '#5499C7', '#CD6155', '#52BE80', '#F5B041', // Pastel variations
        '#6C3483', '#117A65', '#A04000', '#839192', // Dark variations
        '#85C1E9', '#EC7063', '#ABEBC6', '#FAD7A0', // Light variations
        '#BB8FCE', '#76D7C4', '#F0B27A', '#BFC9CA'  // Soft variations
    ];

    constructor(private vectorStore: IVectorStore) {}

    async updateCollectionStats(stats: UsageStats): Promise<void> {
        try {
            if (!this.isVectorStoreReady()) {
                console.log('Vector store not initialized, skipping collection stats');
                return;
            }

            const diagnostics = await this.vectorStore.getDiagnostics();
            console.log('Vector store diagnostics:', diagnostics);

            this.updateDatabaseSizes(stats, diagnostics);

            if (this.hasDiagnosticsCollections(diagnostics)) {
                this.updateStatsFromDiagnostics(stats, diagnostics);
            } else {
                await this.updateStatsManually(stats);
            }
        } catch (error) {
            console.error('Error updating collection stats:', error);
        }
    }

    private isVectorStoreReady(): boolean {
        return !!(this.vectorStore && (this.vectorStore as any).initialized);
    }

    private updateDatabaseSizes(stats: UsageStats, diagnostics: any): void {
        if (diagnostics.dbSizeMB) {
            stats.dbSizeMB = diagnostics.dbSizeMB;
        }

        if (diagnostics.memoryDbSizeMB !== undefined) {
            stats.memoryDbSizeMB = diagnostics.memoryDbSizeMB;
        }
    }

    private hasDiagnosticsCollections(diagnostics: any): boolean {
        return diagnostics.collections && diagnostics.collections.length > 0;
    }

    private updateStatsFromDiagnostics(stats: UsageStats, diagnostics: any): void {
        stats.collectionStats = [];
        let totalEmbeddings = 0;

        diagnostics.collections.forEach((collection: any, index: number) => {
            if (this.isValidCollection(collection)) {
                const collectionStat: CollectionStat = {
                    name: collection.name,
                    count: collection.itemCount,
                    color: this.colors[index % this.colors.length]
                };

                stats.collectionStats!.push(collectionStat);
                totalEmbeddings += collection.itemCount;
            }
        });

        stats.totalEmbeddings = totalEmbeddings;
        console.log('Updated stats with collection data, total embeddings:', stats.totalEmbeddings);
    }

    private async updateStatsManually(stats: UsageStats): Promise<void> {
        try {
            const collections = await this.vectorStore.listCollections();
            console.log('Found collections:', collections);

            if (!collections || collections.length === 0) {
                console.log('No collections found');
                return;
            }

            stats.collectionStats = [];
            let totalEmbeddings = 0;

            for (let i = 0; i < collections.length; i++) {
                const name = collections[i];
                try {
                    const count = await this.vectorStore.count(name);
                    const collectionStat: CollectionStat = {
                        name,
                        count,
                        color: this.colors[i % this.colors.length]
                    };

                    stats.collectionStats.push(collectionStat);
                    totalEmbeddings += count;
                } catch (countError) {
                    console.error(`Error getting count for collection ${name}:`, countError);
                }
            }

            stats.totalEmbeddings = totalEmbeddings;
            console.log('Updated stats with manual collection data, total embeddings:', stats.totalEmbeddings);
        } catch (error) {
            console.error('Error getting manual collection stats:', error);
        }
    }

    private isValidCollection(collection: any): boolean {
        return collection.name && collection.itemCount !== undefined;
    }
}