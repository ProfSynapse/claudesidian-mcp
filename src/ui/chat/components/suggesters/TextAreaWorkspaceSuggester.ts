/**
 * TextAreaWorkspaceSuggester - Workspace suggester for textarea
 * Triggers on # and suggests available workspaces with fuzzy search
 */

import { App, prepareFuzzySearch, setIcon } from 'obsidian';
import { ContentEditableSuggester } from './ContentEditableSuggester';
import { ContentEditableHelper } from '../../utils/ContentEditableHelper';
import {
  SuggestionItem,
  WorkspaceSuggestionItem,
  WorkspaceReference
} from './base/SuggesterInterfaces';
import { MessageEnhancer } from '../../services/MessageEnhancer';
import { WorkspaceService } from '../../../../services/WorkspaceService';

export class TextAreaWorkspaceSuggester extends ContentEditableSuggester<WorkspaceSuggestionItem> {
  private messageEnhancer: MessageEnhancer;
  private workspaceService: WorkspaceService;

  constructor(
    app: App,
    element: HTMLElement,
    messageEnhancer: MessageEnhancer,
    workspaceService: WorkspaceService
  ) {
    super(app, element, {
      trigger: /#(\w*)$/,
      maxSuggestions: 20,
      cacheTTL: 30000,
      debounceDelay: 100
    });

    this.messageEnhancer = messageEnhancer;
    this.workspaceService = workspaceService;
  }

  async getSuggestions(query: string): Promise<SuggestionItem<WorkspaceSuggestionItem>[]> {
    // Get all workspaces sorted by last accessed
    const workspaces = await this.workspaceService.listWorkspaces();

    if (workspaces.length === 0) {
      return [];
    }

    if (!query || query.trim().length === 0) {
      return workspaces
        .slice(0, this.config.maxSuggestions)
        .map(workspace => this.createSuggestion(workspace, 1.0));
    }

    const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
    const suggestions: SuggestionItem<WorkspaceSuggestionItem>[] = [];

    for (const workspace of workspaces) {
      // Try fuzzy match on name first (higher priority)
      const nameMatch = fuzzySearch(workspace.name);
      if (nameMatch) {
        suggestions.push(this.createSuggestion(workspace, nameMatch.score));
        continue;
      }

      // Try fuzzy match on description (lower priority)
      if (workspace.description) {
        const descMatch = fuzzySearch(workspace.description);
        if (descMatch) {
          suggestions.push(this.createSuggestion(workspace, descMatch.score * 0.7));
        }
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSuggestions);
  }

  renderSuggestion(item: SuggestionItem<WorkspaceSuggestionItem>, el: HTMLElement): void {
    el.addClass('workspace-suggester-item');

    const icon = el.createDiv({ cls: 'suggester-icon' });
    setIcon(icon, 'folder-tree');

    const content = el.createDiv({ cls: 'suggester-content' });
    content.createDiv({ cls: 'suggester-title', text: item.data.name });

    if (item.data.description) {
      content.createDiv({ cls: 'suggester-description', text: item.data.description });
    } else {
      content.createDiv({ cls: 'suggester-description', text: item.data.rootFolder });
    }
  }

  selectSuggestion(item: SuggestionItem<WorkspaceSuggestionItem>): void {
    // Add to message enhancer
    const workspaceRef: WorkspaceReference = {
      id: item.data.id,
      name: item.data.name,
      description: item.data.description,
      rootFolder: item.data.rootFolder
    };
    this.messageEnhancer.addWorkspace(workspaceRef);

    // Replace # with styled reference badge
    const cursorPos = ContentEditableHelper.getCursorPosition(this.element);
    const text = ContentEditableHelper.getPlainText(this.element);
    const beforeCursor = text.substring(0, cursorPos);
    const match = /#(\w*)$/.exec(beforeCursor);

    if (match) {
      const start = cursorPos - match[0].length;

      // Delete the trigger text
      ContentEditableHelper.deleteTextAtCursor(this.element, start, cursorPos);

      // Insert styled reference
      ContentEditableHelper.insertReferenceNode(
        this.element,
        'workspace',
        `#${item.data.name.replace(/\s+/g, '_')}`,
        item.data.id
      );
    }
  }

  private createSuggestion(
    workspace: { id: string; name: string; description?: string; rootFolder: string; lastAccessed: number },
    score: number
  ): SuggestionItem<WorkspaceSuggestionItem> {
    return {
      data: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        rootFolder: workspace.rootFolder,
        lastAccessed: workspace.lastAccessed
      },
      score: score,
      displayText: workspace.name,
      description: workspace.description || workspace.rootFolder
    };
  }
}
