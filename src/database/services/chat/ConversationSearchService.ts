/**
 * ConversationSearchService - Advanced search capabilities for chat conversations
 * 
 * Provides semantic search, filtering, and advanced query capabilities for conversations.
 * Integrates with the existing HybridSearchService patterns while focusing on chat data.
 * 
 * Based on: /docs/architecture/database-architecture-specification.md
 */

import { ConversationRepository } from './ConversationRepository';
import type { EmbeddingService } from '../core/EmbeddingService';
import type {
  ConversationSearchOptions,
  ConversationSearchResult,
  ConversationData,
  ConversationMessage,
  PaginatedMessages,
  ConversationDocument
} from '../../../types/chat/ChatTypes';
import { documentToConversationData, documentToSearchResult } from '../../../types/chat/ChatTypes';

export interface MessageSearchOptions {
  conversationId?: string;
  role?: 'user' | 'assistant';
  limit?: number;
  timeRange?: { start: number; end: number };
  vaultName?: string;
}

export interface MessageSearchResult {
  conversationId: string;
  conversationTitle: string;
  message: ConversationMessage;
  relevanceScore: number;
  context?: {
    previousMessage?: ConversationMessage;
    nextMessage?: ConversationMessage;
  };
}

export interface AdvancedSearchOptions extends ConversationSearchOptions {
  includeMessages?: boolean;
  messageRole?: 'user' | 'assistant';
  messageContent?: string;
  toolCallName?: string;
  minRelevanceScore?: number;
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface AdvancedSearchResult {
  conversations: ConversationSearchResult[];
  messages: MessageSearchResult[];
  totalResults: number;
  queryTime: number;
  searchQuery: string;
}

export class ConversationSearchService {
  constructor(
    private conversationRepository: ConversationRepository,
    private embeddingService: EmbeddingService
  ) {}

  // =============================================================================
  // SEMANTIC CONVERSATION SEARCH
  // =============================================================================

  /**
   * Search conversations by semantic similarity
   */
  async searchConversations(
    query: string,
    options: ConversationSearchOptions = {}
  ): Promise<ConversationSearchResult[]> {
    const startTime = Date.now();
    
    try {
      const results = await this.conversationRepository.searchConversationsWithResults(query, options);
      
      // Apply additional filtering if needed
      let filteredResults = results;
      
      if (options.timeRange) {
        filteredResults = filteredResults.filter(result => 
          result.metadata.created_at >= options.timeRange!.start &&
          result.metadata.created_at <= options.timeRange!.end
        );
      }

      // Sort results by relevance score (default) or other criteria
      filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(`[ConversationSearchService] Search completed in ${Date.now() - startTime}ms`);
      return filteredResults;

    } catch (error) {
      console.error('[ConversationSearchService] Failed to search conversations:', error);
      return [];
    }
  }

  /**
   * Search for messages across conversations
   */
  async searchMessages(
    query: string,
    options: MessageSearchOptions = {}
  ): Promise<MessageSearchResult[]> {
    const startTime = Date.now();
    const results: MessageSearchResult[] = [];

    try {
      // First, get conversations to search through
      let conversationsToSearch: ConversationSearchResult[];

      if (options.conversationId) {
        // Search within specific conversation
        const conversation = await this.conversationRepository.getConversation(options.conversationId);
        if (!conversation) {
          return [];
        }
        const conversationData = documentToConversationData(conversation);
        conversationsToSearch = [{
          id: conversation.id,
          title: conversation.metadata.title,
          summary: '',
          metadata: conversation.metadata,
          relevanceScore: 1.0
        }];
      } else {
        // Search across all conversations
        const searchOptions: ConversationSearchOptions = {
          limit: 100, // Get more conversations for message search
          vaultName: options.vaultName,
          timeRange: options.timeRange
        };
        conversationsToSearch = await this.searchConversations(query, searchOptions);
      }

      // Generate query embedding once for efficiency
      const queryEmbedding = await this.embeddingService.getEmbedding(query);

      // Search messages within each conversation
      for (const conv of conversationsToSearch) {
        const conversation = conv.metadata.conversation;
        
        let messagesToSearch = conversation.messages;

        // Apply role filter
        if (options.role) {
          messagesToSearch = messagesToSearch.filter(msg => msg.role === options.role);
        }

        // Apply time range filter
        if (options.timeRange) {
          messagesToSearch = messagesToSearch.filter(msg =>
            msg.timestamp >= options.timeRange!.start &&
            msg.timestamp <= options.timeRange!.end
          );
        }

        // Calculate relevance for each message
        for (let i = 0; i < messagesToSearch.length; i++) {
          const message = messagesToSearch[i];
          const relevanceScore = await this.calculateMessageRelevance(message, query, queryEmbedding || undefined);

          if (relevanceScore > 0.3) { // Minimum relevance threshold
            results.push({
              conversationId: conversation.id,
              conversationTitle: conversation.title,
              message,
              relevanceScore,
              context: {
                previousMessage: i > 0 ? messagesToSearch[i - 1] : undefined,
                nextMessage: i < messagesToSearch.length - 1 ? messagesToSearch[i + 1] : undefined
              }
            });
          }
        }
      }

      // Sort by relevance and apply limit
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const limitedResults = results.slice(0, options.limit || 20);

      console.log(`[ConversationSearchService] Message search completed in ${Date.now() - startTime}ms`);
      return limitedResults;

    } catch (error) {
      console.error('[ConversationSearchService] Failed to search messages:', error);
      return [];
    }
  }

  // =============================================================================
  // ADVANCED SEARCH CAPABILITIES
  // =============================================================================

  /**
   * Perform advanced search across conversations and messages
   */
  async advancedSearch(
    query: string,
    options: AdvancedSearchOptions = {}
  ): Promise<AdvancedSearchResult> {
    const startTime = Date.now();

    try {
      // Search conversations
      const conversationResults = await this.searchConversations(query, options);
      
      // Filter by minimum relevance score if specified
      const filteredConversations = options.minRelevanceScore 
        ? conversationResults.filter(r => r.relevanceScore >= options.minRelevanceScore!)
        : conversationResults;

      // Search messages if requested
      let messageResults: MessageSearchResult[] = [];
      if (options.includeMessages) {
        const messageSearchOptions: MessageSearchOptions = {
          role: options.messageRole,
          limit: 50,
          timeRange: options.timeRange,
          vaultName: options.vaultName
        };
        messageResults = await this.searchMessages(query, messageSearchOptions);
      }

      // Apply sorting
      const sortedConversations = this.sortResults(filteredConversations, options);

      const totalResults = sortedConversations.length + messageResults.length;
      const queryTime = Date.now() - startTime;

      return {
        conversations: sortedConversations,
        messages: messageResults,
        totalResults,
        queryTime,
        searchQuery: query
      };

    } catch (error) {
      console.error('[ConversationSearchService] Advanced search failed:', error);
      return {
        conversations: [],
        messages: [],
        totalResults: 0,
        queryTime: Date.now() - startTime,
        searchQuery: query
      };
    }
  }

  /**
   * Search for conversations containing specific tool calls
   */
  async searchByToolCalls(
    toolName: string,
    options: ConversationSearchOptions = {}
  ): Promise<ConversationSearchResult[]> {
    try {
      // Get all conversations and filter by tool calls
      const allConversations = await this.conversationRepository.searchConversationsWithResults('', {
        ...options,
        limit: 1000 // Get more results to filter
      });

      const conversationsWithTool = allConversations.filter(conv => {
        const conversation = conv.metadata.conversation;
        return conversation.messages.some(message => 
          message.tool_calls?.some(tool => 
            tool.name === toolName || tool.name.includes(toolName)
          )
        );
      });

      console.log(`[ConversationSearchService] Found ${conversationsWithTool.length} conversations with tool: ${toolName}`);
      return conversationsWithTool;

    } catch (error) {
      console.error(`[ConversationSearchService] Failed to search by tool calls for ${toolName}:`, error);
      return [];
    }
  }

  /**
   * Get conversation context around a specific message
   */
  async getMessageContext(
    conversationId: string,
    messageId: string,
    contextSize: number = 5
  ): Promise<{
    targetMessage: ConversationMessage | null;
    context: ConversationMessage[];
    conversation: ConversationData | null;
  }> {
    try {
      const conversationDoc = await this.conversationRepository.getConversation(conversationId);
      if (!conversationDoc) {
        return { targetMessage: null, context: [], conversation: null };
      }

      const conversation = documentToConversationData(conversationDoc);
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        return { targetMessage: null, context: [], conversation };
      }

      const targetMessage = conversation.messages[messageIndex];
      const startIndex = Math.max(0, messageIndex - contextSize);
      const endIndex = Math.min(conversation.messages.length - 1, messageIndex + contextSize);
      const context = conversation.messages.slice(startIndex, endIndex + 1);

      return { targetMessage, context, conversation };

    } catch (error) {
      console.error(`[ConversationSearchService] Failed to get message context for ${messageId}:`, error);
      return { targetMessage: null, context: [], conversation: null };
    }
  }

  // =============================================================================
  // FILTERING AND SUGGESTION METHODS
  // =============================================================================

  /**
   * Get suggested search queries based on recent conversations
   */
  async getSuggestedQueries(sessionId: string, limit: number = 10): Promise<string[]> {
    try {
      const recentConversations = await this.conversationRepository.getRecentConversations(20);
      
      const suggestions = new Set<string>();
      
      for (const conv of recentConversations) {
        // Extract key phrases from conversation titles
        const title = conv.metadata.title;
        const titleWords = title.split(' ')
          .filter((word: string) => word.length > 3)
          .slice(0, 3);
        
        titleWords.forEach((word: string) => suggestions.add(word));

        // Add conversation title as suggestion if it's descriptive
        if (title.length > 5 && title.length < 50) {
          suggestions.add(title);
        }
      }

      return Array.from(suggestions).slice(0, limit);

    } catch (error) {
      console.error('[ConversationSearchService] Failed to get suggested queries:', error);
      return [];
    }
  }

  /**
   * Get related conversations based on semantic similarity
   */
  async getRelatedConversations(
    conversationId: string,
    limit: number = 5
  ): Promise<ConversationSearchResult[]> {
    try {
      const conversation = await this.conversationRepository.getConversation(conversationId);
      if (!conversation) {
        return [];
      }

      // Use the conversation title as search query
      const relatedResults = await this.searchConversations(conversation.metadata.title, { limit: limit + 1 });
      
      // Remove the original conversation from results
      return relatedResults.filter(result => result.id !== conversationId).slice(0, limit);

    } catch (error) {
      console.error(`[ConversationSearchService] Failed to get related conversations for ${conversationId}:`, error);
      return [];
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Calculate relevance score between a message and search query
   */
  private async calculateMessageRelevance(
    message: ConversationMessage,
    query: string,
    queryEmbedding?: number[]
  ): Promise<number> {
    try {
      // Simple text matching as fallback
      const textScore = this.calculateTextSimilarity(message.content, query);
      
      // If embedding service is available, use semantic similarity
      if (queryEmbedding && this.embeddingService) {
        try {
          const messageEmbedding = await this.embeddingService.getEmbedding(message.content);
          if (messageEmbedding) {
            const semanticScore = this.calculateCosineSimilarity(queryEmbedding, messageEmbedding);
            
            // Combine text and semantic scores
            return (textScore * 0.3) + (semanticScore * 0.7);
          }
        } catch (error) {
          console.error('[ConversationSearchService] Failed to generate message embedding:', error);
        }
      }

      return textScore;

    } catch (error) {
      console.error('[ConversationSearchService] Failed to calculate message relevance:', error);
      return 0;
    }
  }

  /**
   * Calculate simple text similarity between two strings
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Sort search results based on specified criteria
   */
  private sortResults(
    results: ConversationSearchResult[],
    options: AdvancedSearchOptions
  ): ConversationSearchResult[] {
    const sortBy = options.sortBy || 'relevance';
    const sortOrder = options.sortOrder || 'desc';

    const sorted = [...results].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = a.metadata.last_updated - b.metadata.last_updated;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'relevance':
        default:
          comparison = a.relevanceScore - b.relevanceScore;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }
}