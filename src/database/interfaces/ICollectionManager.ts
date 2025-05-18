/**
 * Interface for managing specific collections within the vector store
 * Each implementation handles a specific data domain (workspaces, memory traces, etc.)
 */
export interface ICollectionManager<T> {
  /**
   * Initialize the collection
   */
  initialize(): Promise<void>;
  
  /**
   * Collection name
   */
  readonly collectionName: string;
  
  /**
   * Add an item to the collection
   * @param item Item to add
   * @returns ID of the added item
   */
  add(item: T): Promise<string>;
  
  /**
   * Add multiple items to the collection
   * @param items Items to add
   * @returns Array of added item IDs
   */
  addBatch(items: T[]): Promise<string[]>;
  
  /**
   * Get an item by ID
   * @param id ID of the item to retrieve
   * @returns Retrieved item or undefined if not found
   */
  get(id: string): Promise<T | undefined>;
  
  /**
   * Get multiple items by their IDs
   * @param ids IDs of the items to retrieve
   * @returns Array of retrieved items
   */
  getBatch(ids: string[]): Promise<T[]>;
  
  /**
   * Update an item
   * @param id ID of the item to update
   * @param updates Partial item data for updating
   */
  update(id: string, updates: Partial<T>): Promise<void>;
  
  /**
   * Delete an item
   * @param id ID of the item to delete
   */
  delete(id: string): Promise<void>;
  
  /**
   * Delete multiple items
   * @param ids IDs of the items to delete
   */
  deleteBatch(ids: string[]): Promise<void>;
  
  /**
   * Query items by similarity to a given embedding
   * @param embedding Query embedding vector
   * @param options Query options
   */
  query(embedding: number[], options?: {
    limit?: number;
    threshold?: number;
    where?: Record<string, any>;
  }): Promise<Array<{
    item: T;
    similarity: number;
  }>>;
  
  /**
   * Get all items from the collection
   * @param options Options for retrieving all items
   */
  getAll(options?: {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    where?: Record<string, any>;
  }): Promise<T[]>;
  
  /**
   * Get the number of items in the collection
   */
  count(): Promise<number>;
}