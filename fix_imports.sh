#!/bin/bash

# Script to fix all broken import paths after Phase 2 reorganization

cd "/mnt/c/Users/jrose/Documents/Plugin Tester/.obsidian/plugins/claudesidian-mcp"

echo "Fixing MemoryService and WorkspaceService imports..."

# Fix MemoryService imports - need to find the correct relative path for each location
# From agents/memoryManager/ directory: use ./services/MemoryService
find src/agents/memoryManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "./services/MemoryService";|g' {} \;

# From other agent directories: use ../memoryManager/services/MemoryService
find src/agents/contentManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../memoryManager/services/MemoryService";|g' {} \;
find src/agents/vaultLibrarian -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../memoryManager/services/MemoryService";|g' {} \;
find src/agents/vaultManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../memoryManager/services/MemoryService";|g' {} \;
find src/agents/commandManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../memoryManager/services/MemoryService";|g' {} \;

# From components/ directory
find src/components -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../agents/memoryManager/services/MemoryService";|g' {} \;

# From core/ directory  
find src/core -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../agents/memoryManager/services/MemoryService";|g' {} \;

# From services/ directory
find src/services -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../agents/memoryManager/services/MemoryService";|g' {} \;

# From utils/ directory
find src/utils -name "*.ts" -type f -exec sed -i 's|from.*database/services/MemoryService.*|from "../agents/memoryManager/services/MemoryService";|g' {} \;

# Fix WorkspaceService imports - same pattern
find src/agents/memoryManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "./services/WorkspaceService";|g' {} \;

# From other agent directories
find src/agents/contentManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../memoryManager/services/WorkspaceService";|g' {} \;
find src/agents/vaultLibrarian -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../memoryManager/services/WorkspaceService";|g' {} \;
find src/agents/vaultManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../memoryManager/services/WorkspaceService";|g' {} \;
find src/agents/commandManager -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../memoryManager/services/WorkspaceService";|g' {} \;

# From components/ directory
find src/components -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../agents/memoryManager/services/WorkspaceService";|g' {} \;

# From core/ directory
find src/core -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../agents/memoryManager/services/WorkspaceService";|g' {} \;

# From services/ directory
find src/services -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../agents/memoryManager/services/WorkspaceService";|g' {} \;

# From utils/ directory
find src/utils -name "*.ts" -type f -exec sed -i 's|from.*database/services/WorkspaceService.*|from "../agents/memoryManager/services/WorkspaceService";|g' {} \;

# Fix EmbeddingService imports to new location
find src -name "*.ts" -type f -exec sed -i 's|from.*database/services/EmbeddingService.*|from "../../database/services/core/EmbeddingService";|g' {} \;

# Fix CustomPromptStorageService imports
find src -name "*.ts" -type f -exec sed -i 's|from.*database/services/CustomPromptStorageService.*|from "../../agents/agentManager/services/CustomPromptStorageService";|g' {} \;

# Fix CollectionLifecycleManager imports (now part of CollectionService)
find src -name "*.ts" -type f -exec sed -i 's|from.*database/services/CollectionLifecycleManager.*|from "../../database/services/core/CollectionService";|g' {} \;

# Fix DirectCollectionService imports (now part of CollectionService) 
find src -name "*.ts" -type f -exec sed -i 's|from.*database/services/DirectCollectionService.*|from "../../database/services/core/CollectionService";|g' {} \;

# Fix any remaining incorrect paths from our first attempt
find src -name "*.ts" -type f -exec sed -i 's|from "../agents/memoryManager/services/MemoryService"|from "./services/MemoryService"|g' {} \;

echo "Import fixes complete!"