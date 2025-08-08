/**
 * BatchContentMode - Refactored for backward compatibility
 * Re-exports the refactored BatchContentMode to maintain API compatibility
 */

import { App } from 'obsidian';
import { MemoryService } from "../memoryManager/services/MemoryService";

// Export the refactored BatchContentMode as the main BatchContentMode
export { BatchContentMode } from './batch/BatchContentMode';

// Keep original file as reference
// Original implementation moved to ./batch/ directory following SOLID principles
// The refactored version maintains full backward compatibility
// Original implementation moved to ./batch/ directory
// The refactored version provides the same functionality with better architecture
// All implementation moved to specialized services in ./batch/ directory
// This maintains backward compatibility while providing better architecture