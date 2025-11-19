/**
 * Memory Management Services - Simplified Implementation
 * 
 * Provides basic memory monitoring with hardcoded balanced approach.
 * No user configuration needed - uses optimal settings by default.
 */

import { SimpleMemoryMonitor } from './SimpleMemoryMonitor';
import { TraceMetadataBuilder, buildTraceMetadata } from './TraceMetadataBuilder';

export { SimpleMemoryMonitor, TraceMetadataBuilder, buildTraceMetadata };

// Create singleton instance for easy access
export const memoryMonitor = SimpleMemoryMonitor.getInstance();
