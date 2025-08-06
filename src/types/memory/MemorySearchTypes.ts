/**
 * Memory Search Types
 * 
 * Location: src/types/memory/MemorySearchTypes.ts
 * Purpose: Consolidated type definitions for memory search operations
 * Used by: MemorySearchProcessor, MemorySearchFilters, ResultFormatter, SearchMemoryMode
 */

import { CommonParameters } from '../mcp/AgentTypes';

// Core search parameters interface
export interface MemorySearchParameters extends CommonParameters {
  query: string;
  memoryTypes?: ('traces' | 'toolCalls' | 'sessions' | 'states' | 'workspaces')[];
  workspace?: string;
  dateRange?: DateRange;
  limit?: number;
  toolCallFilters?: ToolCallFilter;
  searchMethod?: 'semantic' | 'exact' | 'mixed';
  filterBySession?: boolean;
}

// Date range filter
export interface DateRange {
  start?: string;
  end?: string;
}

// Tool call specific filters
export interface ToolCallFilter {
  agent?: string;
  mode?: string;
  success?: boolean;
  minExecutionTime?: number;
  maxExecutionTime?: number;
}

// Search execution options for processor
export interface MemorySearchExecutionOptions {
  workspaceId?: string;
  sessionId?: string;
  limit?: number;
  toolCallFilters?: ToolCallFilter;
}

// Memory search context
export interface MemorySearchContext {
  params: MemorySearchParameters;
  timestamp: Date;
}

// Raw memory result from searches
export interface RawMemoryResult {
  trace: any; // MemoryTrace or ToolCallMemoryTrace
  similarity?: number;
}

// Processed memory search result
export interface MemorySearchResult {
  type: 'trace' | 'toolCall' | 'session' | 'state' | 'workspace';
  id: string;
  highlight: string;
  metadata: MemoryResultMetadata;
  context: SearchResultContext;
  score: number;
}

// Memory result metadata
export interface MemoryResultMetadata {
  created: string;
  updated?: string;
  sessionId?: string;
  workspaceId?: string;
  primaryGoal?: string;
  filesReferenced?: string[];
  activityType?: string;
  toolUsed?: string;
  modeUsed?: string;
  // Tool call specific metadata
  toolCallId?: string;
  agent?: string;
  mode?: string;
  executionTime?: number;
  success?: boolean;
  errorMessage?: string;
  affectedResources?: string[];
}

// Search result context
export interface SearchResultContext {
  before: string;
  match: string;
  after: string;
}

// Final search result response
export interface SearchMemoryModeResult {
  success: boolean;
  query: string;
  results: MemorySearchResult[];
  totalResults: number;
  error?: string;
}

// Filter options for filtering service
export interface MemoryFilterOptions {
  dateRange?: DateRange;
  toolCallFilters?: ToolCallFilter;
  sessionId?: string;
  workspaceId?: string;
  filterBySession?: boolean;
}

// Content filter options
export interface ContentFilterOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

// Format options for formatter service
export interface FormatOptions {
  maxHighlightLength?: number;
  contextLength?: number;
  enhanceToolCallContext?: boolean;
}

// Formatted memory result
export interface FormattedMemoryResult {
  original: MemorySearchResult;
  formattedContent: string;
  preview: string;
  formattedTimestamp: string;
  title: string;
  subtitle?: string;
  formattedMetadata: Record<string, string>;
  highlights: SearchHighlight[];
  formatContext: FormatContext;
}

// Search highlight
export interface SearchHighlight {
  field: string;
  start: number;
  end: number;
  text: string;
  context?: string;
}

// Format context
export interface FormatContext {
  searchQuery: string;
  resultType: string;
  timestamp: Date;
}

// Memory sort options
export interface MemorySortOption {
  field: 'score' | 'timestamp' | 'relevance';
  direction: 'asc' | 'desc';
}

// Memory group options
export interface MemoryGroupOption {
  groupBy: 'type' | 'session' | 'workspace' | 'date';
  subGroupBy?: 'agent' | 'mode' | 'success';
}

// Grouped memory results
export interface GroupedMemoryResults {
  groups: MemoryResultGroup[];
  totalGroups: number;
  totalResults: number;
  groupedBy: MemoryGroupOption;
  groupStats: GroupStatistics;
}

// Memory result group
export interface MemoryResultGroup {
  key: string;
  displayName: string;
  results: MemorySearchResult[];
  count: number;
  totalScore: number;
  averageScore: number;
  metadata: Record<string, any>;
}

// Group statistics
export interface GroupStatistics {
  averageGroupSize: number;
  largestGroupSize: number;
  smallestGroupSize: number;
  scoreDistribution: Record<string, number>;
}

// Paginated memory results
export interface PaginatedMemoryResults {
  items: MemorySearchResult[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Pagination options
export interface PaginationOptions {
  page: number;
  pageSize: number;
  totalItems?: number;
}

// Memory result summary
export interface MemoryResultSummary {
  totalResults: number;
  averageScore: number;
  typeDistribution: Record<string, number>;
  dateRange: { start: Date; end: Date };
  executionTime: number;
}

// Highlight options
export interface HighlightOptions {
  maxHighlights?: number;
  highlightLength?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Search options for different search types
export interface SearchOptions {
  includeTraces?: boolean;
  includeSnapshots?: boolean;
  includeMessages?: boolean;
  workspaceId?: string;
  sessionId?: string;
  limit?: number;
}

// Memory types enum
export enum MemoryType {
  TRACE = 'trace',
  TOOL_CALL = 'toolCall',
  SESSION = 'session',
  STATE = 'state',
  WORKSPACE = 'workspace'
}

// Search method enum
export enum SearchMethod {
  SEMANTIC = 'semantic',
  EXACT = 'exact',
  MIXED = 'mixed'
}

// Activity types
export enum ActivityType {
  USER_ACTION = 'user_action',
  SYSTEM_EVENT = 'system_event',
  TOOL_EXECUTION = 'tool_execution',
  STATE_CHANGE = 'state_change'
}

// Memory configuration
export interface MemoryProcessorConfiguration {
  defaultLimit: number;
  maxLimit: number;
  defaultSearchMethod: SearchMethod;
  enableSemanticSearch: boolean;
  enableExactSearch: boolean;
  timeoutMs: number;
}

// Filter configuration
export interface MemoryFilterConfiguration {
  enableDateFiltering: boolean;
  enableSessionFiltering: boolean;
  enableToolCallFiltering: boolean;
  defaultDateRange: DateRange | null;
  strictFiltering: boolean;
}

// Formatter configuration
export interface ResultFormatterConfiguration {
  maxHighlightLength: number;
  contextLength: number;
  enableToolCallEnhancement: boolean;
  dateFormat: string;
  timestampFormat: string;
}

// Processing options
export interface ProcessingOptions {
  enableFiltering: boolean;
  enableFormatting: boolean;
  enableGrouping: boolean;
  enableSorting: boolean;
  batchSize?: number;
}

// Error information
export interface ErrorInfo {
  timestamp: Date;
  message: string;
  operation: string;
}

// Time range
export interface TimeRange {
  start: Date;
  end: Date;
}

// Related memory reference
export interface RelatedMemory {
  id: string;
  type: MemoryType;
  relationshipType: 'parent' | 'child' | 'sibling' | 'reference';
  similarity?: number;
}

// Tool call information
export interface ToolCallInfo {
  id: string;
  name: string;
  agent: string;
  mode: string;
  executionTime?: number;
  success: boolean;
  input?: any;
  output?: any;
  error?: string;
}

// Execution status
export enum ExecutionStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}