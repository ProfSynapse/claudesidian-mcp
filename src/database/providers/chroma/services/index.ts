export { VectorCalculator } from './VectorCalculator';
export { FilterEngine, type DatabaseItem, type WhereClause } from './FilterEngine';
export { PersistenceManager, type FileSystemInterface, type PersistenceData } from './PersistenceManager';
export { CollectionRepository, type CollectionData, type ItemWithDistance } from './CollectionRepository';
// HNSW service removed - semantic search now handled through ChromaDB directly