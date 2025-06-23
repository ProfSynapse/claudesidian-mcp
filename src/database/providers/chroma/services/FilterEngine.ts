/**
 * FilterEngine - Handles filtering logic for collection queries
 * Applies Single Responsibility Principle by focusing only on data filtering
 */

export interface DatabaseItem {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  document: string;
}

export interface WhereClause {
  [key: string]: any;
}

export class FilterEngine {
  /**
   * Filter items by where clause
   * @param items Items to filter
   * @param where Where clause filter
   * @returns Filtered items
   */
  static filterByWhere<T extends DatabaseItem>(items: T[], where?: WhereClause): T[] {
    if (!where) {
      return items;
    }
    
    return items.filter(item => this.matchesWhereClause(item, where));
  }

  /**
   * Check if an item matches a where clause
   * @param item Item to check
   * @param where Where clause
   * @returns True if item matches
   */
  static matchesWhereClause(item: DatabaseItem, where: WhereClause): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (!this.matchesCondition(item.metadata[key], value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a field value matches a condition
   * @param fieldValue The field value from the item
   * @param condition The condition to match against
   * @returns True if condition matches
   */
  private static matchesCondition(fieldValue: any, condition: any): boolean {
    // Handle $eq operator format: { field: { $eq: value } }
    if (typeof condition === 'object' && condition !== null && '$eq' in condition) {
      return fieldValue === condition.$eq;
    }
    
    // Handle $ne (not equal) operator
    if (typeof condition === 'object' && condition !== null && '$ne' in condition) {
      return fieldValue !== condition.$ne;
    }
    
    // Handle $in operator (value in array)
    if (typeof condition === 'object' && condition !== null && '$in' in condition) {
      return Array.isArray(condition.$in) && condition.$in.includes(fieldValue);
    }
    
    // Handle $nin operator (value not in array)
    if (typeof condition === 'object' && condition !== null && '$nin' in condition) {
      return Array.isArray(condition.$nin) && !condition.$nin.includes(fieldValue);
    }
    
    // Handle $gt (greater than) operator
    if (typeof condition === 'object' && condition !== null && '$gt' in condition) {
      return fieldValue > condition.$gt;
    }
    
    // Handle $gte (greater than or equal) operator
    if (typeof condition === 'object' && condition !== null && '$gte' in condition) {
      return fieldValue >= condition.$gte;
    }
    
    // Handle $lt (less than) operator
    if (typeof condition === 'object' && condition !== null && '$lt' in condition) {
      return fieldValue < condition.$lt;
    }
    
    // Handle $lte (less than or equal) operator
    if (typeof condition === 'object' && condition !== null && '$lte' in condition) {
      return fieldValue <= condition.$lte;
    }
    
    // Handle $regex operator for string matching
    if (typeof condition === 'object' && condition !== null && '$regex' in condition) {
      if (typeof fieldValue === 'string') {
        const regex = new RegExp(condition.$regex, condition.$options || '');
        return regex.test(fieldValue);
      }
      return false;
    }
    
    // Handle direct value format: { field: value }
    return fieldValue === condition;
  }

  /**
   * Apply pagination to filtered results
   * @param items Items to paginate
   * @param offset Starting offset
   * @param limit Maximum number of items
   * @returns Paginated items
   */
  static paginate<T>(items: T[], offset?: number, limit?: number): T[] {
    const startIndex = offset || 0;
    const endIndex = limit ? startIndex + limit : undefined;
    return items.slice(startIndex, endIndex);
  }

  /**
   * Filter items by IDs
   * @param items Items to filter
   * @param ids Array of IDs to match
   * @returns Items matching the provided IDs
   */
  static filterByIds<T extends DatabaseItem>(items: T[], ids: string[]): T[] {
    if (ids.length === 0) {
      return items;
    }
    
    const idSet = new Set(ids);
    return items.filter(item => idSet.has(item.id));
  }
}