#!/bin/bash

# Script to fix syntax errors in import statements

cd "/mnt/c/Users/jrose/Documents/Plugin Tester/.obsidian/plugins/claudesidian-mcp"

echo "Fixing syntax errors in import statements..."

# Fix double quotes and extra quotes in import statements
find src -name "*.ts" -type f -exec sed -i 's|from "./services/MemoryService"'"'"'|from "./services/MemoryService"|g' {} \;
find src -name "*.ts" -type f -exec sed -i 's|from "./services/WorkspaceService"'"'"'|from "./services/WorkspaceService"|g' {} \;

# Fix any remaining malformed quotes
find src -name "*.ts" -type f -exec sed -i 's|from "\([^"]*\)"'"'"'|from "\1"|g' {} \;

# Fix incorrect relative paths that got created
find src -name "*.ts" -type f -exec sed -i 's|from "./services/MemoryService"|from "../../agents/memoryManager/services/MemoryService"|g' {} \;
find src -name "*.ts" -type f -exec sed -i 's|from "./services/WorkspaceService"|from "../../agents/memoryManager/services/WorkspaceService"|g' {} \;

# Fix paths specifically within memoryManager directory
find src/agents/memoryManager -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/MemoryService"|from "./services/MemoryService"|g' {} \;
find src/agents/memoryManager -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/WorkspaceService"|from "./services/WorkspaceService"|g' {} \;

# Fix specific broken references in the problematic files seen in system messages
find src/agents/memoryManager/services -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/MemoryService"|from "./MemoryService"|g' {} \;
find src/agents/memoryManager/services -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/WorkspaceService"|from "./WorkspaceService"|g' {} \;

# Fix paths in memoryManager subdirectories
find src/agents/memoryManager/modes -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/MemoryService"|from "../../services/MemoryService"|g' {} \;
find src/agents/memoryManager/modes -name "*.ts" -type f -exec sed -i 's|from "../../agents/memoryManager/services/WorkspaceService"|from "../../services/WorkspaceService"|g' {} \;

echo "Syntax error fixes complete!"