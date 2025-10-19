/**
 * Initialize suggesters for a textarea
 */

import { App } from 'obsidian';
import { TextAreaNoteSuggester } from './TextAreaNoteSuggester';
import { MessageEnhancer } from '../../services/MessageEnhancer';

export interface SuggesterInstances {
  noteSuggester: TextAreaNoteSuggester;
  messageEnhancer: MessageEnhancer;
  cleanup: () => void;
}

export function initializeSuggesters(
  app: App,
  textarea: HTMLTextAreaElement
): SuggesterInstances {
  console.log('[initializeSuggesters] Setting up suggesters for textarea');

  const messageEnhancer = new MessageEnhancer();

  // Create note suggester
  const noteSuggester = new TextAreaNoteSuggester(app, textarea, messageEnhancer);

  console.log('[initializeSuggesters] Suggesters initialized successfully');

  return {
    noteSuggester,
    messageEnhancer,
    cleanup: () => {
      noteSuggester.destroy();
      messageEnhancer.clearEnhancements();
    }
  };
}
