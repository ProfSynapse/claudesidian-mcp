import { ITokenTrackingProvider } from './IEmbeddingProvider';

export interface ITokenUsageService {
  /**
   * Track token usage for embedding operations
   * @param tokens Number of tokens used
   * @param model Model used for embedding
   */
  trackTokenUsage(tokens: number, model: string): Promise<void>;

  /**
   * Update provider statistics
   * @param provider Token tracking provider
   * @param tokens Number of tokens used
   * @param model Model used
   */
  updateProviderStats(provider: ITokenTrackingProvider, tokens: number, model: string): Promise<void>;

  /**
   * Update all-time statistics in localStorage
   * @param tokens Number of tokens used
   * @param cost Cost of the operation
   */
  updateAllTimeStats(tokens: number, cost: number): Promise<void>;

  /**
   * Calculate cost for token usage
   * @param tokens Number of tokens
   * @param model Model used
   * @returns Cost in dollars
   */
  calculateCost(tokens: number, model: string): number;

  /**
   * Update token usage for operations
   * @param tokens Number of tokens used
   * @param model Model used
   * @param cost Cost of the operation
   */
  updateTokenUsage(tokens: number, model: string, cost: number): Promise<void>;

  /**
   * Emit usage events for UI updates
   * @param tokens Optional number of tokens
   * @param model Optional model name
   */
  emitUsageEvents(tokens?: number, model?: string): void;

  /**
   * Update last indexed date in settings
   */
  updateLastIndexedDate(): Promise<void>;
}
