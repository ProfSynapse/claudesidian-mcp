/**
 * Initialize suggesters for a contenteditable element
 */

import { App } from 'obsidian';
import { TextAreaNoteSuggester } from './TextAreaNoteSuggester';
import { TextAreaToolSuggester } from './TextAreaToolSuggester';
import { TextAreaAgentSuggester } from './TextAreaAgentSuggester';
import { MessageEnhancer } from '../../services/MessageEnhancer';
import { CustomPromptStorageService } from '../../../../agents/agentManager/services/CustomPromptStorageService';

export interface SuggesterInstances {
  noteSuggester: TextAreaNoteSuggester;
  toolSuggester: TextAreaToolSuggester;
  agentSuggester?: TextAreaAgentSuggester;
  messageEnhancer: MessageEnhancer;
  cleanup: () => void;
}

export function initializeSuggesters(
  app: App,
  element: HTMLElement
): SuggesterInstances {
  console.log('[initializeSuggesters] Setting up suggesters for contenteditable element');

  const messageEnhancer = new MessageEnhancer();

  // Create suggesters
  const noteSuggester = new TextAreaNoteSuggester(app, element, messageEnhancer);
  const toolSuggester = new TextAreaToolSuggester(app, element, messageEnhancer);

  // Try to get CustomPromptStorageService for agent suggester
  let agentSuggester: TextAreaAgentSuggester | undefined;
  try {
    const plugin = (app as any).plugins.plugins['claudesidian-mcp'];
    if (plugin && plugin.settings) {
      const promptStorage = new CustomPromptStorageService(plugin.settings);
      agentSuggester = new TextAreaAgentSuggester(app, element, messageEnhancer, promptStorage);
      console.log('[initializeSuggesters] Agent suggester initialized');
    } else {
      console.warn('[initializeSuggesters] Plugin settings not available - agent suggester disabled');
    }
  } catch (error) {
    console.warn('[initializeSuggesters] Failed to initialize agent suggester:', error);
  }

  console.log('[initializeSuggesters] All suggesters initialized successfully');

  return {
    noteSuggester,
    toolSuggester,
    agentSuggester,
    messageEnhancer,
    cleanup: () => {
      noteSuggester.destroy();
      toolSuggester.destroy();
      agentSuggester?.destroy();
      messageEnhancer.clearEnhancements();
    }
  };
}
