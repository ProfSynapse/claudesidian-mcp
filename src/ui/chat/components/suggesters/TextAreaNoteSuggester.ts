/**
 * TextAreaNoteSuggester - Note suggester for textarea
 */

import { App, TFile, prepareFuzzySearch, setIcon } from 'obsidian';
import { TextAreaSuggester } from './TextAreaSuggester';
import {
  SuggestionItem,
  NoteSuggestionItem,
  NoteReference
} from './base/SuggesterInterfaces';
import { MessageEnhancer } from '../../services/MessageEnhancer';
import { TokenCalculator } from '../../utils/TokenCalculator';

export class TextAreaNoteSuggester extends TextAreaSuggester<NoteSuggestionItem> {
  private messageEnhancer: MessageEnhancer;
  private maxTokensPerNote = 10000;
  private triggerStart = 0;

  constructor(app: App, textarea: HTMLTextAreaElement, messageEnhancer: MessageEnhancer) {
    super(app, textarea, {
      trigger: /\[\[([^\]]*?)$/,
      maxSuggestions: 50,
      cacheTTL: 60000,
      debounceDelay: 150
    });

    this.messageEnhancer = messageEnhancer;
  }

  async getSuggestions(query: string): Promise<SuggestionItem<NoteSuggestionItem>[]> {
    const files = this.app.vault.getMarkdownFiles();

    if (!query || query.trim().length === 0) {
      return files
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, this.config.maxSuggestions)
        .map(file => this.createSuggestion(file, 1.0));
    }

    const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
    const suggestions: SuggestionItem<NoteSuggestionItem>[] = [];

    for (const file of files) {
      const basenameMatch = fuzzySearch(file.basename);
      if (basenameMatch) {
        suggestions.push(this.createSuggestion(file, basenameMatch.score));
        continue;
      }

      const pathMatch = fuzzySearch(file.path);
      if (pathMatch) {
        suggestions.push(this.createSuggestion(file, pathMatch.score * 0.8));
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSuggestions);
  }

  renderSuggestion(item: SuggestionItem<NoteSuggestionItem>, el: HTMLElement): void {
    el.addClass('note-suggester-item');

    const icon = el.createDiv({ cls: 'suggester-icon' });
    setIcon(icon, 'file-text');

    const content = el.createDiv({ cls: 'suggester-content' });
    content.createDiv({ cls: 'suggester-title', text: item.data.name });
    content.createDiv({ cls: 'suggester-description', text: item.data.path });

    const badgeContainer = el.createDiv({ cls: 'suggester-badge-container' });
    const sizeKB = (item.data.size / 1024).toFixed(1);
    badgeContainer.createSpan({ cls: 'suggester-badge size-badge', text: `${sizeKB} KB` });

    if (item.data.estimatedTokens > this.maxTokensPerNote * 0.75) {
      const tokenBadge = badgeContainer.createSpan({ cls: 'suggester-badge token-badge-warning' });
      tokenBadge.textContent = `~${item.data.estimatedTokens.toLocaleString()} tokens`;
    }
  }

  async selectSuggestion(item: SuggestionItem<NoteSuggestionItem>): Promise<void> {
    // Read note content
    const content = await this.app.vault.read(item.data.file);
    const tokens = TokenCalculator.estimateTextTokens(content);

    // Add to message enhancer
    const noteRef: NoteReference = {
      path: item.data.path,
      name: item.data.name,
      content: content,
      tokens: tokens
    };
    this.messageEnhancer.addNote(noteRef);

    // Replace [[ with [[note-name]]
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value;
    const beforeCursor = text.substring(0, cursorPos);
    const match = /\[\[([^\]]*)$/.exec(beforeCursor);

    if (match) {
      const start = cursorPos - match[0].length;
      const before = text.substring(0, start);
      const after = text.substring(cursorPos);
      const replacement = `[[${item.data.name}]]`;

      this.textarea.value = before + replacement + after;
      this.textarea.selectionStart = this.textarea.selectionEnd = start + replacement.length;
      this.textarea.dispatchEvent(new Event('input'));
    }
  }

  private createSuggestion(file: TFile, score: number): SuggestionItem<NoteSuggestionItem> {
    const estimatedTokens = Math.ceil(file.stat.size / 4);

    return {
      data: {
        file: file,
        name: file.basename,
        path: file.path,
        size: file.stat.size,
        estimatedTokens: estimatedTokens
      },
      score: score,
      displayText: file.basename,
      description: file.path,
      tokens: estimatedTokens
    };
  }
}
