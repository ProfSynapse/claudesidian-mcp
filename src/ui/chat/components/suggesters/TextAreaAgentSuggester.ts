/**
 * TextAreaAgentSuggester - Agent suggester for textarea
 */

import { App, prepareFuzzySearch, setIcon } from 'obsidian';
import { TextAreaSuggester } from './TextAreaSuggester';
import {
  SuggestionItem,
  AgentSuggestionItem,
  AgentReference
} from './base/SuggesterInterfaces';
import { MessageEnhancer } from '../../services/MessageEnhancer';
import { CustomPromptStorageService } from '../../../../agents/agentManager/services/CustomPromptStorageService';
import { TokenCalculator } from '../../utils/TokenCalculator';

export class TextAreaAgentSuggester extends TextAreaSuggester<AgentSuggestionItem> {
  private messageEnhancer: MessageEnhancer;
  private promptStorage: CustomPromptStorageService;
  private maxTokensPerAgent = 5000;

  constructor(
    app: App,
    textarea: HTMLTextAreaElement,
    messageEnhancer: MessageEnhancer,
    promptStorage: CustomPromptStorageService
  ) {
    super(app, textarea, {
      trigger: /@(\w*)$/,
      maxSuggestions: 20,
      cacheTTL: 30000,
      debounceDelay: 100
    });

    this.messageEnhancer = messageEnhancer;
    this.promptStorage = promptStorage;
  }

  async getSuggestions(query: string): Promise<SuggestionItem<AgentSuggestionItem>[]> {
    const agents = this.promptStorage.getEnabledPrompts();

    if (agents.length === 0) {
      return [];
    }

    if (!query || query.trim().length === 0) {
      return agents
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, this.config.maxSuggestions)
        .map(agent => this.createSuggestion(agent, 1.0));
    }

    const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
    const suggestions: SuggestionItem<AgentSuggestionItem>[] = [];

    for (const agent of agents) {
      const nameMatch = fuzzySearch(agent.name);
      if (nameMatch) {
        suggestions.push(this.createSuggestion(agent, nameMatch.score));
        continue;
      }

      const descMatch = fuzzySearch(agent.description);
      if (descMatch) {
        suggestions.push(this.createSuggestion(agent, descMatch.score * 0.7));
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSuggestions);
  }

  renderSuggestion(item: SuggestionItem<AgentSuggestionItem>, el: HTMLElement): void {
    el.addClass('agent-suggester-item');

    const icon = el.createDiv({ cls: 'suggester-icon' });
    setIcon(icon, 'bot');

    const content = el.createDiv({ cls: 'suggester-content' });
    content.createDiv({ cls: 'suggester-title', text: item.data.name });
    content.createDiv({ cls: 'suggester-description', text: item.data.description });

    const badgeContainer = el.createDiv({ cls: 'suggester-badge-container' });
    const tokenBadge = badgeContainer.createSpan({ cls: 'suggester-badge token-info' });
    tokenBadge.textContent = `~${item.data.promptTokens.toLocaleString()} tokens`;
  }

  selectSuggestion(item: SuggestionItem<AgentSuggestionItem>): void {
    // Add to message enhancer
    const agentRef: AgentReference = {
      id: item.data.id,
      name: item.data.name,
      prompt: item.data.prompt,
      tokens: item.data.promptTokens
    };
    this.messageEnhancer.addAgent(agentRef);

    // Replace @ with @AgentName
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value;
    const beforeCursor = text.substring(0, cursorPos);
    const match = /@(\w*)$/.exec(beforeCursor);

    if (match) {
      const start = cursorPos - match[0].length;
      const before = text.substring(0, start);
      const after = text.substring(cursorPos);
      const replacement = `@${item.data.name.replace(/\s+/g, '_')} `;

      this.textarea.value = before + replacement + after;
      this.textarea.selectionStart = this.textarea.selectionEnd = start + replacement.length;
      this.textarea.dispatchEvent(new Event('input'));
    }
  }

  private createSuggestion(
    agent: { id: string; name: string; description: string; prompt: string },
    score: number
  ): SuggestionItem<AgentSuggestionItem> {
    const promptTokens = TokenCalculator.estimateTextTokens(agent.prompt);

    return {
      data: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        prompt: agent.prompt,
        promptTokens: promptTokens
      },
      score: score,
      displayText: agent.name,
      description: agent.description,
      tokens: promptTokens
    };
  }
}
