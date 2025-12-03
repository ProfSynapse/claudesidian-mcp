/**
 * AgentDiscoveryService - Shared service for agent discovery and querying
 *
 * Responsibilities:
 * - Load custom agents from CustomPromptStorageService
 * - Filter agents by enabled status
 * - Provide agent lookup by ID
 * - Shared by ModelAgentManager (chat UI) and ListAgentsMode (MCP)
 *
 * Follows Single Responsibility Principle - only handles agent discovery.
 */

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isEnabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export class AgentDiscoveryService {
  constructor(
    private customPromptStorageService: any
  ) {}

  /**
   * Get all available agents
   * @param enabledOnly - If true, only return enabled agents
   */
  async getAvailableAgents(enabledOnly: boolean = false): Promise<AgentInfo[]> {
    try {
      // Get all prompts from storage
      const allPrompts = await this.customPromptStorageService.getAllPrompts();

      // Filter by enabled status if requested
      const agents = enabledOnly
        ? allPrompts.filter((prompt: any) => prompt.isEnabled)
        : allPrompts;

      // Map to AgentInfo format
      return agents.map((prompt: any) => this.mapToAgentInfo(prompt));
    } catch (error) {
      console.error('[AgentDiscoveryService] Failed to get agents:', error);
      return [];
    }
  }

  /**
   * Find a specific agent by ID
   */
  async findAgent(agentId: string): Promise<AgentInfo | null> {
    try {
      const allAgents = await this.getAvailableAgents(false);
      return allAgents.find(agent => agent.id === agentId) || null;
    } catch (error) {
      console.error('[AgentDiscoveryService] Failed to find agent:', error);
      return null;
    }
  }

  /**
   * Get enabled agents only
   */
  async getEnabledAgents(): Promise<AgentInfo[]> {
    return this.getAvailableAgents(true);
  }

  /**
   * Map custom prompt to AgentInfo format
   */
  private mapToAgentInfo(prompt: any): AgentInfo {
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description || '',
      prompt: prompt.prompt || '',
      isEnabled: prompt.isEnabled !== false, // Default to true if not specified
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt
    };
  }
}
