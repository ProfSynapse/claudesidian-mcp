/**
 * Pagination Helper
 *
 * Reusable pagination logic for all list operations.
 */

import { PaginationParams, PaginationInfo, PaginatedResult } from '../../types/pagination/PaginationTypes';

export class PaginationHelper {
	static readonly DEFAULT_PAGE_SIZE = 25;
	static readonly MAX_PAGE_SIZE = 200;

	/**
	 * Paginate an array of items
	 *
	 * @param items - Full array of items to paginate
	 * @param params - Pagination parameters (page, pageSize)
	 * @returns Paginated result with items and pagination info
	 */
	static paginate<T>(items: T[], params: PaginationParams = {}): PaginatedResult<T> {
		const page = Math.max(0, params.page ?? 0);
		const pageSize = Math.min(
			Math.max(1, params.pageSize ?? this.DEFAULT_PAGE_SIZE),
			this.MAX_PAGE_SIZE
		);
		const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

		// Clamp page to valid range
		const validPage = Math.min(page, totalPages - 1);

		const start = validPage * pageSize;
		const end = start + pageSize;

		return {
			items: items.slice(start, end),
			pagination: {
				page: validPage,
				pageSize,
				totalPages
			}
		};
	}

	/**
	 * Create pagination info without slicing (for pre-paginated data)
	 *
	 * @param page - Current page
	 * @param pageSize - Items per page
	 * @param totalItems - Total number of items
	 * @returns Pagination info object
	 */
	static createPaginationInfo(page: number, pageSize: number, totalItems: number): PaginationInfo {
		return {
			page,
			pageSize,
			totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
		};
	}

	/**
	 * Check if pagination params were provided (vs using limit)
	 */
	static hasPaginationParams(params: { page?: number; pageSize?: number; limit?: number }): boolean {
		return params.page !== undefined || params.pageSize !== undefined;
	}
}
