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
   * Flag to prevent infinite recursion in description getter
   */
  private isGettingDescription: boolean = false;
  
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
   * Dynamic description that includes information about custom prompt agents
   */
  get description(): string {
    const baseDescription = AgentManagerConfig.description;
    
    // Prevent infinite recursion
    if (this.isGettingDescription) {
      return `[${this.vaultName}] ${baseDescription}`;
    }
    
    this.isGettingDescription = true;
    try {
      const customAgentsContext = this.getAgentsSummary();
      return `[${this.vaultName}] ${baseDescription}\n\n${customAgentsContext}`;
    } finally {
      this.isGettingDescription = false;
    }
  }
  
  /**
   * Get the storage service for direct access if needed
   * @returns CustomPromptStorageService instance
   */
  getStorageService(): CustomPromptStorageService {
    return this.storageService;
  }

  /**
   * Get a summary of all available custom prompt agents
   * @returns Formatted string with custom prompt agent information
   * @private
   */
  private getAgentsSummary(): string {
    try {
      // Check if storage service is available
      if (!this.storageService) {
        return `🤖 Custom Agents: Storage service not available`;
      }

      // Check if custom prompts feature is enabled
      if (!this.storageService.isEnabled()) {
        return `🤖 Custom Agents: Custom prompts feature is disabled`;
      }

      // Get all custom prompt agents
      const customPrompts = this.storageService.getAllPrompts();
      
      if (!customPrompts || customPrompts.length === 0) {
        return `🤖 Custom Agents: No custom prompt agents created yet`;
      }

      const enabledCount = customPrompts.filter(prompt => prompt.isEnabled).length;
      const agentSummary = [`🤖 Custom Agents (${customPrompts.length} total, ${enabledCount} enabled):`];
      
      for (const prompt of customPrompts) {
        const status = prompt.isEnabled ? '✅' : '❌';
        const description = prompt.description || 'No description provided';
        agentSummary.push(`   ${status} ${prompt.name}: ${description}`);
      }

      return agentSummary.join('\n');
    } catch (error) {
      return `🤖 Custom Agents: Error loading custom prompt agents (${error})`;
    }
  }
}