# Local Embedding Implementation Plan for Claudesidian MCP

## Overview

This document outlines a comprehensive plan to integrate local embedding capabilities into the Claudesidian MCP plugin, building upon the existing architecture while following proven patterns from Smart Connections and other successful Obsidian plugins.

## Goals

1. **Privacy-First**: Keep embeddings local, no external API dependency
2. **Performance**: Fast inference with Web Workers and optional GPU acceleration
3. **Bundle Size**: Keep plugin size reasonable (~100-150MB total)
4. **Compatibility**: Work across all platforms Obsidian supports
5. **Fallback**: Graceful fallback to OpenAI embeddings if needed

## Technical Architecture

### Core Components

1. **Local Embedding Provider** - New provider implementing `IEmbeddingProvider`
2. **Model Manager** - Handles model loading, caching, and lifecycle
3. **WASM/ONNX Runtime** - Browser-compatible ML inference
4. **Web Worker Pool** - Non-blocking embedding generation
5. **Configuration System** - User settings for local vs remote embeddings

### Model Selection: all-MiniLM-L6-v2

- **Size**: ~90MB quantized (q8)
- **Dimensions**: 384 (matches current OpenAI embedding dimensions)
- **Performance**: Excellent for general-purpose text similarity
- **Compatibility**: Proven in browser environments
- **Quality**: Good balance of size vs accuracy

## Implementation Plan

### Phase 1: Foundation Setup

#### 1.1 Directory Structure Setup
```
/static/models/all-MiniLM-L6-v2/
├── onnx/
│   ├── model_quantized_q8.onnx
│   ├── tokenizer.json
│   └── config.json
/static/wasm/
├── ort-wasm.wasm
├── ort-wasm-simd.wasm
└── ort-wasm-threaded.wasm
```

**Files to create/modify:**
- Ensure `/static/models/` and `/static/wasm/` exist (already present)
- Download and place ONNX model files
- Update `.gitignore` to handle large model files appropriately

#### 1.2 Dependencies
**Package.json additions:**
```json
{
  "@xenova/transformers": "^2.17.1",
  "onnxruntime-web": "^1.17.1"
}
```

**Files to modify:**
- `package.json` - Add dependencies
- `esbuild.config.mjs` - Configure WASM file handling

### Phase 2: Core Implementation

#### 2.1 Local Embedding Provider
**New file:** `src/database/providers/local-embedding-provider.ts`

Responsibilities:
- Implement `IEmbeddingProvider` interface
- Handle model initialization and loading
- Manage Web Worker pool
- Provide embeddings with same API as OpenAI provider

Key methods:
```typescript
class LocalEmbeddingProvider implements IEmbeddingProvider {
  async initialize(): Promise<void>
  async generateEmbedding(text: string): Promise<number[]>
  async generateEmbeddings(texts: string[]): Promise<number[][]>
  getDimensions(): number
  getTokenCount(text: string): number
}
```

#### 2.2 Model Manager
**New file:** `src/database/services/LocalModelManager.ts`

Responsibilities:
- Model loading and caching
- WASM runtime initialization
- Memory management
- Performance monitoring

Key features:
- Lazy loading (load model on first use)
- Memory cleanup
- Model warmup
- Error handling and fallbacks

#### 2.3 Web Worker Implementation
**New file:** `src/database/workers/embedding-worker.ts`

Responsibilities:
- Run Transformers.js in isolated context
- Handle batch processing
- Manage WASM memory
- Return results to main thread

**New file:** `src/database/workers/worker-pool.ts`

Responsibilities:
- Manage multiple workers
- Load balancing
- Worker lifecycle
- Error recovery

#### 2.4 Provider Factory Updates
**Modify:** `src/database/providers/embeddings-provider.ts`

Add local provider option:
```typescript
export function createEmbeddingProvider(config: EmbeddingConfig): IEmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'local':
      return new LocalEmbeddingProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

### Phase 3: Configuration and Settings

#### 3.1 Settings Updates
**Modify:** `src/components/memory-settings/EmbeddingSettingsTab.ts`

Add local embedding options:
- Provider selection (OpenAI/Local)
- Model selection dropdown
- Performance settings (workers, batch size)
- WASM backend selection (auto/cpu/gpu)

#### 3.2 Configuration Schema
**Modify:** `src/database/models/VectorStoreConfig.ts`

Add local embedding configuration:
```typescript
interface LocalEmbeddingConfig {
  provider: 'local';
  model: 'all-MiniLM-L6-v2' | 'BGE-micro-v2';
  workers: number;
  batchSize: number;
  backend: 'auto' | 'wasm' | 'webgpu';
  maxMemory: number;
}
```

#### 3.3 Migration Logic
**New file:** `src/database/utils/EmbeddingMigration.ts`

Handle migration between providers:
- Detect dimension mismatches
- Provide migration options
- Preserve existing embeddings when possible

### Phase 4: Performance Optimization

#### 4.1 Caching Strategy
**Modify:** `src/database/services/CacheManager.ts`

Add local embedding caching:
- Model file caching
- Compiled WASM caching
- Embedding result caching
- Memory-aware cache eviction

#### 4.2 Batch Processing
**New file:** `src/database/utils/BatchProcessor.ts`

Optimize for local inference:
- Smart batching based on content size
- Parallel processing across workers
- Memory usage monitoring
- Progress reporting

#### 4.3 Progressive Loading
**New file:** `src/database/utils/ProgressiveLoader.ts`

Handle large model loading:
- Show loading progress
- Chunked model loading
- Background initialization
- User feedback during setup

### Phase 5: Integration Points

#### 5.1 Service Integration
**Modify:** `src/database/services/EmbeddingService.ts`

Update to support local provider:
- Provider switching logic
- Fallback mechanisms
- Performance monitoring
- Error handling

#### 5.2 Vector Store Updates
**Modify existing vector store implementations:**
- `src/database/providers/chroma/ChromaVectorStore.ts`
- Ensure compatibility with different embedding dimensions
- Handle provider switching gracefully

#### 5.3 Agent Updates
**Modify:** `src/agents/vectorManager/vectorManager.ts`

Add local embedding management:
- Model status reporting
- Provider switching tools
- Performance metrics
- Troubleshooting capabilities

### Phase 6: Testing and Validation

#### 6.1 Unit Tests
**New files:**
- `src/database/providers/__tests__/local-embedding-provider.test.ts`
- `src/database/services/__tests__/LocalModelManager.test.ts`
- `src/database/workers/__tests__/worker-pool.test.ts`

#### 6.2 Integration Tests
**New files:**
- `src/database/__tests__/local-embedding-integration.test.ts`
- Performance benchmarks
- Memory usage tests
- Cross-platform compatibility tests

#### 6.3 Manual Testing Checklist
- Model loading on different platforms
- Embedding quality comparison
- Performance vs OpenAI
- Memory usage monitoring
- Error handling scenarios

### Phase 7: Documentation and Deployment

#### 7.1 User Documentation
**New file:** `docs/LOCAL-EMBEDDINGS.md`

Cover:
- Setup instructions
- Performance considerations
- Troubleshooting guide
- Migration from OpenAI

#### 7.2 Developer Documentation
**Update:** `CLAUDE.md`

Add local embedding development patterns:
- Provider implementation guide
- Testing strategies
- Performance optimization tips

#### 7.3 Settings Documentation
**Update UI components:**
- Tooltips for new settings
- Help text for configuration options
- Performance recommendations

## Implementation Timeline

### Week 1: Foundation
- [ ] Set up directory structure
- [ ] Add dependencies
- [ ] Create basic provider interface
- [ ] Initial model loading proof of concept

### Week 2: Core Implementation
- [ ] Complete LocalEmbeddingProvider
- [ ] Implement ModelManager
- [ ] Basic Web Worker setup
- [ ] Integration with existing architecture

### Week 3: Web Workers and Performance
- [ ] Complete worker pool implementation
- [ ] Batch processing optimization
- [ ] Memory management
- [ ] Performance monitoring

### Week 4: Configuration and UI
- [ ] Settings tab updates
- [ ] Configuration schema
- [ ] Migration utilities
- [ ] User experience polish

### Week 5: Testing and Optimization
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Cross-platform validation
- [ ] Bug fixes and refinements

### Week 6: Documentation and Release
- [ ] Complete documentation
- [ ] Final testing
- [ ] Release preparation
- [ ] Community feedback integration

## Risk Mitigation

### Technical Risks
1. **WASM compatibility issues** - Provide multiple WASM backends
2. **Memory constraints** - Implement aggressive caching and cleanup
3. **Performance degradation** - Benchmark and optimize critical paths
4. **Model loading failures** - Robust error handling and fallbacks

### User Experience Risks
1. **Large download size** - Optional model download
2. **Setup complexity** - Automated configuration
3. **Performance expectations** - Clear performance documentation
4. **Migration issues** - Comprehensive migration tools

## Success Metrics

### Performance Targets
- **Embedding speed**: <2x slower than OpenAI API for single embeddings
- **Batch processing**: >5x faster than API for large batches
- **Memory usage**: <500MB peak during processing
- **Model loading**: <30 seconds on average hardware

### Quality Targets
- **Embedding quality**: >90% correlation with OpenAI embeddings
- **Search accuracy**: Equivalent search results for typical queries
- **Stability**: <1% error rate in production usage

## Future Enhancements

### Phase 2 Features
1. **Multiple model support** - BGE variants, specialized models
2. **Custom model loading** - User-provided ONNX models
3. **GPU acceleration** - WebGPU backend optimization
4. **Model fine-tuning** - Domain-specific adaptation

### Advanced Features
1. **Hybrid embeddings** - Combine local and remote for optimal results
2. **Adaptive batching** - Dynamic batch size based on system performance
3. **Model compression** - Further size reduction techniques
4. **Incremental updates** - Model delta updates

## Conclusion

This implementation plan leverages proven techniques from successful Obsidian plugins while building on Claudesidian's robust architecture. The phased approach ensures stable progress while maintaining the plugin's existing functionality throughout development.

The local embedding capability will provide users with:
- **Privacy**: All processing happens locally
- **Performance**: Faster batch operations
- **Cost savings**: No API usage fees
- **Offline capability**: Works without internet connection

The implementation maintains backward compatibility while providing a smooth migration path for existing users.