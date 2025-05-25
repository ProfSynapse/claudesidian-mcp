# Vector Search Data Flow Analysis

## Complete Flow Summary

### 1. **MCP Request Entry Point**
- Request comes in at `handleToolExecution` in `requestHandlers.ts`
- Tool name: `vaultLibrarian`, mode: `vector`
- Parameters validated and enhanced with sessionId

### 2. **VaultLibrarian Agent**
- Located at `src/agents/vaultLibrarian/vaultLibrarian.ts`
- Registers `VectorMode` for handling vector searches
- Has references to:
  - `memoryService`
  - `searchService` (ChromaSearchService)
  - `embeddingService`

### 3. **VectorMode Execution**
- Located at `src/agents/vaultLibrarian/modes/vectorMode.ts`
- Accepts parameters:
  - `query` (text) or `embedding` (vector)
  - `collectionName` (optional)
  - `threshold` (default: 0.7)
  - `limit` (default: 10)

### 4. **ChromaSearchService**
- Two main search paths:
  1. `semanticSearch` - generates embedding from query text
  2. `semanticSearchWithEmbedding` - uses provided embedding

- Collections used:
  - Default: `file_embeddings` collection (from FileEmbeddingCollection)
  - Can specify custom collection with `collectionName` parameter

### 5. **ChromaDB Distance Calculation**
- Uses **cosine distance** (configured with `'hnsw:space': 'cosine'`)
- Distance formula: `distance = 1 - cosine_similarity`
- Distance range: 0 (identical) to 2 (opposite)
- Similarity conversion: `similarity = 1 - distance`

## Key Issues Found

### 1. **Distance/Similarity Confusion**
The code has commented-out threshold checks:
```typescript
// TEMPORARILY DISABLED: Skip if below threshold
// if (options?.threshold !== undefined && similarity < options.threshold) {
//   console.log(`Skipping result with similarity ${similarity} below threshold ${options.threshold}`);
//   continue;
// }
console.log(`INCLUDING result with similarity ${similarity} (threshold check disabled for debugging)`);
```

### 2. **Collection Mismatch Possibility**
- Default collection is `file_embeddings`
- Memory traces are in `memory_traces` collection
- If wrong collection is queried, embeddings won't match

### 3. **Embedding Dimension Mismatch**
- OpenAI embeddings: 1536 dimensions
- Local ONNX model: Different dimensions
- Mismatch would cause poor similarity scores

### 4. **Cosine Similarity Range**
- Cosine similarity: -1 to 1
- Distance: 0 to 2
- Low threshold (0.01) suggests embeddings are nearly orthogonal

## Diagnostic Steps

1. **Check which collection is being queried**
   - Log the actual collection name in ChromaSearchService
   - Verify embeddings exist in that collection

2. **Verify embedding dimensions**
   - Log embedding length when generated
   - Log embedding length when queried
   - Ensure they match

3. **Check embedding generation**
   - Verify same model/method used for indexing and querying
   - Check if embeddings are normalized

4. **Raw distance analysis**
   - Log raw ChromaDB distances before conversion
   - Check if distances are consistently high (~1.0)

## Recommendations

1. **Re-enable threshold filtering** after fixing the root cause
2. **Add collection validation** to ensure correct collection is queried
3. **Add embedding dimension validation**
4. **Consider using L2 distance** if embeddings aren't normalized
5. **Add diagnostic endpoint** to check collection contents and stats