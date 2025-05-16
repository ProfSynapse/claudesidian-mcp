import { DEFAULT_GRAPH_BOOST_FACTOR, DEFAULT_GRAPH_MAX_DISTANCE } from './constants';
import { LinkUtils } from './LinkUtils';

// Types needed for graph operations
interface EmbeddingRecord {
    id: string;
    filePath: string;
    content: string;
    metadata: {
        links?: {
            outgoing: Array<{
                displayText: string;
                targetPath: string;
            }>;
            incoming: Array<{
                sourcePath: string;
                displayText: string;
            }>;
        };
        [key: string]: any;
    };
}

interface GraphOptions {
    useGraphBoost: boolean;
    boostFactor?: number;
    includeNeighbors?: boolean;
    maxDistance?: number;
    seedNotes?: string[];
}

/**
 * Handles graph-based operations for relevance boosting
 */
export class GraphOperations {
    private linkUtils: LinkUtils;
    
    constructor() {
        this.linkUtils = new LinkUtils();
    }
    
    /**
     * Apply graph-based boost to search results
     * Increases scores for records that are connected to high-scoring records
     * 
     * @param records Records with similarity scores
     * @param graphOptions Graph boosting options
     */
    applyGraphBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>,
        graphOptions: GraphOptions
    ): Array<{ record: EmbeddingRecord; similarity: number }> {
        const boostFactor = graphOptions.boostFactor || DEFAULT_GRAPH_BOOST_FACTOR;
        const maxDistance = graphOptions.maxDistance || DEFAULT_GRAPH_MAX_DISTANCE;
        const seedNotes = graphOptions.seedNotes || [];
        
        // If no records, return as-is
        if (!records.length) {
            return records;
        }
        
        // If not using graph boost, return as-is
        if (!graphOptions.useGraphBoost) {
            return records;
        }
        
        // Create a graph of connections
        const graph = this.buildConnectionGraph(records);
        
        // Apply boost to seed notes if specified
        let resultEmbeddings = records;
        if (seedNotes.length > 0) {
            resultEmbeddings = this.applySeedBoost(resultEmbeddings, seedNotes);
        }
        
        // Apply multi-level graph boosting
        // Start with initial scores
        let currentScores = new Map<string, number>();
        resultEmbeddings.forEach(item => {
            currentScores.set(item.record.filePath, item.similarity);
        });
        
        // Apply boost for each level of depth up to maxDistance
        for (let distance = 1; distance <= maxDistance; distance++) {
            const nextScores = new Map<string, number>();
            
            // Start with current scores
            for (const [filePath, score] of currentScores.entries()) {
                nextScores.set(filePath, score);
            }
            
            // Apply boost for this distance level
            for (const [filePath, score] of currentScores.entries()) {
                const connections = graph.get(filePath) || new Set<string>();
                const levelBoostFactor = boostFactor / distance; // Reduce boost for higher distances
                
                connections.forEach(connectedPath => {
                    // Only boost if the connected path is in our results
                    if (currentScores.has(connectedPath)) {
                        const currentScore = nextScores.get(connectedPath) || 0;
                        // Add a boost proportional to this file's score
                        const boost = score * levelBoostFactor;
                        nextScores.set(connectedPath, currentScore + boost);
                    }
                });
            }
            
            // Update current scores for next iteration
            currentScores = nextScores;
        }
        
        // Apply final boosted scores
        return resultEmbeddings.map(item => ({
            record: item.record,
            similarity: currentScores.get(item.record.filePath) || item.similarity
        }));
    }
    
    /**
     * Apply seed note boosting to search results
     * @param records Records with similarity scores
     * @param seedNotes Array of seed note paths
     */
    applySeedBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>,
        seedNotes: string[]
    ): Array<{ record: EmbeddingRecord; similarity: number }> {
        // If no seed notes, return as-is
        if (!seedNotes.length) {
            return records;
        }
        
        // Create a set of seed note paths for quick lookup
        const seedNoteSet = new Set(seedNotes);
        
        // Create a map of file paths to base name (without extension) for fuzzy matching
        const fileBaseNames = new Map<string, string>();
        records.forEach(item => {
            const baseName = item.record.filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            fileBaseNames.set(item.record.filePath, baseName.toLowerCase());
        });
        
        // Create a set of normalized seed note names for fuzzy matching
        const normalizedSeedNames = new Set<string>();
        seedNotes.forEach(path => {
            const baseName = path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            normalizedSeedNames.add(baseName.toLowerCase());
        });
        
        // Apply boost to seed notes and their connections
        return records.map(item => {
            let boostFactor = 1.0; // No boost by default
            
            // Direct exact match with seed note
            if (seedNoteSet.has(item.record.filePath)) {
                boostFactor = 1.5; // 50% boost for direct seed note match
            } 
            // Fuzzy match with seed note name
            else if (normalizedSeedNames.has(fileBaseNames.get(item.record.filePath) || '')) {
                boostFactor = 1.3; // 30% boost for fuzzy seed note match
            }
            
            return {
                record: item.record,
                similarity: item.similarity * boostFactor
            };
        });
    }
    
    /**
     * Build a graph of connections between documents
     * @param records Records with similarity scores
     * @returns Map of file paths to sets of connected file paths
     */
    private buildConnectionGraph(
        records: Array<{ record: EmbeddingRecord; similarity: number }>
    ): Map<string, Set<string>> {
        // Create a graph of connections
        const graph = new Map<string, Set<string>>();
        
        // Create a map of normalized link text to file paths
        // This helps with resolving unresolved links
        const normalizedLinkMap = new Map<string, string[]>();
        const fullPathMap = new Map<string, string>(); // Map from filename to full path
        
        // First pass: build normalized link map
        records.forEach(item => {
            const filePath = item.record.filePath;
            const fileName = filePath.split('/').pop() || '';
            const baseName = fileName.replace(/\.[^/.]+$/, '');
            
            // Store multiple ways to reference this file
            this.linkUtils.addToLinkMap(normalizedLinkMap, baseName, filePath);
            this.linkUtils.addToLinkMap(normalizedLinkMap, fileName, filePath);
            
            // Also store the path components
            const pathParts = filePath.split('/');
            if (pathParts.length > 1) {
                // Store combinations of folder+filename
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const folderName = pathParts[i];
                    this.linkUtils.addToLinkMap(normalizedLinkMap, `${folderName}_${baseName}`, filePath);
                    this.linkUtils.addToLinkMap(normalizedLinkMap, `${folderName}/${baseName}`, filePath);
                }
            }
            
            // Store mapping from filename to full path for exact matches
            fullPathMap.set(baseName.toLowerCase(), filePath);
            fullPathMap.set(fileName.toLowerCase(), filePath);
        });
        
        // Second pass: create graph connections
        records.forEach(item => {
            const filePath = item.record.filePath;
            const connections = new Set<string>();
            
            // Skip items without links metadata
            if (!item.record.metadata.links) {
                graph.set(filePath, connections);
                return;
            }
            
            // Add outgoing links
            item.record.metadata.links.outgoing.forEach(link => {
                if (link.targetPath.startsWith('unresolved:')) {
                    // Try to match unresolved link to a file
                    const unresolvedText = link.targetPath.replace('unresolved:', '');
                    
                    // Try exact match first
                    const exactPath = fullPathMap.get(unresolvedText.toLowerCase());
                    if (exactPath) {
                        connections.add(exactPath);
                        return;
                    }
                    
                    // Try all normalizations
                    const normalizedVariants = this.linkUtils.getNormalizedVariants(unresolvedText);
                    
                    for (const normalizedVariant of normalizedVariants) {
                        const possibleMatches = normalizedLinkMap.get(normalizedVariant) || [];
                        possibleMatches.forEach(match => {
                            connections.add(match);
                        });
                    }
                    
                    // If still no matches, try fuzzy matching
                    if (connections.size === 0) {
                        this.linkUtils.findFuzzyMatches(normalizedLinkMap, unresolvedText).forEach(match => {
                            connections.add(match);
                        });
                    }
                } else {
                    connections.add(link.targetPath);
                }
            });
            
            // Add incoming links
            item.record.metadata.links.incoming.forEach(link => {
                connections.add(link.sourcePath);
            });
            
            graph.set(filePath, connections);
        });
        
        return graph;
    }
}