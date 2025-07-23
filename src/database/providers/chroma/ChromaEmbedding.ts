import { BaseEmbeddingProvider } from '../base/BaseEmbeddingProvider';
import { TokenTrackingMixin } from '../base/TokenTrackingMixin';
import { ITokenTrackingProvider } from '../../interfaces/IEmbeddingProvider';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UsageTracker } from '../../../services/UsageTracker';

/**
 * Embedding provider for ChromaDB
 * Handles vector embedding generation for text content
 * Includes token tracking functionality
 */
export class ChromaEmbeddingProvider extends BaseEmbeddingProvider implements ITokenTrackingProvider {
  /**
   * External embedding function for flexibility
   */
  private embeddingFunction: (texts: string[]) => Promise<number[][]>;
  
  /**
   * Token tracking functionality
   */
  private tokenTracker: TokenTrackingMixin;
  
  /**
   * Usage tracker for cost-based tracking
   */
  private usageTracker: UsageTracker | null = null;
  
  /**
   * Current model being used for embeddings
   */
  private model = 'text-embedding-3-small';
  
  /**
   * Create a new ChromaDB embedding provider
   * @param embeddingFunction Optional external embedding function
   * @param dimension Embedding vector dimension
   * @param model Embedding model identifier
   * @param provider Provider name (e.g., 'ollama', 'openai')
   */
  constructor(
    dimension: number,
    embeddingFunction?: (texts: string[]) => Promise<number[][]>,
    model = 'text-embedding-3-small',
    private provider = 'openai'
  ) {
    super(dimension, 'chroma');
    
    // Use provided embedding function or create a default one
    this.embeddingFunction = embeddingFunction || this.defaultEmbeddingFunction.bind(this);
    this.model = model;
    
    // Initialize token tracking
    this.tokenTracker = new TokenTrackingMixin();
  }
  
  /**
   * Initialize the embedding provider
   */
  async initialize(): Promise<void> {
    // Initialize token tracking with provider info
    this.tokenTracker.initializeTokenTracking(this.provider);
    
    return Promise.resolve();
  }
  
  /**
   * Generate embeddings for text content
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // Check budget before generating embeddings
      if (this.usageTracker) {
        const estimatedCost = this.estimateEmbeddingCost(texts);
        const canAfford = await this.usageTracker.canAfford(estimatedCost);
        if (!canAfford) {
          const budgetStatus = await this.usageTracker.getBudgetStatusAsync();
          throw new Error(`Monthly embedding budget of $${budgetStatus.monthlyBudget.toFixed(2)} has been exceeded. Current spending: $${budgetStatus.currentSpending.toFixed(2)}. Please reset or increase your budget in settings.`);
        }
      }
      
      // Track token usage (legacy system)
      for (const text of texts) {
        const tokenCount = this.tokenTracker.estimateTokenCount(text);
        await this.tokenTracker.updateUsageStats(tokenCount, this.model, this.provider);
      }
      
      // Generate embeddings
      const embeddings = await this.embeddingFunction(texts);
      
      // Track cost-based usage (new system)
      if (this.usageTracker) {
        try {
          const actualCost = this.calculateEmbeddingCost(texts);
          const providerName = this.tokenTracker.getProviderDisplayName(this.provider);
          await this.usageTracker.trackUsage(providerName.toLowerCase(), actualCost);
        } catch (error) {
          console.error('Failed to track embedding usage:', error);
          // Don't fail the embedding generation if usage tracking fails
        }
      }
      
      return embeddings;
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      throw new Error(`Embedding generation failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Default embedding function that uses a simple hashing approach
   * This is a fallback that should be replaced with a proper embedding model in production
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  private async defaultEmbeddingFunction(texts: string[]): Promise<number[][]> {
    return texts.map(text => {
      // Simple hash-based embedding - NOT FOR PRODUCTION USE
      // This is just a placeholder that creates vectors with the right dimension
      const vector = new Array(this.dimension).fill(0);
      
      // Generate some variation based on the text content
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const position = i % this.dimension;
        vector[position] += charCode / 1000;
      }
      
      // Normalize to unit length
      return this.normalizeVector(vector);
    });
  }
  
  /**
   * Set a custom embedding function
   * @param embeddingFunction Custom embedding function
   */
  setEmbeddingFunction(embeddingFunction: (texts: string[]) => Promise<number[][]>): void {
    this.embeddingFunction = embeddingFunction;
  }
  
  /**
   * Set the embedding model
   * @param model Model identifier
   */
  setModel(model: string): void {
    this.model = model;
  }
  
  /**
   * Set the provider
   * @param provider Provider name
   */
  setProvider(provider: string): void {
    this.provider = provider;
    this.tokenTracker.initializeTokenTracking(provider);
  }
  
  /**
   * Get the current embedding model
   */
  getModel(): string {
    return this.model;
  }
  
  /**
   * Get total tokens used this month
   */
  getTokensThisMonth(): number {
    return this.tokenTracker.getTokensThisMonth();
  }
  
  /**
   * Get model usage stats
   */
  getModelUsage(): {[key: string]: number} {
    return this.tokenTracker.getModelUsage();
  }
  
  /**
   * Get the total estimated cost based on token usage
   */
  getTotalCost(): number {
    return this.tokenTracker.getTotalCost();
  }
  
  /**
   * Update token usage stats
   * @param tokenCount Number of tokens to add
   * @param model Optional model name (defaults to current model)
   */
  async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
    return this.tokenTracker.updateUsageStats(tokenCount, model || this.model);
  }
  
  /**
   * Reset usage stats to zero
   */
  async resetUsageStats(): Promise<void> {
    return this.tokenTracker.resetUsageStats();
  }
  
  /**
   * Set the usage tracker for cost-based tracking
   */
  setUsageTracker(usageTracker: UsageTracker): void {
    this.usageTracker = usageTracker;
  }
  
  /**
   * Estimate embedding cost before generation
   */
  private estimateEmbeddingCost(texts: string[]): number {
    let totalTokens = 0;
    for (const text of texts) {
      totalTokens += this.tokenTracker.estimateTokenCount(text);
    }
    
    // Use provider-aware cost calculation to handle Ollama free models
    const costPerThousandTokens = (this.tokenTracker as any).getProviderCostPerThousand(this.model, this.provider);
    const costPerToken = costPerThousandTokens / 1000;
    
    return totalTokens * costPerToken;
  }
  
  /**
   * Calculate actual embedding cost after generation
   */
  private calculateEmbeddingCost(texts: string[]): number {
    // For now, use the same estimation method
    // In the future, this could use actual token counts from API responses
    return this.estimateEmbeddingCost(texts);
  }
}