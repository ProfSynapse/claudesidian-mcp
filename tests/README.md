# HNSW Initialization Test Suite

This comprehensive test suite isolates and debugs HNSW startup initialization issues by mocking all external dependencies and providing controlled testing scenarios.

## 🎯 Purpose

The test suite addresses the following HNSW initialization problems:
- Service creation order issues
- Null reference errors during startup
- Dependency injection failures
- ChromaDB to IndexedDB coordination problems
- Complex initialization flow debugging

## 🏗️ Architecture

### Test Components

```
tests/
├── fixtures/           # Real data fixtures from production
├── mocks/             # Mock implementations 
├── integration/       # Full integration tests
└── unit/             # Isolated service tests
```

### Key Features

- **MockIndexedDB**: In-memory IndexedDB with IDBFS simulation
- **MockVectorStore**: ChromaDB simulation with fixture data
- **MockFilesystem**: Complete filesystem operations mock
- **Real Data Fixtures**: Actual embedding vectors and metadata
- **Comprehensive Scenarios**: Fresh startup, stale indexes, error conditions

## 🚀 Quick Start

### Installation

```bash
cd tests/
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm test:watch

# Debug mode with full logging
npm test:debug

# Run specific HNSW tests
npm test:hnsw

# Test specific scenarios
npm run test:fresh    # Fresh startup scenario
npm run test:stale    # Stale indexes scenario

# Coverage report
npm run test:coverage
```

## 📊 Test Scenarios

### 1. Fresh Startup Scenario
- **Setup**: No existing IndexedDB indexes
- **ChromaDB**: Contains file_embeddings and workspaces collections
- **Expected**: Build all indexes from scratch
- **Tests**: Service creation order, coordination, successful indexing

### 2. Stale Indexes Scenario
- **Setup**: Existing IndexedDB indexes that are outdated
- **ChromaDB**: Updated collections with more recent data
- **Expected**: Detect staleness and rebuild indexes
- **Tests**: Index comparison logic, rebuild decisions

### 3. Error Recovery Scenarios
- **ChromaDB Failures**: Connection timeouts, collection access errors
- **IndexedDB Failures**: Storage quota exceeded, transaction failures
- **Coordination Failures**: Service injection timing, timeout handling
- **Tests**: Graceful degradation, error recovery

## 🔧 Debugging Tools

### Debug HNSW Initialization

```typescript
import { debugHnswInitialization } from './integration/HnswStartupFlow.test';

// Debug fresh startup
await debugHnswInitialization('fresh_startup');

// Debug stale index handling
await debugHnswInitialization('stale_indexes');
```

### Test Environment

```typescript
import { HnswTestEnvironment } from './integration/HnswStartupFlow.test';

const testEnv = new HnswTestEnvironment();
testEnv.setupEnvironment('fresh_startup');

const service = testEnv.createHnswSearchService();
const debugInfo = testEnv.getDebugInfo();
```

## 📋 Test Coverage

### Core Areas Tested

1. **Service Creation Order**
   - ✅ Lightweight services before WASM library
   - ✅ Dependencies before dependents
   - ✅ Coordination services injection timing

2. **Initialization Flow**
   - ✅ Basic initialization with coordination
   - ✅ Full initialization with collection processing
   - ✅ ChromaDB to IndexedDB comparison logic

3. **Error Handling**
   - ✅ Null reference prevention
   - ✅ Service creation failures
   - ✅ External dependency failures
   - ✅ Timeout and coordination issues

4. **Data Processing**
   - ✅ ChromaDB collection loading
   - ✅ IndexedDB persistence operations
   - ✅ Index staleness detection
   - ✅ Rebuild decision logic

## 🧪 Fixture Data

### Real Production Data
- **file_embeddings.json**: 5 documents with 32-dim embeddings
- **workspaces.json**: 3 workspace entries with metadata
- **Scenarios**: Fresh startup, stale indexes, partial data

### Mock Capabilities
- **IndexedDB**: Full CRUD operations, IDBFS simulation, failure injection
- **VectorStore**: Complete IVectorStore implementation, ChromaDB simulation
- **Filesystem**: All Node.js fs operations, directory structures, error simulation

## 📈 Running Specific Tests

### Test Individual Components

```bash
# Test service creation order
npx jest -t "should initialize services without null reference errors"

# Test coordination logic
npx jest -t "should complete basic initialization with proper service creation order"

# Test ChromaDB integration
npx jest -t "should process ChromaDB collections and build indexes"

# Test error recovery
npx jest -t "should handle ChromaDB connection failures gracefully"
```

### Debug Specific Issues

```bash
# Debug with full logging
DEBUG_TESTS=1 npm test

# Debug service creation order
DEBUG_TESTS=1 npx jest -t "service creation order"

# Debug coordination issues
DEBUG_TESTS=1 npx jest -t "coordination"
```

## 🎯 Expected Outcomes

Running this test suite will help you:

1. **Identify Root Cause**: Pinpoint exact location of null reference errors
2. **Verify Service Order**: Ensure proper dependency injection sequence
3. **Test Coordination**: Validate coordination service integration
4. **Debug Data Flow**: Trace ChromaDB → IndexedDB data processing
5. **Test Error Recovery**: Ensure graceful handling of failure conditions

## 🔍 Interpreting Results

### Successful Test Output
```
[TEST] StateManager.ensureInitialized called for: hnsw_basic_init
[TEST] CollectionCoordinator.waitForCollections called
✓ should initialize services without null reference errors
✓ should complete basic initialization with proper service creation order
✓ should process ChromaDB collections and build indexes
```

### Debug Information
Each test provides comprehensive debug information including:
- All mock operation histories (VectorStore, IndexedDB, Filesystem)
- Service creation timeline
- Coordination service interactions
- Error conditions and recovery paths

This test suite provides a complete isolated environment to debug and resolve your HNSW initialization issues systematically.