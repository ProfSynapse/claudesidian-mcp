/**
 * Location: src/services/agent/AgentValidationService.ts
 *
 * Purpose: Handles API key validation for agent capabilities
 * Extracted from AgentRegistrationService.ts to follow Single Responsibility Principle
 *
 * Used by: AgentRegistrationService for capability validation
 * Dependencies: LLMValidationService
 */

import { Plugin } from 'obsidian';
import NexusPlugin from '../../main';
import { LLMValidationService } from '../llm/validation/ValidationService';
import { DEFAULT_LLM_PROVIDER_SETTINGS } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Service for validating agent capabilities and API keys
 */
export class AgentValidationService {
  constructor(private plugin: Plugin | NexusPlugin) {}

  /**
   * Validate API keys for LLM providers used in agent modes
   */
  async validateLLMApiKeys(): Promise<boolean> {
    try {
      const pluginSettings = (this.plugin as any)?.settings?.settings;
      const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;

      const defaultProvider = llmProviderSettings.defaultModel?.provider;
      if (!defaultProvider) {
        return false;
      }

      const providerConfig = llmProviderSettings.providers?.[defaultProvider];
      if (!providerConfig?.apiKey) {
        return false;
      }

      // Validate with caching - this will use cached validation if available
      const validation = await LLMValidationService.validateApiKey(
        defaultProvider,
        providerConfig.apiKey,
        {
          forceValidation: false,  // Use cache during startup
          providerConfig: providerConfig,
          onValidationSuccess: (hash: string, timestamp: number) => {
            // Update validation state in settings
            if (providerConfig) {
              providerConfig.lastValidated = timestamp;
              providerConfig.validationHash = hash;
              // Save settings asynchronously
              (this.plugin as any)?.settings?.saveSettings().catch((err: Error) => {
                logger.systemError(err, 'Failed to save validation state');
              });
            }
          }
        }
      );

      return validation.success;
    } catch (error) {
      logger.systemError(error as Error, 'LLM API Key Validation');
      return false;
    }
  }

  /**
   * Get agent capability status
   */
  async getCapabilityStatus(): Promise<{
    hasValidLLMKeys: boolean;
    enableSearchModes: boolean;
    enableLLMModes: boolean;
  }> {
    const hasValidLLMKeys = await this.validateLLMApiKeys();

    // Search modes disabled
    const enableSearchModes = false;

    // Enable LLM-dependent modes only if valid LLM API keys exist
    const enableLLMModes = hasValidLLMKeys;

    return {
      hasValidLLMKeys,
      enableSearchModes,
      enableLLMModes
    };
  }
}
