/**
 * TextAreaToolSuggester - Tool suggester for textarea
 */

import { App, prepareFuzzySearch, setIcon } from 'obsidian';
import { TextAreaSuggester } from './TextAreaSuggester';
import {
  SuggestionItem,
  ToolSuggestionItem,
  ToolHint
} from './base/SuggesterInterfaces';
import { MessageEnhancer } from '../../services/MessageEnhancer';
import { ToolListService } from '../../../../handlers/services/ToolListService';

export class TextAreaToolSuggester extends TextAreaSuggester<ToolSuggestionItem> {
  private messageEnhancer: MessageEnhancer;
  private cachedTools: ToolSuggestionItem[] | null = null;

  constructor(
    app: App,
    textarea: HTMLTextAreaElement,
    messageEnhancer: MessageEnhancer
  ) {
    super(app, textarea, {
      trigger: /^\/(\w*)$/,
      maxSuggestions: 30,
      cacheTTL: 120000,
      debounceDelay: 100
    });

    this.messageEnhancer = messageEnhancer;
    console.log('[TextAreaToolSuggester] Initialized');
  }

  /**
   * Convert technical tool name to human-friendly display name
   * "vaultManager.readFile" → "Read File"
   */
  private getDisplayName(technicalName: string): string {
    // Split by dot: "vaultManager.readFile" → ["vaultManager", "readFile"]
    const parts = technicalName.split('.');
    if (parts.length < 2) return technicalName;

    const action = parts[1];

    // Convert camelCase to Title Case with spaces
    // "readFile" → "Read File"
    const displayName = action
      .replace(/([A-Z])/g, ' $1') // Insert space before capitals
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();

    return displayName;
  }

  /**
   * Load tools from plugin
   */
  private async loadTools(): Promise<void> {
    try {
      const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        console.warn('[TextAreaToolSuggester] Plugin not found');
        return;
      }

      // Get agents from connector's agent registry
      if (!plugin.connector?.agentRegistry) {
        console.warn('[TextAreaToolSuggester] Connector or agent registry not available');
        return;
      }

      const agents = plugin.connector.agentRegistry.getAllAgents();
      if (!agents || agents.size === 0) {
        console.warn('[TextAreaToolSuggester] No agents registered yet - will retry when suggestions are requested');
        return;
      }

      // Create ToolListService instance (it's not a registered service)
      const toolListService = new ToolListService();

      // Generate tool list
      const toolData = await toolListService.generateToolList(
        agents,
        true, // vault enabled
        this.app.vault.getName() // Use actual vault name
      );

      // Convert to ToolSuggestionItems with display names
      this.cachedTools = toolData.tools.map((tool: any) => {
        const parts = tool.name.split('.');
        const category = parts.length > 1 ? parts[0] : 'general';

        return {
          name: tool.name, // Keep technical name for tool call
          displayName: this.getDisplayName(tool.name), // Add friendly display name
          description: tool.description,
          category: category,
          schema: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }
        };
      });

      console.log('[TextAreaToolSuggester] Loaded', this.cachedTools?.length || 0, 'tools');
    } catch (error) {
      console.error('[TextAreaToolSuggester] Failed to load tools:', error);
    }
  }

  async getSuggestions(query: string): Promise<SuggestionItem<ToolSuggestionItem>[]> {
    console.log('[TextAreaToolSuggester] Getting suggestions for query:', query);

    // Wait for tools to load if not yet loaded
    if (!this.cachedTools) {
      await this.loadTools();
    }

    if (!this.cachedTools || this.cachedTools.length === 0) {
      console.warn('[TextAreaToolSuggester] No tools available');
      return [];
    }

    // If no query, return all tools sorted by display name
    if (!query || query.trim().length === 0) {
      return this.cachedTools
        .slice(0, this.config.maxSuggestions)
        .map(tool => this.createSuggestion(tool, 1.0));
    }

    const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
    const suggestions: SuggestionItem<ToolSuggestionItem>[] = [];

    for (const tool of this.cachedTools) {
      // Try fuzzy match on display name first (highest priority)
      const displayName = tool.displayName || tool.name;
      const displayMatch = fuzzySearch(displayName);
      if (displayMatch) {
        suggestions.push(this.createSuggestion(tool, displayMatch.score));
        continue;
      }

      // Try fuzzy match on category (medium priority)
      const categoryMatch = fuzzySearch(tool.category);
      if (categoryMatch) {
        suggestions.push(this.createSuggestion(tool, categoryMatch.score * 0.8));
        continue;
      }

      // Try fuzzy match on description (lower priority)
      const descMatch = fuzzySearch(tool.description);
      if (descMatch) {
        suggestions.push(this.createSuggestion(tool, descMatch.score * 0.6));
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSuggestions);
  }

  renderSuggestion(item: SuggestionItem<ToolSuggestionItem>, el: HTMLElement): void {
    el.addClass('tool-suggester-item');

    const icon = el.createDiv({ cls: 'suggester-icon' });
    setIcon(icon, 'wrench');

    const content = el.createDiv({ cls: 'suggester-content' });

    // Show display name (e.g., "Read File") instead of technical name
    const displayName = item.data.displayName || item.data.name;
    content.createDiv({ cls: 'suggester-title', text: displayName });
    content.createDiv({ cls: 'suggester-description', text: item.data.description });

    const badgeContainer = el.createDiv({ cls: 'suggester-badge-container' });

    // Capitalize category name
    const categoryName = item.data.category.charAt(0).toUpperCase() + item.data.category.slice(1);
    badgeContainer.createSpan({ cls: 'suggester-badge category-badge', text: categoryName });
  }

  selectSuggestion(item: SuggestionItem<ToolSuggestionItem>): void {
    console.log('[TextAreaToolSuggester] Selected:', item.data.name);

    // Add to message enhancer
    const toolHint: ToolHint = {
      name: item.data.name,
      schema: item.data.schema
    };
    this.messageEnhancer.addTool(toolHint);

    // Remove the /command from the message
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value;
    const beforeCursor = text.substring(0, cursorPos);
    const match = /^\/(\w*)$/.exec(beforeCursor);

    if (match) {
      const start = cursorPos - match[0].length;
      const before = text.substring(0, start);
      const after = text.substring(cursorPos);

      this.textarea.value = before + after;
      this.textarea.selectionStart = this.textarea.selectionEnd = start;
      this.textarea.dispatchEvent(new Event('input'));
    }
  }

  private createSuggestion(
    tool: ToolSuggestionItem,
    score: number
  ): SuggestionItem<ToolSuggestionItem> {
    return {
      data: tool,
      score: score,
      displayText: tool.name,
      description: tool.description,
      tokens: 150
    };
  }
}
