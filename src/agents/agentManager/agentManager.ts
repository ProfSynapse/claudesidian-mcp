import { BaseAgent } from '../baseAgent';
import { AgentManagerConfig } from './config';
import {
  ListPromptsMode,
  GetPromptMode,
  CreatePromptMode,
  UpdatePromptMode,
  DeletePromptMode,
  TogglePromptMode
} from './modes';
import { CustomPromptStorageService } from '../../database/services/CustomPromptStorageService';
import { Settings } from '../../settings';
import { sanitizeVaultName } from '../../utils/vaultUtils';

/**
 * AgentManager Agent for custom prompt operations
 */
export class AgentManagerAgent extends BaseAgent {
  /**
   * Custom prompt storage service
   */
  private storageService: CustomPromptStorageService;

  /**
   * Vault name for multi-vault support
   */
  private vaultName: string;
  
  /**
   * Create a new AgentManagerAgent
   * @param settings Settings instance for prompt storage
   */
  constructor(settings: Settings) {
    super(
      AgentManagerConfig.name,
      AgentManagerConfig.description,
      AgentManagerConfig.version
    );
    
    this.storageService = new CustomPromptStorageService(settings);
    
    // Get vault name from settings (which has access to plugin.app)
    const plugin = (settings as any).plugin;
    if (plugin && plugin.app) {
      this.vaultName = sanitizeVaultName(plugin.app.vault.getName());
    } else {
      this.vaultName = 'unknown-vault';
    }
    
    // Register modes
    this.registerMode(new ListPromptsMode(this.storageService));
    this.registerMode(new GetPromptMode(this.storageService));
    this.registerMode(new CreatePromptMode(this.storageService));
    this.registerMode(new UpdatePromptMode(this.storageService));
    this.registerMode(new DeletePromptMode(this.storageService));
    this.registerMode(new TogglePromptMode(this.storageService));
  }

  /**
   * Dynamic description that includes information about all available agents
   */
  get description(): string {
    const baseDescription = AgentManagerConfig.description;
    const agentsContext = this.getAgentsSummary();
    return `[${this.vaultName}] ${baseDescription}\n\n${agentsContext}`;
  }
  
  /**
   * Get the storage service for direct access if needed
   * @returns CustomPromptStorageService instance
   */
  getStorageService(): CustomPromptStorageService {
    return this.storageService;
  }

  /**
   * Get a summary of all available agents in the system
   * @returns Formatted string with agent information
   * @private
   */
  private getAgentsSummary(): string {
    try {
      // Check if agent manager is available
      if (!this.agentManager) {
        return `🤖 Agents: Agent manager not available`;
      }

      // Get all agents from the agent manager
      // Cast to the full AgentManager type to access getAgents method
      const agents = (this.agentManager as any).getAgents ? (this.agentManager as any).getAgents() : [];
      
      if (!agents || agents.length === 0) {
        return `🤖 Agents: No agents currently registered`;
      }

      const agentSummary = [`🤖 Available Agents (${agents.length}):`];
      
      for (const agent of agents) {
        try {
          // Get mode count for this agent
          const modes = agent.getModes ? agent.getModes() : new Map();
          const modeCount = modes instanceof Map ? modes.size : 
                           Array.isArray(modes) ? modes.length : 0;
          
          agentSummary.push(`   • ${agent.name}: ${agent.description || 'No description'} (${modeCount} modes)`);
        } catch (error) {
          agentSummary.push(`   • ${agent.name}: ${agent.description || 'No description'} (modes unavailable)`);
        }
      }

      return agentSummary.join('\n');
    } catch (error) {
      return `🤖 Agents: Error loading agent information (${error})`;
    }
  }
}