/**
 * Pagination Types
 *
 * Shared pagination infrastructure for handling large response data.
 * Used by list operations (states, sessions, workspaces, directories).
 */

/**
 * Input parameters for pagination requests
 */
export interface PaginationParams {
	/** 0-indexed page number (default: 0) */
	page?: number;
	/** Items per page (default: 25, max: 200) */
	pageSize?: number;
}

/**
 * Pagination metadata in responses
 */
export interface PaginationInfo {
	/** Current page (0-indexed) */
	page: number;
	/** Items per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Generic paginated result wrapper
 */
export interface PaginatedResult<T> {
	items: T[];
	pagination: PaginationInfo;
}
